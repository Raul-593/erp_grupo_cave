import type { Metadata } from 'next';
import { listClients } from '@erp/db';
import { ProjectForm } from '@/components/forms/ProjectForm';
import { Card, PageHeader } from '@/components/ui';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Nuevo proyecto' };

export default async function NuevoProyectoPage() {
  const clients = await listClients(db());
  return (
    <>
      <PageHeader
        title="Nuevo proyecto"
        subtitle="Datos mínimos para empezar. El resto de la ficha (proceso, objeto, plazo) se completa en Requerimiento, a mano o desde el TDR."
      />
      <Card title="Datos del proyecto">
        <ProjectForm clients={clients.map(({ id, name, taxId }) => ({ id, name, taxId }))} />
      </Card>
    </>
  );
}
