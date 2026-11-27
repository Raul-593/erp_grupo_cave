import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { listWorkers } from '@erp/db';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { setWorkerActive } from '@/server/actions/workers';
import { can } from '@/domain/access/permissions';
import { requirePageUser } from '@/server/auth';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Trabajadores' };

export default async function TrabajadoresPage() {
  await connection();
  const user = await requirePageUser('catalogs.read');
  const canWrite = can(user.role, 'catalogs.write');
  const workers = await listWorkers(db());
  const active = workers.filter((worker) => worker.active).length;

  return (
    <>
      <PageHeader
        title="Trabajadores"
        subtitle="Las personas que pueden ser responsables de un ítem de la matriz. Solo los activos aparecen en la lista desplegable."
        actions={
          canWrite ? (
            <Link href="/operacion/trabajadores/nuevo" className="btn btn-p">
              + Nuevo trabajador
            </Link>
          ) : undefined
        }
      />
      <Card title={workers.length ? `${active} activos de ${workers.length}` : undefined}>
        {workers.length === 0 ? (
          <EmptyState icon="◎" title="Sin trabajadores">
            <p>Registra a las personas del equipo para poder asignarlas como responsables.</p>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Cargo</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Correo</th>
                  <th scope="col" className="num">
                    Ítems asignados
                  </th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker.id}>
                    <td>
                      <b className="font-semibold">{worker.fullName}</b>
                    </td>
                    <td className="text-ink2">{worker.jobTitle ?? '—'}</td>
                    <td className="text-ink2">{worker.phone ?? '—'}</td>
                    <td className="text-ink2">{worker.email ?? '—'}</td>
                    <td className="num">{worker.assignmentCount}</td>
                    <td>{worker.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>}</td>
                    <td>
                      {canWrite ? (
                        <div className="flex justify-end gap-[7px]">
                          <Link href={`/operacion/trabajadores/${worker.id}/editar`} className="btn">
                            Editar
                          </Link>
                          <form action={setWorkerActive}>
                            <input type="hidden" name="id" value={worker.id} />
                            <input type="hidden" name="version" value={worker.version} />
                            <input type="hidden" name="active" value={worker.active ? 'false' : 'true'} />
                            <button type="submit" className="btn">
                              {worker.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note>
        Los trabajadores no se eliminan: se desactivan. Un trabajador desactivado deja de aparecer en la lista de responsables,
        pero conserva los ítems que ya tenía asignados.
      </Note>
    </>
  );
}
