import type { Metadata } from 'next';
import Link from 'next/link';
import { listPayments, listPurchaseOrders, listWorkers } from '@erp/db';
import { DeletePaymentButton, NewOrderForm, OrderCells } from '@/components/operacion/procurement';
import { EventTabs } from '@/components/operacion/events';
import { DemoBanner, Kpis, ModuleEmpty, SupplierName } from '@/components/operacion/shared';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { formatAmount, formatDayMonth } from '@/lib/format';
import { ITEM_PAYMENT_STATUS, PAYMENT_METHOD, PAYMENT_SUPPORT } from '@/lib/labels';
import { compareAmounts, percentOf, sumAmounts } from '@/lib/money';
import { compactCodes } from '@/lib/numbering';
import { can } from '@/domain/access/permissions';
import { requirePageUser } from '@/server/auth';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { loadMatrixView } from '@/server/matrix';

export const metadata: Metadata = { title: 'Abastecimiento' };

const TITLE = 'Abastecimiento';
const SUBTITLE =
  'Lo que ya se compró y cómo se está pagando: las órdenes de cada entregable y los pagos registrados contra ellas, repartidos entre sus ítems.';

export default async function AbastecimientoPage({ searchParams }: { searchParams: Promise<{ evento?: string | string[] }> }) {
  // Superusuario: edita. Contabilidad: solo lectura (U-D6). Campo y proveedor no entran.
  const user = await requirePageUser('procurement.read');
  const canWrite = can(user.role, 'procurement.write');
  const canCreate = can(user.role, 'projects.write');
  const project = await getCurrentProject();
  if (!project) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="project" canCreate={canCreate} />;
  const view = await loadMatrixView(project.id, user, (await searchParams).evento);
  if (!view) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="matrix" canCreate={canCreate} />;

  const [payments, orders, workers] = await Promise.all([
    listPayments(db(), project.id),
    listPurchaseOrders(db(), project.id),
    listWorkers(db(), { onlyActive: true }),
  ]);
  const { items, totals } = view;
  const money = (amount: string | null) => formatAmount(amount, project.currency);
  const symbol = project.currency === null || project.currency === 'USD' ? '$' : project.currency;
  const paidPercent = percentOf(totals.paidAmount, totals.orderedAmount);
  const unallocated = compareAmounts(totals.unallocatedPayments, '0') > 0;
  // Solo ocurre con datos anteriores al reparto de pagos que aún no se han convertido.
  const manualPaid = compareAmounts(totals.paymentsAmount, sumAmounts([totals.paidAmount, totals.unallocatedPayments])) !== 0;
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
          canWrite && orders.length > 0 ? (
            <Link href="/operacion/abastecimiento/pagos/nuevo" className="btn btn-p">
              Registrar pago
            </Link>
          ) : undefined
        }
      />
      {view.demo ? <DemoBanner source={view.matrix.model} /> : null}
      <EventTabs basePath="/operacion/abastecimiento" events={view.events} current={view.event} />
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
          {
            label: 'Pagos sin repartir',
            value: money(totals.unallocatedPayments),
            hint: unallocated ? 'pagado, aún sin asignar a ítems' : 'todo lo pagado está asignado',
            tone: unallocated ? 'wa' : 'neutral',
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
                    <td>
                      {item.eventId ? (item.subproducto ?? item.producto) : item.producto}
                      {item.eventId && item.subproducto ? <small>{item.producto}</small> : null}
                    </td>
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
                      paidText={money(item.paidAmount)}
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
        {canWrite ? <NewOrderForm projectId={project.id} /> : null}
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
          canWrite && orders.length > 0 ? (
            <Link href="/operacion/abastecimiento/pagos/nuevo" className="btn">
              + Pago
            </Link>
          ) : undefined
        }
      >
        {payments.length === 0 ? (
          <EmptyState icon="◷" title="Sin pagos registrados">
            <p>
              {!canWrite
                ? 'Todavía no hay pagos en este proyecto.'
                : orders.length > 0
                  ? 'Registra el primer pago contra una orden.'
                  : 'Crea primero una orden de compra.'}
            </p>
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
                  <th scope="col">Reparto</th>
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          {payment.itemIds.length > 0 ? (
                            <span className="tabular-nums">
                              {compactCodes(payment.itemIds.map((id) => view.codes.get(id) ?? '?'))}
                            </span>
                          ) : null}
                          {compareAmounts(payment.unallocatedAmount, '0') > 0 ? (
                            <Pill tone="wa">Sin repartir {money(payment.unallocatedAmount)}</Pill>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <Pill tone={tone}>{label}</Pill>
                      </td>
                      <td>
                        {canWrite ? (
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
                        ) : null}
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
                  <td className="num border-t border-line2">{money(totals.paymentsAmount)}</td>
                  <td className="border-t border-line2" colSpan={3}>
                    {unallocated ? <span className="font-normal text-mut">sin repartir {money(totals.unallocatedPayments)}</span> : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {manualPaid ? (
        <Note>
          Hay ítems cuyo «pagado» se escribió a mano antes del reparto de pagos: los pagos suman <b>{money(totals.paymentsAmount)}</b> y lo
          pagado por ítem suma <b>{money(totals.paidAmount)}</b>. Falta ejecutar la conversión que recalcula lo pagado a partir de los pagos.
        </Note>
      ) : null}
      <Note>
        Lo pagado de cada ítem ya no se escribe: es la suma de lo que le reparten los pagos. Para cambiarlo, registra un pago o edita el
        reparto de uno existente. Orden, responsable de pago y costo se guardan al cambiarlos (el costo, al salir del campo o con Enter). A
        un ítem no se le puede pagar más que su costo: primero sube el costo. Un ítem con pagos no se puede quitar ni cambiar de orden, y un
        pago repartido no cambia de orden, hasta quitar el reparto.
      </Note>
    </>
  );
}
