import type { Metadata } from 'next';
import { SupplierForm } from '@/components/forms/SupplierForm';
import { Card, PageHeader } from '@/components/ui';
import { requirePageUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Nuevo proveedor' };

export default async function NuevoProveedorPage() {
  await requirePageUser('catalogs.write');
  return (
    <>
      <PageHeader title="Nuevo proveedor" />
      <Card title="Datos del proveedor">
        <SupplierForm />
      </Card>
    </>
  );
}
