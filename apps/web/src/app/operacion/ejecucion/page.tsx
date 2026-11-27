import type { Metadata } from 'next';
import Link from 'next/link';
import { listPreEventChecks, MOUNT_STATUSES } from '@erp/db';
import { EventChecklist } from '@/components/operacion/event-checklist';
import { EventTabs } from '@/components/operacion/events';
import { CheckResultSelect, MountSelect } from '@/components/operacion/inline';
import { DemoBanner, Kpis, ModuleEmpty, ProductCell, RowList, ScopeBanner, StepDots } from '@/components/operacion/shared';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { CHECK_RESULT, ITEM_PAYMENT_STATUS } from '@/lib/labels';
import { can } from '@/domain/access/permissions';
import { requirePageUser } from '@/server/auth';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { loadMatrixView } from '@/server/matrix';

export const metadata: Metadata = { title: 'Ejecución' };

const TITLE = 'Ejecución';
const SUBTITLE =
  'El checklist del evento sobre los mismos entregables. Cada ítem avanza por sus estados de montaje y se verifica con su fotografía.';

/** Pasos de montaje sin contar «sin iniciar». */
const MOUNT_STEPS = MOUNT_STATUSES.length - 1;
/** Un ítem cuenta como montado desde «Montado» en adelante. */
const MOUNTED_FROM = MOUNT_STATUSES.indexOf('mounted');

const percent = (part: number, total: number) => (total === 0 ? undefined : `${Math.round((part / total) * 100)}%`);

