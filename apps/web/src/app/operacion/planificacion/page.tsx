import type { Metadata } from 'next';
import { listActivities, listSuppliers, listWorkers, type Activity } from '@erp/db';
import { ActivityCells, PlanCells, type Option } from '@/components/operacion/inline';
import { EventTabs } from '@/components/operacion/events';
import { DemoBanner, Kpis, ModuleEmpty, ProductCell, ScopeBanner, ViewChips } from '@/components/operacion/shared';
import { Card, EmptyState, Note } from '@/components/ui';
import { PageHeader } from '@/components/ui';
import { formatAmount, formatDateRange, formatDayMonth, formatQuantity } from '@/lib/format';
import { ganttBar, ganttRange, ganttTicks } from '@/lib/gantt';
import { ACTIVITY_STATUS } from '@/lib/labels';
import { can } from '@/domain/access/permissions';
import { compactCodes } from '@/lib/numbering';
import { requirePageUser } from '@/server/auth';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { loadMatrixView, type MatrixView } from '@/server/matrix';

export const metadata: Metadata = { title: 'Planificación' };

const TITLE = 'Planificación';
const SUBTITLE =
  'La misma matriz del requerimiento, ahora con responsable, proveedor adjudicado, costo y actividades. Al cerrar esta etapa cada entregable tiene dueño, costo y fecha.';

const VIEWS = [
  ['matriz', 'Matriz'],
  ['cronograma', 'Cronograma'],
  ['actividades', 'Actividades'],
  ['cliente', 'Vista del cliente'],
] as const;
type View = (typeof VIEWS)[number][0];

const BAR_TONES = { in_progress: 'bg-bl', delayed: 'bg-ba', done: 'bg-ok', not_started: 'bg-line2' } as const;

/** Códigos de pantalla de los ítems de una actividad, en el orden de la matriz. */
function activityCodes(activity: Activity, codes: ReadonlyMap<string, string>): string {
  return compactCodes(activity.itemIds.flatMap((id) => codes.get(id) ?? []));
}

const responsible = (activity: Activity) => (activity.wholeTeam ? 'Equipo completo' : (activity.workerName ?? null));

