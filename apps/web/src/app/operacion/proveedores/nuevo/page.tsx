import type { Metadata } from 'next';
import { SupplierForm } from '@/components/forms/SupplierForm';
import { Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Nuevo proveedor' };

export default function NuevoProveedorPage() {
  return (
    <>
      <PageHeader title="Nuevo proveedor" />
      <Card title="Datos del proveedor">
        <SupplierForm />
      </Card>
    </>
  );
}
