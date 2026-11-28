import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getUser } from '@erp/db';
import { UserForm } from '@/components/forms/UserForm';
import { Card, PageHeader } from '@/components/ui';
import { configuredAuthProvider } from '@/integrations/auth/config';
import { requirePageUser } from '@/server/auth';
import { db } from '@/server/db';
import { UUID } from '@/server/http';
import { userFormOptions } from '@/server/user-form-options';

export const metadata: Metadata = { title: 'Editar usuario' };

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser('users.manage');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getUser(db(), id);
  if (!user) notFound();
  const options = await userFormOptions(user);

  return (
    <>
      <PageHeader title="Editar usuario" subtitle={user.fullName} />
      <Card title="Datos del usuario">
        <UserForm
          workers={options.workers}
          suppliers={options.suppliers}
          credentials={configuredAuthProvider() === 'supabase'}
          initial={{
            id: user.id,
            version: String(user.version),
            fullName: user.fullName,
            email: user.email ?? '',
            role: user.role,
            workerId: user.workerId ?? '',
            supplierId: user.supplierId ?? '',
            active: user.active ? 'on' : '',
          }}
        />
      </Card>
    </>
  );
}
