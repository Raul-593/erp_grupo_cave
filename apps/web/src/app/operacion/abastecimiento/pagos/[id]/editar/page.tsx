import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPayment, getProject, listOrderLines, listPurchaseOrders } from '@erp/db';
import { PaymentForm } from '@/components/operacion/payment-form';
import { Card, PageHeader } from '@/components/ui';
import { ALLOCATION_PREFIX } from '@/lib/constants';
import { formatAmount } from '@/lib/format';
import { subtractAmounts } from '@/lib/money';
import { db } from '@/server/db';
import { loadMatrixView } from '@/server/matrix';

export const metadata: Metadata = { title: 'Editar pago' };

/** Importe como se escribe en un campo: «8.400,50», sin símbolo de moneda. */
const amountText = (amount: string) => formatAmount(amount, 'USD').slice(1);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarPagoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const payment = await getPayment(db(), id);
  if (!payment) notFound();
  // Las órdenes y los ítems del proyecto del pago (no los del proyecto seleccionado arriba).
  const [orders, lines, view, project] = await Promise.all([
    listPurchaseOrders(db(), payment.projectId),
    listOrderLines(db(), payment.projectId),
    loadMatrixView(payment.projectId),
    getProject(db(), payment.projectId),
  ]);
  const own = new Map(payment.allocations.map((allocation) => [allocation.itemId, allocation.amount]));

  return (
    <>
      <PageHeader title="Editar pago" subtitle={payment.concept} />
      <Card title="Datos del pago">
        <PaymentForm
          orders={orders.map((order) => ({ id: order.id, name: order.code }))}
          lines={lines.map((line) => ({
            orderId: line.orderId,
            itemId: line.itemId,
            code: view?.codes.get(line.itemId) ?? String(line.itemNumber),
            producto: line.producto,
            amount: line.amount,
            // Lo pagado del ítem sin contar la parte de este mismo pago.
            paidByOthers: subtractAmounts(line.paidAmount, own.get(line.itemId) ?? '0'),
          }))}
          currency={project?.currency ?? null}
          initial={{
            id: payment.id,
            version: String(payment.version),
            orderId: payment.orderId,
            paidOn: payment.paidOn,
            concept: payment.concept,
            method: payment.method,
            amount: amountText(payment.amount),
            support: payment.support,
            ...Object.fromEntries(payment.allocations.map((allocation) => [`${ALLOCATION_PREFIX}${allocation.itemId}`, amountText(allocation.amount)])),
          }}
        />
      </Card>
    </>
  );
}
