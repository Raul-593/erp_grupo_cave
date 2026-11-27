import type { Metadata } from 'next';
import Link from 'next/link';
import { listPayments, listPurchaseOrders, listWorkers } from '@erp/db';
import { DeletePaymentButton, NewOrderForm, OrderCells } from '@/components/operacion/procurement';
import { DemoBanner, Kpis, ModuleEmpty, SupplierName } from '@/components/operacion/shared';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { formatAmount, formatDayMonth } from '@/lib/format';
import { ITEM_PAYMENT_STATUS, PAYMENT_METHOD, PAYMENT_SUPPORT } from '@/lib/labels';
import { compareAmounts, percentOf, sumAmounts } from '@/lib/money';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { loadMatrixView } from '@/server/matrix';

export const metadata: Metadata = { title: 'Abastecimiento' };

const TITLE = 'Abastecimiento';
const SUBTITLE = 'Lo que ya se compró y cómo se está pagando: las órdenes de cada entregable y los pagos registrados contra ellas.';

export default async function AbastecimientoPage() {
  const project = await getCurrentProject();
  if (!project) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="project" />;
  const view = await loadMatrixView(project.id);
  if (!view) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="matrix" />;

  const [payments, orders, workers] = await Promise.all([
    listPayments(db(), project.id),
    listPurchaseOrders(db(), project.id),
    listWorkers(db(), { onlyActive: true }),
  ]);
  const { items, totals } = view;
  const money = (amount: string | null) => formatAmount(amount, project.currency);
  const symbol = project.currency === null || project.currency === 'USD' ? '$' : project.currency;
  const paidPercent = percentOf(totals.paidAmount, totals.orderedAmount);
  const paymentsTotal = sumAmounts(payments.map((payment) => payment.amount));
  const unreconciled = payments.length > 0 && compareAmounts(paymentsTotal, totals.paidAmount) !== 0;
  // Lo comprometido por ítem: el monto de su orden o, si aún no tiene orden, su costo asignado.
  const committedTotal = sumAmounts([totals.orderedAmount, totals.unorderedCost]);
  const orderOptions = orders.map((order) => ({ id: order.id, name: order.code }));
  const workerOptions = workers.map((worker) => ({ id: worker.id, name: worker.fullName }));
  const emptyOrders = orders.filter((order) => order.lineCount === 0).map((order) => order.code);

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle={SUBTITLE}
        actions={
          orders.length > 0 ? (
            <Link href="/operacion/abastecimiento/pagos/nuevo" className="btn btn-p">
              Registrar pago
            </Link>
          ) : undefined
        }
      />
      {view.demo ? <DemoBanner source={view.matrix.model} /> : null}
      <Kpis
        items={[
          { label: 'Órdenes emitidas', value: totals.orderCount, hint: money(totals.orderedAmount) },
          {
            label: 'Pagado',
            value: money(totals.paidAmount),
            hint: paidPercent === null ? undefined : `${paidPercent.toLocaleString('es-EC')}% de lo ordenado`,
            tone: 'ok',
          },
          {
            label: 'Saldo por pagar',
            value: money(totals.outstandingAmount),
            hint: compareAmounts(totals.unorderedCost, '0') > 0 ? `incluye ${money(totals.unorderedCost)} sin orden` : undefined,
            tone: 'ba',
          },
          { label: 'Compras internas', value: money(totals.holdingAmount), hint: 'a empresas del holding', tone: 'vi' },
        ]}
      />

      <Card title="Órdenes por entregable">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Ítem</th>
                <th scope="col">Producto</th>
                <th scope="col">Proveedor</th>
                <th scope="col">Orden</th>
                <th scope="col">R. de compra</th>
                <th scope="col">R. de pago</th>
                <th scope="col" className="num">
                  Costo
                </th>
                <th scope="col" className="num">
                  Pagado
                </th>
                <th scope="col" className="num">
                  Saldo
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const [label, tone] = ITEM_PAYMENT_STATUS[item.paymentStatus];
                const ordered = item.orderCode !== null;
                return (
                  <tr key={item.id}>
                    <td>
                      <b className="font-semibold tabular-nums">{item.code}</b>
                    </td>
                    <td>{item.producto}</td>
                    <td>
                      <SupplierName name={item.supplierName} kind={item.supplierKind} />
                    </td>
                    <OrderCells
                      itemId={item.id}
                      itemLabel={item.code}
                      orderId={item.orderId}
                      orders={orderOptions}
                      lineVersion={item.lineVersion}
                      amount={item.orderAmount}
                      paidAmount={item.paidAmount}
                      plannedCostText={money(item.plannedCost)}
                      balanceText={money(ordered ? item.balance : item.plannedCost)}
                      paymentWorkerId={item.paymentWorkerId}
                      paymentWorkerName={item.paymentWorkerName}
                      workers={workerOptions}
                      buyerName={item.workerName}
                      currencySymbol={symbol}
                      status={<Pill tone={tone}>{label}</Pill>}
                    />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-bg font-semibold">
                <td className="border-t border-line2" colSpan={6}>
                  Total
                </td>
                <td className="num border-t border-line2">{money(committedTotal)}</td>
                <td className="num border-t border-line2">{money(totals.paidAmount)}</td>
                <td className="num border-t border-line2">{money(totals.outstandingAmount)}</td>
                <td className="border-t border-line2" />
              </tr>
            </tfoot>
          </table>
        </div>
        <NewOrderForm projectId={project.id} />
        {emptyOrders.length > 0 ? (
          <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-mut">
            {emptyOrders.length === 1 ? 'Orden sin ítems todavía: ' : 'Órdenes sin ítems todavía: '}
            <b className="font-semibold text-ink2">{emptyOrders.join(', ')}</b>
          </p>
        ) : null}
      </Card>

      <Card
        title="Pagos registrados"
        actions={
          orders.length > 0 ? (
            <Link href="/operacion/abastecimiento/pagos/nuevo" className="btn">
              + Pago
            </Link>
          ) : undefined
        }
      >
        {payments.length === 0 ? (
          <EmptyState icon="◷" title="Sin pagos registrados">
            <p>{orders.length > 0 ? 'Registra el primer pago contra una orden.' : 'Crea primero una orden de compra.'}</p>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Orden</th>
                  <th scope="col">Concepto</th>
                  <th scope="col">Forma</th>
                  <th scope="col" className="num">
                    Monto
                  </th>
                  <th scope="col">Respaldo</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const [label, tone] = PAYMENT_SUPPORT[payment.support];
                  return (
                    <tr key={payment.id}>
                      <td className="whitespace-nowrap">{formatDayMonth(payment.paidOn)}</td>
                      <td className="text-mut tabular-nums">{payment.orderCode}</td>
                      <td>{payment.concept}</td>
                      <td>{PAYMENT_METHOD[payment.method]}</td>
                      <td className="num">{money(payment.amount)}</td>
                      <td>
                        <Pill tone={tone}>{label}</Pill>
                      </td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-[7px]">
                          <Link href={`/operacion/abastecimiento/pagos/${payment.id}/editar`} className="btn">
                            Editar
                          </Link>
                          <div>
                            <DeletePaymentButton
                              id={payment.id}
                              version={payment.version}
                              summary={`de ${money(payment.amount)} (${payment.orderCode}, ${formatDayMonth(payment.paidOn)})`}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-bg font-semibold">
                  <td className="border-t border-line2" colSpan={4}>
                    Total de pagos
                  </td>
                  <td className="num border-t border-line2">{money(paymentsTotal)}</td>
                  <td className="border-t border-line2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {unreconciled ? (
        <Note>
          Los pagos registrados suman <b>{money(paymentsTotal)}</b> y lo pagado por ítem suma <b>{money(totals.paidAmount)}</b>. Por ahora
          son dos registros independientes: lo pagado de cada ítem se escribe a mano en la tabla de órdenes. El cálculo automático a
          partir de los pagos llegará con una migración posterior.
        </Note>
      ) : null}
      <Note>
        Orden, responsable de pago, costo y pagado se guardan al cambiarlos (los importes, al salir del campo o con Enter). Lo pagado no
        puede superar el costo, y un ítem con algo pagado no se puede quitar de su orden.
      </Note>
    </>
  );
}
