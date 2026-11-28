import type { Metadata } from 'next';
import { WorkerForm } from '@/components/forms/WorkerForm';
import { Card, PageHeader } from '@/components/ui';
import { requirePageUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Nuevo trabajador' };

export default async function NuevoTrabajadorPage() {
  await requirePageUser('catalogs.write');
  return (
    <>
      <PageHeader title="Nuevo trabajador" />
      <Card title="Datos del trabajador">
        <WorkerForm />
      </Card>
    </>
  );
}
