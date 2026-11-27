import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { listUsers, USER_ROLES } from '@erp/db';
import { SignInForm } from '@/components/session/SignInForm';
import { homePath, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/access/permissions';
import { authProvider } from '@/integrations/auth/config';
import { AuthConfigError } from '@/integrations/auth/types';
import { getSessionUser } from '@/server/auth';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Entrar' };

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4">
      <section className="card w-full max-w-[440px]">
        <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <div className="grid size-[26px] flex-none place-items-center rounded-[7px] bg-bl text-xs font-semibold text-white">C</div>
          <div>
            <b className="text-sm font-semibold tracking-[0.06em]">CAVE ERP</b>
            <span className="mt-px block text-[9px] tracking-[0.14em] text-mut2 uppercase">Ingreso</span>
          </div>
        </header>
        <div className="grid gap-4 px-5 py-5">{children}</div>
      </section>
    </main>
  );
}

/**
 * Ingreso de desarrollo (decisión U-D1): sin contraseña y solo en este computador con la base
 * local. El ingreso con correo y contraseña llega con Supabase Auth (parte S del plan).
 */
export default async function EntrarPage() {
  await connection();
  let problem: string | null = null;
  try {
    await authProvider();
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    problem = error.message;
  }
  if (problem) {
    return (
      <Frame>
        <p className="text-[12.5px] font-semibold text-ba">No se puede entrar en este entorno.</p>
        <p className="text-[12.5px] text-mut">{problem}</p>
      </Frame>
    );
  }

  const current = await getSessionUser();
  const users = await listUsers(db(), { onlyActive: true });
  const groups = USER_ROLES.map((role) => ({
    label: ROLE_LABELS[role],
    users: users
      .filter((user) => user.role === role)
      .map((user) => ({
        id: user.id,
        label: user.supplierName && user.supplierName !== user.fullName ? `${user.fullName} · ${user.supplierName}` : user.fullName,
      })),
  })).filter((group) => group.users.length > 0);

  return (
    <Frame>
      <p className="rounded-md bg-wab px-3 py-2 text-[11.5px] text-wa">
        Ingreso de desarrollo sin contraseña: solo funciona en este computador y con la base de datos local. El ingreso con correo y
        contraseña se activará al migrar a Supabase.
      </p>
      {current ? (
        <p className="text-[12.5px]">
          Ya entraste como <b className="font-semibold">{current.fullName}</b> ({ROLE_LABELS[current.role]}).{' '}
          <Link href={homePath(current.role)} className="text-bl hover:underline">
            Continuar
          </Link>
        </p>
      ) : null}
      {groups.length > 0 ? (
        <SignInForm groups={groups} />
      ) : (
        <p className="text-[12.5px] text-mut">
          Todavía no hay usuarios activos. Créalos con <code>pnpm db:users:example</code> (ver MEMORY.md).
        </p>
      )}
      <ul className="grid gap-1.5 border-t border-line pt-3 text-[11.5px] text-mut">
        {USER_ROLES.map((role) => (
          <li key={role}>
            <b className="font-semibold text-ink2">{ROLE_LABELS[role]}:</b> {ROLE_DESCRIPTIONS[role]}
          </li>
        ))}
      </ul>
    </Frame>
  );
}
