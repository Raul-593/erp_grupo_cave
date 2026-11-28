/**
 * Primer superusuario en Supabase (PLAN.md, parte S). La cuenta de ingreso la crea la persona
 * en el panel de Supabase (Authentication › Users › Add user, con su contraseña y «Auto Confirm
 * User»): este script no recibe ni ve contraseñas. Solo la vincula como superusuario.
 *
 *   pnpm db:supabase:admin --email=persona@empresa.com --name="Nombre Apellido"
 *
 * Los demás usuarios se crean desde Administración › Usuarios con ese superusuario.
 */
import { parseArgs } from 'node:util';
import { createPool, loadDbConfig, recordAudit, withTransaction } from '@erp/db';
import { supabaseAdminClient } from '../src/integrations/storage/supabase.ts';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env.`);
  return value;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !name) throw new Error('Indique --email y --name.');

  const admin = supabaseAdminClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY')).auth.admin;
  let authSubject: string | null = null;
  for (let page = 1; page <= 50 && !authSubject; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`No se pudo consultar Supabase Auth (${error.message}).`);
    authSubject = data.users.find((user) => user.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!authSubject) {
    throw new Error(`No existe una cuenta de ingreso con ${email}. Créala en Supabase › Authentication › Users › Add user.`);
  }

  const pool = createPool(loadDbConfig('supabase'), { max: 1 });
  try {
    const result = await withTransaction(pool, async (tx) => {
      const existing = await tx.query<{ id: string; role: string }>(`SELECT id, role FROM app_users WHERE auth_subject = $1 OR email = $2`, [
        authSubject,
        email,
      ]);
      if (existing.rows[0]) return { created: false, id: existing.rows[0].id, role: existing.rows[0].role };
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO app_users (full_name, email, role, auth_subject, active) VALUES ($1, $2, 'admin', $3, true) RETURNING id`,
        [name, email, authSubject],
      );
      const id = rows[0]!.id;
      await recordAudit(tx, { userId: id, action: 'user.bootstrap_admin', entity: 'app_users', entityId: id, details: { email } });
      return { created: true, id, role: 'admin' };
    });
    console.log(
      result.created
        ? `Superusuario ${name} (${email}) creado. Ya puede entrar con su correo y contraseña.`
        : `Ya existe un usuario con ese correo o cuenta (tipo ${result.role}). No se hizo nada.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
