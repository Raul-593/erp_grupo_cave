import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getWorker } from '@erp/db';
import { WorkerForm } from '@/components/forms/WorkerForm';
import { Card, PageHeader } from '@/components/ui';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Editar trabajador' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarTrabajadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const worker = await getWorker(db(), id);
  if (!worker) notFound();

  return (
    <>
      <PageHeader title="Editar trabajador" subtitle={worker.fullName} />
      <Card title="Datos del trabajador">
        <WorkerForm
          initial={{
            id: worker.id,
            version: String(worker.version),
            fullName: worker.fullName,
            jobTitle: worker.jobTitle ?? '',
            phone: worker.phone ?? '',
            email: worker.email ?? '',
            notes: worker.notes ?? '',
            active: worker.active ? 'on' : '',
          }}
        />
      </Card>
    </>
  );
}