export default async function EjecucionPage({ searchParams }: { searchParams: Promise<{ evento?: string | string[] }> }) {
  const user = await requirePageUser('schedule.read');
  const canCreate = can(user.role, 'projects.write');
  // El estado de pago es dato financiero: el empleado de campo no lo ve.
  const showPayments = can(user.role, 'procurement.read');
  const canUpload = can(user.role, 'evidence.upload');
  const project = await getCurrentProject();
  if (!project) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="project" canCreate={canCreate} />;
  const view = await loadMatrixView(project.id, user, (await searchParams).evento);
  if (!view) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="matrix" canCreate={canCreate} />;

  // Con alcance (campo), solo los controles previos que tiene a cargo.
  const checks = (await listPreEventChecks(db(), project.id)).filter((check) => !view.scoped || check.workerId === user.workerId);
  const { items, totals } = view;
  // Proyecto con eventos (migración 0011): checklist por evento, usable desde el celular.
  const byEvent = view.events.length > 0;
  // Sin fotografía y además sin ningún pago: lo que más urge revisar antes del evento. Sin
  // acceso a los pagos, la alerta es solo la falta de fotografía.
  const alerts = items.filter((item) => item.evidenceCount === 0 && (!showPayments || item.paymentStatus === 'unpaid')).length;

  return (
    <>
      <PageHeader title={TITLE} subtitle={SUBTITLE} />
      {view.demo ? <DemoBanner source={view.matrix.model} /> : null}
      {view.scoped ? <ScopeBanner count={items.length} /> : null}
      <EventTabs basePath="/operacion/ejecucion" events={view.events} current={view.event} />
      <Kpis
        items={[
          ...(byEvent
            ? [
                {
                  label: 'Listos',
                  value: `${totals.readyCount} de ${totals.itemCount}`,
                  hint: percent(totals.readyCount, totals.itemCount),
                  tone: totals.itemCount > 0 && totals.readyCount === totals.itemCount ? ('ok' as const) : undefined,
                },
              ]
            : []),
          {
            label: 'Entregables montados',
            value: `${totals.mountedCount} de ${totals.itemCount}`,
            hint: percent(totals.mountedCount, totals.itemCount),
          },
          {
            label: 'Con evidencia',
            value: `${totals.itemsWithEvidence} de ${totals.itemCount}`,
            hint: `${totals.evidenceCount} ${totals.evidenceCount === 1 ? 'fotografía' : 'fotografías'}`,
          },
          ...(showPayments
            ? [
                {
                  label: 'Pagados por completo',
                  value: `${totals.fullyPaidCount} de ${totals.itemCount}`,
                  tone: totals.fullyPaidCount === totals.itemCount ? ('ok' as const) : ('wa' as const),
                },
              ]
            : []),
          { label: 'Alertas', value: alerts, hint: showPayments ? 'sin foto y sin pagar' : 'sin foto', tone: alerts ? 'ba' : 'ok' },
        ]}
      />

      <Card title={`Checklist de entregables${view.event ? ` · ${view.event.name}` : ''}`}>
        {byEvent ? (
          items.length === 0 ? (
            <EmptyState icon="▦" title="Sin ítems en este evento">
              <p>{view.scoped ? 'No tienes ítems a tu cargo en este evento. Prueba con otro evento.' : 'Este evento todavía no tiene ítems.'}</p>
            </EmptyState>
          ) : (
            <EventChecklist items={items} canUpload={canUpload} />
          )
        ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Ítem</th>
                <th scope="col">Producto</th>
                {showPayments ? <th scope="col">Estado de pago</th> : null}
                <th scope="col">Estado de montaje</th>
                <th scope="col" className="num">
                  Fotos
                </th>
                <th scope="col">Verificado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const [payLabel, payTone] = ITEM_PAYMENT_STATUS[item.paymentStatus];
                const status = item.mountStatus ?? 'not_started';
                const step = MOUNT_STATUSES.indexOf(status);
                const mounted = step >= MOUNTED_FROM;
                return (
                  <tr key={item.id}>
                    <td>
                      <b className="font-semibold tabular-nums">{item.code}</b>
                    </td>
                    <td>
                      <ProductCell producto={item.producto} secondary={item.supplierName} />
                    </td>
                    {showPayments ? (
                      <td>
                        <Pill tone={payTone}>{payLabel}</Pill>
                      </td>
                    ) : null}
                    <td>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <StepDots done={step} total={MOUNT_STEPS} label="" />
                        <div>
                          <MountSelect itemId={item.id} itemLabel={item.code} status={status} version={item.executionVersion} />
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <Link
                        href={`/operacion/ejecucion/${item.id}`}
                        className="btn"
                        aria-label={`Fotografías del ítem ${item.code}: ${item.evidenceCount}. ${canUpload ? 'Ver y subir' : 'Ver'}`}
                      >
                        <span className={item.evidenceCount === 0 ? 'text-ba' : undefined}>{item.evidenceCount}</span>
                        <span aria-hidden>◎ {item.evidenceCount === 0 && canUpload ? 'Subir' : 'Ver'}</span>
                      </Link>
                    </td>
                    <td>
                      {item.evidenceCount === 0 ? (
                        <Pill tone="wa">Falta foto</Pill>
                      ) : mounted ? (
                        <Pill tone="ok">Sí</Pill>
                      ) : (
                        <Pill>Sin montar</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <Card title="Checklist previo al evento">
        {checks.length === 0 ? (
          <EmptyState icon="◷" title="Sin controles previos" />
        ) : (
          <RowList
            rows={checks.map((check) => {
              const [label, tone] = CHECK_RESULT[check.result];
              return {
                key: check.id,
                title: check.description,
                detail: [check.workerName, check.dueAt ? formatDateTime(check.dueAt) : null].filter(Boolean).join(' · ') || undefined,
                right: (
                  <div className="flex flex-none flex-wrap items-center justify-end gap-2">
                    <Pill tone={tone}>{label}</Pill>
                    <div>
                      <CheckResultSelect id={check.id} description={check.description} result={check.result} version={check.version} />
                    </div>
                  </div>
                ),
              };
            })}
          />
        )}
      </Card>

      <Note>
        Un ítem queda <b>verificado</b> cuando está {byEvent ? 'listo' : 'montado'} y tiene al menos una fotografía. El estado de montaje y el
        resultado de cada control se guardan al cambiarlos. Las fotografías se suben y se
        consultan con el botón de la columna «Fotos».
      </Note>
    </>
  );
}
