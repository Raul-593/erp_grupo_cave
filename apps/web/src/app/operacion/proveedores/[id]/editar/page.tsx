import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSupplier } from '@erp/db';
import { SupplierForm } from '@/components/forms/SupplierForm';
import { Card, PageHeader } from '@/components/ui';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Editar proveedor' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supplier = await getSupplier(db(), id);
  if (!supplier) notFound();

  return (
    <>
      <PageHeader title="Editar proveedor" subtitle={supplier.name} />
      <Card title="Datos del proveedor">
        <SupplierForm
          initial={{
            id: supplier.id,
            version: String(supplier.version),
            name: supplier.name,
            kind: supplier.kind,
            taxId: supplier.taxId ?? '',
            notes: supplier.notes ?? '',
            active: supplier.active ? 'on' : '',
          }}
        />
      </Card>
    </>
  );
}
