import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { listOrderLines, listPurchaseOrders } from '@erp/db';
import { PaymentForm } from '@/components/operacion/payment-form';
import { Card, PageHeader } from '@/components/ui';
import { requirePageUser } from '@/server/auth';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { loadMatrixView } from '@/server/matrix';

export const metadata: Metadata = { title: 'Registrar pago' };

export default async function NuevoPagoPage() {
  await requirePageUser('procurement.write');
  const project = await getCurrentProject();
  if (!project) redirect('/operacion/abastecimiento');
  const [orders, lines, view] = await Promise.all([
    listPurchaseOrders(db(), project.id),
    listOrderLines(db(), project.id),
    loadMatrixView(project.id),
  ]);
  if (orders.length === 0) redirect('/operacion/abastecimiento');

  return (
    <>
      <PageHeader title="Registrar pago" subtitle={project.name} />
      <Card title="Datos del pago">
        <PaymentForm
          orders={orders.map((order) => ({ id: order.id, name: order.code }))}
          lines={lines.map((line) => ({
            orderId: line.orderId,
            itemId: line.itemId,
            code: view?.codes.get(line.itemId) ?? String(line.itemNumber),
            producto: line.producto,
            amount: line.amount,
            paidByOthers: line.paidAmount,
          }))}
          currency={project.currency}
        />
      </Card>
    </>
  );
}
