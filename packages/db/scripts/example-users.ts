/**
 * Crea usuarios de ejemplo a partir de los trabajadores y proveedores que ya están en la base
 * (decisión del usuario, 2026-11-27: usar los datos de ejemplo hasta cargar los reales en
 * Supabase). Solo esquema de desarrollo; idempotente: no toca a quien ya tiene usuario.
 *
 *   pnpm db:users:example --admin="Nombre" --accounting="Nombre"          (simulación)
 *   pnpm db:users:example --admin="Nombre" --accounting="Nombre" --apply  (escribe)
 *
 * - Cada trabajador activo sin usuario recibe uno de empleado de campo, salvo los indicados en
 *   --admin (superusuario) y --accounting (contabilidad), que quedan vinculados a su trabajador.
 * - Cada proveedor activo que no es de nómina recibe un usuario de proveedor.
 * - Sin correo: el ingreso de desarrollo no lo necesita; los usuarios reales se cargan después.
 */
import { parseArgs } from 'node:util';
import { createPool, createUser, listSuppliers, listUsers, listWorkers, loadDbConfig, recordAudit, withTransaction, type UserRole } from '../src/index.ts';

const { values } = parseArgs({
  options: {
    admin: { type: 'string', multiple: true, default: [] },
    accounting: { type: 'string', multiple: true, default: [] },
    apply: { type: 'boolean', default: false },
  },
});

const normalize = (name: string) => name.trim().toLocaleLowerCase('es');
const ROLE_NAMES: Record<UserRole, string> = { admin: 'superusuario', field: 'campo', accounting: 'contabilidad', supplier: 'proveedor' };

async function main(): Promise<void> {
  const config = loadDbConfig('dev');
  const pool = createPool(config, { max: 1 });
  try {
    const [workers, suppliers, users] = await Promise.all([listWorkers(pool), listSuppliers(pool), listUsers(pool)]);
    const byName = new Map(workers.filter((w) => w.active).map((w) => [normalize(w.fullName), w]));
    const roleOf = new Map<string, UserRole>();
    for (const [role, names] of [['admin', values.admin], ['accounting', values.accounting]] as const) {
      for (const name of names) {
        const worker = byName.get(normalize(name));
        if (!worker) throw new Error(`No hay un trabajador activo llamado «${name}».`);
        roleOf.set(worker.id, role);
      }
    }

    const linkedWorkers = new Set(users.map((u) => u.workerId).filter(Boolean));
    const linkedSuppliers = new Set(users.map((u) => u.supplierId).filter(Boolean));
    const plan: { fullName: string; role: UserRole; workerId: string | null; supplierId: string | null }[] = [];
    for (const worker of workers) {
      if (!worker.active || linkedWorkers.has(worker.id)) continue;
      plan.push({ fullName: worker.fullName, role: roleOf.get(worker.id) ?? 'field', workerId: worker.id, supplierId: null });
    }
    for (const supplier of suppliers) {
      if (!supplier.active || supplier.kind === 'payroll' || linkedSuppliers.has(supplier.id)) continue;
      plan.push({ fullName: supplier.name, role: 'supplier', workerId: null, supplierId: supplier.id });
    }

    const hasAdmin = users.some((u) => u.role === 'admin' && u.active) || plan.some((p) => p.role === 'admin');
    if (!hasAdmin) throw new Error('No habría ningún superusuario activo: indique --admin="Nombre del trabajador".');

    console.log(`Esquema "${config.schema}". Usuarios existentes: ${users.length}. Por crear: ${plan.length}.`);
    for (const entry of plan) console.log(`  ${ROLE_NAMES[entry.role].padEnd(13)} ${entry.fullName}`);
    if (plan.length === 0) {
      console.log('Nada que crear.');
      return;
    }
    if (!values.apply) {
      console.log('\nSimulación: no se escribió nada. Repita con --apply para crearlos.');
      return;
    }

    await withTransaction(pool, async (tx) => {
      const created: { id: string; role: UserRole; fullName: string }[] = [];
      for (const entry of plan) created.push({ id: await createUser(tx, { ...entry, email: null, active: true }), role: entry.role, fullName: entry.fullName });
      // La auditoría necesita un autor: el primer superusuario (existente o recién creado).
      const author = users.find((u) => u.role === 'admin' && u.active)?.id ?? created.find((c) => c.role === 'admin')?.id;
      if (!author) throw new Error('Sin superusuario para registrar el historial.');
      for (const user of created) {
        await recordAudit(tx, {
          userId: author,
          action: 'user.create',
          entity: 'app_users',
          entityId: user.id,
          details: { role: user.role, fullName: user.fullName, source: 'db:users:example' },
        });
      }
    });
    console.log(`\nCreados ${plan.length} usuarios.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