function MatrixTable({
  view,
  currency,
  workers,
  suppliers,
}: {
  view: MatrixView;
  currency: string | null;
  workers: Option[];
  suppliers: Option[];
}) {
  const { items, totals } = view;
  return (
    <>
      <Kpis
        items={[
          { label: 'Ítems planificados', value: totals.itemCount, hint: `${totals.rubroCount} rubros` },
          { label: 'Costo asignado', value: formatAmount(totals.plannedCost, currency) },
          {
            label: 'Proveedores',
            value: totals.supplierCount,
            hint: totals.holdingSupplierCount ? `${totals.holdingSupplierCount} del holding` : undefined,
          },
          {
            label: 'Responsables',
            value: totals.responsibleCount,
            hint: totals.unassignedCount ? `${totals.unassignedCount} ítems sin responsable` : undefined,
            tone: totals.unassignedCount ? 'wa' : 'neutral',
          },
        ]}
      />
      <Card title="Matriz de planificación">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Ítem</th>
                <th scope="col">Producto</th>
                <th scope="col" className="num">
                  Cant.
                </th>
                <th scope="col">Responsable</th>
                <th scope="col">Proveedor</th>
                <th scope="col" className="num">
                  Costo
                </th>
                <th scope="col">Actividades</th>
                <th scope="col">Contrato</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                return (
                  <tr key={item.id}>
                    <td>
                      <b className="font-semibold tabular-nums">{item.code}</b>
                    </td>
                    <td>
                      <ProductCell producto={item.eventId ? (item.subproducto ?? item.producto) : item.producto} secondary={item.rubro} />
                    </td>
                    <td className="num">{formatQuantity(item.cant)}</td>
                    <PlanCells
                      itemId={item.id}
                      itemLabel={item.code}
                      workerId={item.workerId}
                      workerName={item.workerName}
                      workers={workers}
                      supplierId={item.supplierId}
                      supplierName={item.supplierName}
                      suppliers={suppliers}
                      plannedCost={item.plannedCost}
                      contractStatus={item.contractStatus}
                      planVersion={item.planVersion}
                      currencySymbol={currency === null || currency === 'USD' ? '$' : currency}
                      activities={
                        item.activityCount === 0 ? '—' : `${item.activityCount} ${item.activityCount === 1 ? 'actividad' : 'actividades'}`
                      }
                    />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-bg font-semibold">
                <td className="border-t border-line2" />
                <td className="border-t border-line2" colSpan={4}>
                  Total de {totals.itemCount} ítems
                </td>
                <td className="num border-t border-line2">{formatAmount(totals.plannedCost, currency)}</td>
                <td className="border-t border-line2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <Note>
        Responsable, proveedor, costo y contrato se guardan al cambiarlos (el costo, al salir del campo o con Enter). Aquí no aparece el
        precio al cliente ni el margen: Operación trabaja contra el costo asignado.
      </Note>
    </>
  );
}

function Schedule({
  activities,
  codes,
  project,
}: {
  activities: Activity[];
  codes: ReadonlyMap<string, string>;
  project: { startDate: string | null; endDate: string | null };
}) {
  const range = ganttRange(activities, project);
  if (!range) return <NoActivities />;
  return (
    <Card title={`Cronograma · ${formatDateRange(range.start, range.end)}`}>
      <div className="overflow-x-auto p-4">
        <div className="min-w-140">
          <div className="relative mb-1.5 ml-53.5 h-3.25 text-[0.5625rem] font-semibold tracking-[0.08em] text-mut2 uppercase" aria-hidden>
            {ganttTicks(range).map((tick) => (
              <span key={tick.date} className="absolute top-0" style={{ left: `${tick.left}%` }}>
                {formatDayMonth(tick.date)}
              </span>
            ))}
          </div>
          <ul>
            {activities.map((activity) => {
              const bar = ganttBar(range, activity);
              const detail = [responsible(activity), activityCodes(activity, codes) && `ítem ${activityCodes(activity, codes)}`]
                .filter(Boolean)
                .join(' · ');
              const status = activity.status ? ACTIVITY_STATUS[activity.status][0] : 'sin estado';
              return (
                <li key={activity.id} className="flex items-center gap-3.5 py-1.5">
                  <div className="w-50 flex-none overflow-hidden text-[0.78125rem] text-ellipsis whitespace-nowrap">
                    {activity.name}
                    <small className="block text-[0.6875rem] text-mut2">{detail || '—'}</small>
                  </div>
                  <div
                    className="relative h-4.5 flex-1 rounded bg-bg"
                    role="img"
                    aria-label={`${activity.name}: ${formatDateRange(activity.startDate, activity.endDate)}, ${
                      activity.isMilestone ? 'hito' : status
                    }`}
                    title={`${formatDateRange(activity.startDate, activity.endDate)}${activity.isMilestone ? ' · hito' : ` · ${status}`}`}
                  >
                    {activity.isMilestone ? (
                      <i
                        className="absolute top-1 block size-2.5 rotate-45 rounded-[0.125rem] bg-vi"
                        style={{ left: `calc(${bar.left + bar.width / 2}% - 0.3125rem)` }}
                      />
                    ) : (
                      <i
                        className={`absolute top-1 block h-2.5 rounded-[0.3125rem] ${BAR_TONES[activity.status ?? 'not_started']}`}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-mut">
            <Legend className="bg-bl" label="En curso" />
            <Legend className="bg-ba" label="Atrasada" />
            <Legend className="bg-ok" label="Terminada" />
            <Legend className="bg-line2" label="Por iniciar o sin estado" />
            <Legend className="rotate-45 !rounded-[0.125rem] bg-vi" label="Hito" square />
          </p>
        </div>
      </div>
    </Card>
  );
}

function Legend({ className, label, square = false }: { className: string; label: string; square?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`block h-2 rounded-[0.25rem] ${square ? 'w-2' : 'w-4'} ${className}`} aria-hidden />
      {label}
    </span>
  );
}

function NoActivities() {
  return (
    <Card>
      <EmptyState icon="◷" title="Sin actividades">
        <p>El proyecto todavía no tiene actividades planificadas.</p>
      </EmptyState>
    </Card>
  );
}

function ActivitiesTable({
  activities,
  codes,
  workers,
}: {
  activities: Activity[];
  codes: ReadonlyMap<string, string>;
  workers: Option[];
}) {
  if (activities.length === 0) return <NoActivities />;
  return (
    <>
      <Card title="Actividades por entregable">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Actividad</th>
                <th scope="col">Ítem</th>
                <th scope="col">Responsable</th>
                <th scope="col">Inicio</th>
                <th scope="col">Fin</th>
                <th scope="col">Depende de</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => {
                return (
                  <tr key={activity.id}>
                    <td>
                      <b className="font-semibold">{activity.name}</b>
                      {activity.isMilestone ? <small>Hito</small> : null}
                    </td>
                    <td className="tabular-nums">{activityCodes(activity, codes) || '—'}</td>
                    <ActivityCells
                      id={activity.id}
                      name={activity.name}
                      version={activity.version}
                      wholeTeam={activity.wholeTeam}
                      workerId={activity.workerId}
                      workerName={activity.workerName}
                      workers={workers}
                      status={activity.status}
                    >
                      <td className="whitespace-nowrap">{formatDayMonth(activity.startDate)}</td>
                      <td className="whitespace-nowrap">{formatDayMonth(activity.endDate)}</td>
                      <td className="text-ink2">{activity.dependsOnName ?? '—'}</td>
                    </ActivityCells>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Note>
        El responsable y el estado se guardan al cambiarlos, y el cronograma toma su color del estado. Cada actividad cuelga de uno o
        varios ítems del requerimiento; las de equipo completo (ceremonias) no cuelgan de ninguno.
      </Note>
    </>
  );
}

function ClientView({ view }: { view: MatrixView }) {
  const rubros: { name: string; number: string; products: string[] }[] = [];
  for (const item of view.items) {
    const number = item.code.split('.')[0] ?? '';
    const rubro = rubros.find((entry) => entry.number === number);
    if (rubro) rubro.products.push(item.producto);
    else rubros.push({ name: item.rubro, number, products: [item.producto] });
  }
  return (
    <>
      <Card title="Estructura que ve el cliente">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Rubro</th>
                <th scope="col">Entregables</th>
                <th scope="col">Productos</th>
              </tr>
            </thead>
            <tbody>
              {rubros.map((rubro) => (
                <tr key={rubro.number}>
                  <td>
                    <b className="font-semibold">
                      {rubro.number} · {rubro.name}
                    </b>
                  </td>
                  <td className="whitespace-nowrap">
                    {rubro.products.length} {rubro.products.length === 1 ? 'ítem' : 'ítems'}
                  </td>
                  <td className="text-ink2">{rubro.products.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Note>
        Esta es la estructura que se compartiría con el cliente: lo que recibe, sin costos, sin precios y sin proveedores. Todavía no hay
        acceso para clientes.
      </Note>
    </>
  );
}

export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string | string[]; evento?: string | string[] }>;
}) {
  const user = await requirePageUser('matrix.read');
  const canCreate = can(user.role, 'projects.write');
  const project = await getCurrentProject();
  if (!project) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="project" canCreate={canCreate} />;
  const query = await searchParams;
  const view = await loadMatrixView(project.id, user, query.evento);
  if (!view) return <ModuleEmpty title={TITLE} subtitle={SUBTITLE} reason="matrix" canCreate={canCreate} />;

  // El empleado de campo no ve la vista del cliente (es de todo el proyecto).
  const views = view.scoped ? VIEWS.filter(([value]) => value !== 'cliente') : VIEWS;
  const requested = query.vista;
  const current: View = views.find(([value]) => value === requested)?.[0] ?? 'matriz';
  const visibleItems = new Set(view.items.map((item) => item.id));
  const activities = (current === 'cronograma' || current === 'actividades' ? await listActivities(db(), project.id) : []).filter(
    // Con alcance: las actividades de sus ítems, las que tiene a cargo y las de equipo completo.
    (activity) =>
      !view.scoped ||
      activity.wholeTeam ||
      activity.workerId === user.workerId ||
      activity.itemIds.some((id) => visibleItems.has(id)),
  );
  const [workers, suppliers] =
    current === 'matriz' || current === 'actividades'
      ? await Promise.all([listWorkers(db(), { onlyActive: true }), listSuppliers(db(), { onlyActive: true })])
      : [[], []];

  const workerOptions = workers.map((worker) => ({ id: worker.id, name: worker.fullName }));

  return (
    <>
      <PageHeader title={TITLE} subtitle={SUBTITLE} />
      {view.demo ? <DemoBanner source={view.matrix.model} /> : null}
      {view.scoped ? <ScopeBanner count={view.items.length} /> : null}
      <EventTabs basePath="/operacion/planificacion" events={view.events} current={view.event} params={{ vista: current }} />
      <ViewChips basePath="/operacion/planificacion" current={current} options={views} eventId={view.event?.id} />
      {current === 'matriz' ? (
        <MatrixTable
          view={view}
          currency={project.currency}
          workers={workerOptions}
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            name: supplier.kind === 'holding' ? `${supplier.name} · holding` : supplier.name,
          }))}
        />
      ) : null}
      {current === 'cronograma' ? <Schedule activities={activities} codes={view.codes} project={project} /> : null}
      {current === 'actividades' ? <ActivitiesTable activities={activities} codes={view.codes} workers={workerOptions} /> : null}
      {current === 'cliente' ? <ClientView view={view} /> : null}
    </>
  );
}
