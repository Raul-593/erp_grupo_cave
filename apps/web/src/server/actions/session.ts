'use server';

import { redirect } from 'next/navigation';
import { getUser, recordAudit, recordLogin, withTransaction } from '@erp/db';
import { homePath } from '@/domain/access/permissions';
import { authProvider, devAuthProvider } from '@/integrations/auth/config';
import { AuthConfigError } from '@/integrations/auth/types';
import { getSessionUser } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { idSchema } from '../schemas';

/**
 * «Entrar como…» (solo desarrollo local, decisión U-D1). `authProvider()` rechaza el ingreso
 * si la base no es local, si la petición no llega a 127.0.0.1 o si corre en un hosting.
 */
export async function signInAsDev(_prev: { message: string } | null, formData: FormData): Promise<{ message: string } | null> {
  const id = idSchema('Usuario').safeParse(formData.get('userId'));
  if (!id.success) return { message: 'Elige un usuario.' };
  let target: string;
  try {
    const provider = await authProvider();
    if (provider.id !== 'dev') return { message: 'El ingreso sin contraseña no está disponible.' };
    const user = await getUser(db(), id.data);
    if (!user || !user.active) return { message: 'Ese usuario no existe o está desactivado.' };
    await withTransaction(db(), async (tx) => {
      await recordLogin(tx, user.id);
      await recordAudit(tx, { userId: user.id, action: 'session.sign_in', entity: 'app_users', entityId: user.id, details: { provider: 'dev' } });
    });
    await devAuthProvider.signInAs(user.id);
    target = homePath(user.role);
  } catch (error) {
    if (error instanceof AuthConfigError) return { message: error.message };
    return { message: toUserMessage(error) };
  }
  redirect(target);
}

/** Cierra la sesión y vuelve a «Entrar». */
export async function signOut(): Promise<void> {
  const user = await getSessionUser();
  try {
    const provider = await authProvider();
    if (user) {
      await recordAudit(db(), { userId: user.id, action: 'session.sign_out', entity: 'app_users', entityId: user.id });
    }
    await provider.signOut();
  } catch (error) {
    if (!(error instanceof AuthConfigError)) toUserMessage(error);
    await devAuthProvider.signOut();
  }
  redirect('/entrar');
}
