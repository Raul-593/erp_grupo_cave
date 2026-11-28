import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/session/AuthFrame';
import { ChangePasswordForm } from '@/components/session/PasswordForms';
import { homePath } from '@/domain/access/permissions';
import { configuredAuthProvider } from '@/integrations/auth/config';
import { MIN_PASSWORD_LENGTH } from '@/integrations/auth/supabase';
import { getSession } from '@/server/auth';
import { signOut } from '@/server/actions/session';

export const metadata: Metadata = { title: 'Cambiar contraseña' };

/** Cambio de la contraseña propia (Supabase Auth). Obligatorio tras una contraseña temporal. */
export default async function CambiarContrasenaPage() {
  const session = await getSession();
  if (!session) redirect('/entrar');
  if (configuredAuthProvider() !== 'supabase') redirect(homePath(session.user.role));
  return (
    <AuthFrame subtitle="Cambiar contraseña">
      <p className="text-[12.5px]">
        Hola, <b className="font-semibold">{session.user.fullName}</b>.{' '}
        {session.mustChangePassword
          ? 'Entraste con una contraseña temporal: elige una propia para continuar.'
          : 'Elige tu contraseña nueva.'}
      </p>
      <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[12px]">
        {!session.mustChangePassword ? (
          <Link href={homePath(session.user.role)} className="text-bl hover:underline">
            Volver
          </Link>
        ) : null}
        <form action={signOut} className="ml-auto">
          <button type="submit" className="text-mut hover:underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </AuthFrame>
  );
}
