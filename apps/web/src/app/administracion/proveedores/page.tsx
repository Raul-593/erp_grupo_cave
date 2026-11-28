import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { listSuppliers } from '@erp/db';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { SUPPLIER_KIND } from '@/lib/labels';
import { setSupplierActive } from '@/server/actions/suppliers';
import { can } from '@/domain/access/permissions';
import { requirePageUser } from '@/server/auth';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Proveedores' };

export default async function ProveedoresPage() {
  await connection();
  const user = await requirePageUser('catalogs.read');
  const canWrite = can(user.role, 'catalogs.write');
  const suppliers = await listSuppliers(db());
  const active = suppliers.filter((supplier) => supplier.active).length;

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle="Las empresas y personas a las que se adjudica un ítem en Planificación. Solo los activos aparecen en la lista desplegable."
        actions={
          canWrite ? (
            <Link href="/administracion/proveedores/nuevo" className="btn btn-p">
              + Nuevo proveedor
            </Link>
          ) : undefined
        }
      />
      <Card title={suppliers.length ? `${active} activos de ${suppliers.length}` : undefined}>
        {suppliers.length === 0 ? (
          <EmptyState icon="◎" title="Sin proveedores">
            <p>Registra a los proveedores para poder adjudicarles ítems.</p>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">RUC</th>
                  <th scope="col" className="num">
                    Ítems y cotizaciones
                  </th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <b className="font-semibold">{supplier.name}</b>
                    </td>
                    <td>
                      {supplier.kind === 'holding' ? (
                        <Pill tone="vi">{SUPPLIER_KIND.holding}</Pill>
                      ) : (
                        SUPPLIER_KIND[supplier.kind]
                      )}
                    </td>
                    <td className="text-ink2 tabular-nums">{supplier.taxId ?? '—'}</td>
                    <td className="num">{supplier.usageCount}</td>
                    <td>{supplier.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>}</td>
                    <td>
                      {canWrite ? (
                        <div className="flex justify-end gap-1.75">
                          <Link href={`/administracion/proveedores/${supplier.id}/editar`} className="btn">
                            Editar
                          </Link>
                          <form action={setSupplierActive}>
                            <input type="hidden" name="id" value={supplier.id} />
                            <input type="hidden" name="version" value={supplier.version} />
                            <input type="hidden" name="active" value={supplier.active ? 'false' : 'true'} />
                            <button type="submit" className="btn">
                              {supplier.active ? 'Desactivar' : 'Activar'}
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
        Los proveedores no se eliminan: se desactivan. Un proveedor desactivado deja de aparecer en la lista, pero conserva los
        ítems que ya tenía adjudicados.
      </Note>
    </>
  );
}
