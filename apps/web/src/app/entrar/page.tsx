import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { listUsers, USER_ROLES } from '@erp/db';
import { AuthFrame as Frame } from '@/components/session/AuthFrame';
import { PasswordSignInForm } from '@/components/session/PasswordForms';
import { SignInForm } from '@/components/session/SignInForm';
import { homePath, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/access/permissions';
import { authProvider } from '@/integrations/auth/config';
import { AuthConfigError } from '@/integrations/auth/types';
import { getSessionUser } from '@/server/auth';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Entrar' };

/**
 * Ingreso. Con Supabase Auth (parte S): correo y contraseña. En desarrollo (decisión U-D1):
 * «Entrar como…» sin contraseña, solo en este computador y con la base local.
 */
export default async function EntrarPage() {
  await connection();
  let problem: string | null = null;
  let providerId: string | null = null;
  try {
    providerId = (await authProvider()).id;
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
  if (providerId === 'supabase') {
    return (
      <Frame>
        {current ? (
          <p className="text-[12.5px]">
            Ya entraste como <b className="font-semibold">{current.fullName}</b>.{' '}
            <Link href={homePath(current.role)} className="text-bl hover:underline">
              Continuar
            </Link>
          </p>
        ) : null}
        <PasswordSignInForm />
      </Frame>
    );
  }
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
