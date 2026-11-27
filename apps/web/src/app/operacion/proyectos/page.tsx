import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui';
import { formatAmount, formatDateRange } from '@/lib/format';
import { can } from '@/domain/access/permissions';
import { selectProject } from '@/server/actions/projects';
import { requirePageUser } from '@/server/auth';
import { loadProjectContext } from '@/server/current-project';

export const metadata: Metadata = { title: 'Proyectos' };

export default async function ProyectosPage() {
  const user = await requirePageUser('projects.read');
  const { projects, current } = await loadProjectContext(user);
  const canWrite = can(user.role, 'projects.write');

  return (
    <>
      <PageHeader
        title="Proyectos"
        subtitle="Cada proyecto tiene un contratante y su requerimiento. Elige uno para trabajar su TDR."
        actions={
          canWrite ? (
            <Link href="/operacion/proyectos/nuevo" className="btn btn-p">
              + Nuevo proyecto
            </Link>
          ) : undefined
        }
      />
      <Card>
        {projects.length === 0 ? (
          <EmptyState icon="◫" title="Sin proyectos">
            <p>
              {canWrite ? 'Crea el primer proyecto para cargar su TDR.' : 'Todavía no tienes ítems asignados en ningún proyecto.'}
            </p>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Proyecto</th>
                  <th scope="col">Contratante</th>
                  <th scope="col">Fechas</th>
                  <th scope="col">Sedes</th>
                  <th scope="col" className="num">
                    Monto
                  </th>
                  <th scope="col" className="num">
                    TDR
                  </th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <b className="font-semibold">{project.name}</b>
                      {project.id === current?.id ? (
                        <span className="ml-2">
                          <Pill tone="bl">Activo</Pill>
                        </span>
                      ) : null}
                      {project.processCode ? <small>{project.processCode}</small> : null}
                    </td>
                    <td>
                      {project.clientName}
                      {project.clientTaxId ? <small>{project.clientTaxId}</small> : null}
                    </td>
                    <td className="whitespace-nowrap">{formatDateRange(project.startDate, project.endDate)}</td>
                    <td className="text-ink2">{project.venues.length ? project.venues.join(' · ') : '—'}</td>
                    <td className="num">{formatAmount(project.contractAmount, project.currency)}</td>
                    <td className="num">{project.documentCount}</td>
                    <td>
                      <div className="flex justify-end gap-[7px]">
                        <form action={selectProject}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="next" value="requerimiento" />
                          <button type="submit" className="btn btn-g">
                            Requerimiento
                          </button>
                        </form>
                        {canWrite ? (
                          <Link href={`/operacion/proyectos/${project.id}/editar`} className="btn">
                            Editar
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
