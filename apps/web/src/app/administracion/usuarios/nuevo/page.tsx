import type { Metadata } from 'next';
import { UserForm } from '@/components/forms/UserForm';
import { Card, PageHeader } from '@/components/ui';
import { requirePageUser } from '@/server/auth';
import { userFormOptions } from '@/server/user-form-options';

export const metadata: Metadata = { title: 'Nuevo usuario' };

export default async function NuevoUsuarioPage() {
  await requirePageUser('users.manage');
  const options = await userFormOptions();
  return (
    <>
      <PageHeader title="Nuevo usuario" subtitle="El tipo de usuario define qué puede ver y cambiar." />
      <Card title="Datos del usuario">
        <UserForm workers={options.workers} suppliers={options.suppliers} />
      </Card>
    </>
  );
}
