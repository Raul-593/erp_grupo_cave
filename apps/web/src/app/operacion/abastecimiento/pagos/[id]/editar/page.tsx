import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPayment, listPurchaseOrders } from '@erp/db';
import { PaymentForm } from '@/components/operacion/procurement';
import { Card, PageHeader } from '@/components/ui';
import { formatAmount } from '@/lib/format';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Editar pago' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarPagoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const payment = await getPayment(db(), id);
  if (!payment) notFound();
  // Las órdenes del proyecto del pago (no las del proyecto seleccionado arriba).
  const orders = await listPurchaseOrders(db(), payment.projectId);

  return (
    <>
      <PageHeader title="Editar pago" subtitle={payment.concept} />
      <Card title="Datos del pago">
        <PaymentForm
          orders={orders.map((order) => ({ id: order.id, name: order.code }))}
          initial={{
            id: payment.id,
            version: String(payment.version),
            orderId: payment.orderId,
            paidOn: payment.paidOn,
            concept: payment.concept,
            method: payment.method,
            amount: formatAmount(payment.amount, 'USD').slice(1),
            support: payment.support,
          }}
        />
      </Card>
    </>
  );
}
