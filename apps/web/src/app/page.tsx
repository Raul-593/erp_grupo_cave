import { redirect } from 'next/navigation';
import { homePath } from '@/domain/access/permissions';
import { getSessionUser } from '@/server/auth';

/** Lleva a la página de inicio del rol, o a «Entrar» si no hay sesión. */
export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homePath(user.role) : '/entrar');
}
