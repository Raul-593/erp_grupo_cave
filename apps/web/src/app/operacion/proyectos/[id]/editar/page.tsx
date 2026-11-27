import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProject, listClients } from '@erp/db';
import { ProjectForm } from '@/components/forms/ProjectForm';
import { Card, PageHeader } from '@/components/ui';
import { projectValueToForm } from '@/lib/project-value';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Editar proyecto' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [project, clients] = await Promise.all([getProject(db(), id), listClients(db())]);
  if (!project) notFound();

  return (
    <>
      <PageHeader title="Editar proyecto" subtitle={project.name} />
      <Card title="Datos del proyecto">
        <ProjectForm
          clients={clients.map(({ id: clientId, name, taxId }) => ({ id: clientId, name, taxId }))}
          initial={{
            id: project.id,
            version: String(project.version),
            name: project.name,
            clientId: project.clientId,
            startDate: project.startDate ?? '',
            endDate: project.endDate ?? '',
            venues: project.venues.join(', '),
            notes: project.notes ?? '',
            ...projectValueToForm(project),
          }}
        />
      </Card>
    </>
  );
}
