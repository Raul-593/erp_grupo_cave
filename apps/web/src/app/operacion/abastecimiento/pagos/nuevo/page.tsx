import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { listPurchaseOrders } from '@erp/db';
import { PaymentForm } from '@/components/operacion/procurement';
import { Card, PageHeader } from '@/components/ui';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Registrar pago' };

export default async function NuevoPagoPage() {
  const project = await getCurrentProject();
  if (!project) redirect('/operacion/abastecimiento');
  const orders = await listPurchaseOrders(db(), project.id);
  if (orders.length === 0) redirect('/operacion/abastecimiento');

  return (
    <>
      <PageHeader title="Registrar pago" subtitle={project.name} />
      <Card title="Datos del pago">
        <PaymentForm orders={orders.map((order) => ({ id: order.id, name: order.code }))} />
      </Card>
    </>
  );
}
