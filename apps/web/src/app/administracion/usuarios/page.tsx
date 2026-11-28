import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { listUsers } from '@erp/db';
import { UserActiveButton } from '@/components/forms/UserActiveButton';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { ROLE_LABELS } from '@/domain/access/permissions';
import { formatDateTime } from '@/lib/format';
import { requirePageUser } from '@/server/auth';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Usuarios' };

const ROLE_TONES = { admin: 'bl', accounting: 'vi', field: 'ok', supplier: 'wa' } as const;

export default async function UsuariosPage() {
  await connection();
  const me = await requirePageUser('users.manage');
  const users = await listUsers(db());
  const active = users.filter((user) => user.active).length;

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Quién puede entrar al sistema y qué puede hacer. Un empleado de campo trabaja los ítems de su trabajador; un proveedor, solo sus cotizaciones."
        actions={
          <Link href="/administracion/usuarios/nuevo" className="btn btn-p">
            + Nuevo usuario
          </Link>
        }
      />
      <Card title={users.length ? `${active} activos de ${users.length}` : undefined}>
        {users.length === 0 ? (
          <EmptyState icon="◎" title="Sin usuarios" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Vinculado a</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Último ingreso</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <b className="font-semibold">{user.fullName}</b>
                      {user.id === me.id ? <small>Tu usuario</small> : null}
                    </td>
                    <td>
                      <Pill tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Pill>
                    </td>
                    <td className="text-ink2">
                      {user.supplierName ? `Proveedor: ${user.supplierName}` : user.workerName ? `Trabajador: ${user.workerName}` : '—'}
                    </td>
                    <td className="text-ink2">{user.email ?? '—'}</td>
                    <td className="text-ink2">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca'}</td>
                    <td>{user.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>}</td>
                    <td>
                      <div className="flex items-start justify-end gap-1.75">
                        <Link href={`/administracion/usuarios/${user.id}/editar`} className="btn">
                          Editar
                        </Link>
                        <UserActiveButton id={user.id} version={user.version} active={user.active} name={user.fullName} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note>
        Los usuarios no se eliminan: se desactivan. Siempre debe quedar al menos un superusuario activo. Cada cambio queda en el
        historial con el usuario que lo hizo.
      </Note>
    </>
  );
}
