import type { Metadata } from 'next';
import { WorkerForm } from '@/components/forms/WorkerForm';
import { Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Nuevo trabajador' };

export default function NuevoTrabajadorPage() {
  return (
    <>
      <PageHeader title="Nuevo trabajador" />
      <Card title="Datos del trabajador">
        <WorkerForm />
      </Card>
    </>
  );
}
