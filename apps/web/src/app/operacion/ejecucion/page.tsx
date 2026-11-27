import type { Metadata } from 'next';
import Link from 'next/link';
import { listPreEventChecks, MOUNT_STATUSES } from '@erp/db';
import { CheckResultSelect, MountSelect } from '@/components/operacion/inline';
import { DemoBanner, Kpis, ModuleEmpty, ProductCell, RowList, StepDots } from '@/components/operacion/shared';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { CHECK_RESULT, ITEM_PAYMENT_STATUS } from '@/lib/labels';
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

export default async function EjecucionPage() {
  const project = await getCurrentProject();
  if (!project) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="project" />;
  const view = await loadMatrixView(project.id);
  if (!view) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="matrix" />;

  const checks = await listPreEventChecks(db(), project.id);
  const { items, totals } = view;
  // Sin fotografía y además sin ningún pago: lo que más urge revisar antes del evento.
  const alerts = items.filter((item) => item.evidenceCount === 0 && item.paymentStatus === 'unpaid').length;

  return (
    <>
      <PageHeader title={TITLE} subtitle={SUBTITLE} />
      {view.demo ? <DemoBanner source={view.matrix.model} /> : null}
      <Kpis
        items={[
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
          {
            label: 'Pagados por completo',
            value: `${totals.fullyPaidCount} de ${totals.itemCount}`,
            tone: totals.fullyPaidCount === totals.itemCount ? 'ok' : 'wa',
          },
          { label: 'Alertas', value: alerts, hint: 'sin foto y sin pagar', tone: alerts ? 'ba' : 'ok' },
        ]}
      />

      <Card title="Checklist de entregables">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Ítem</th>
                <th scope="col">Producto</th>
                <th scope="col">Estado de pago</th>
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
                    <td>
                      <Pill tone={payTone}>{payLabel}</Pill>
                    </td>
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
                        aria-label={`Fotografías del ítem ${item.code}: ${item.evidenceCount}. Ver y subir`}
                      >
                        <span className={item.evidenceCount === 0 ? 'text-ba' : undefined}>{item.evidenceCount}</span>
                        <span aria-hidden>◎ {item.evidenceCount === 0 ? 'Subir' : 'Ver'}</span>
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
        Un ítem queda <b>verificado</b> cuando está montado y tiene al menos una fotografía. El estado de montaje y el
        resultado de cada control se guardan al cambiarlos. Las fotografías se suben y se
        consultan con el botón de la columna «Fotos».
      </Note>
    </>
  );
}
