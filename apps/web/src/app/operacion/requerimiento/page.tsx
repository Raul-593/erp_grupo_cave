import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getExtraction,
  getLatestExtraction,
  listClients,
  listDocumentsByProject,
  listDraftItems,
  listQuoteLines,
  listQuoteRequests,
  listWorkers,
  EXCEL_PROVIDER,
  MANUAL_PROVIDER,
  type ExtractionSummary,
} from '@erp/db';
import { ProjectValueForm } from '@/components/forms/ProjectValueForm';
import { BulkAssign } from '@/components/operacion/bulk-assign';
import { EventMatrixTable, EventTabs, formatSigned, groupByProduct } from '@/components/operacion/events';
import { AutoRefresh } from '@/components/requerimiento/AutoRefresh';
import { DeleteDocumentButton } from '@/components/requerimiento/DeleteDocumentButton';
import { EXTRACTION_STATUS, ExtractionPanel } from '@/components/requerimiento/ExtractionPanel';
import { FichaCard } from '@/components/requerimiento/FichaCard';
import { FichaProposal, StartManualButton } from '@/components/requerimiento/FichaProposal';
import { MatrixEditor, NEW_ITEM_FIELD_ID } from '@/components/requerimiento/MatrixEditor';
import { ProcessButton } from '@/components/requerimiento/ProcessButton';
import { TdrUploader } from '@/components/requerimiento/TdrUploader';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { validateExtractionOutput, type ExtractionOutput } from '@/domain/tdr-extraction/contract';
import { TDR_INPUT_ID } from '@/lib/constants';
import { ResponsibleSelect } from '@/components/operacion/inline';
import { ScopeBanner } from '@/components/operacion/shared';
import { QuotesCards } from '@/components/requerimiento/QuotesCards';
import { formatAmount, formatBytes, formatDateTime, formatQuantity } from '@/lib/format';
import { itemCodes } from '@/lib/numbering';
import { can } from '@/domain/access/permissions';
import { projectValueToForm } from '@/lib/project-value';
import { requirePageUser } from '@/server/auth';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { DRAFT_MESSAGES } from '@/server/errors';
import { aiStatus, sweepInterruptedExtractions } from '@/server/extraction-runner';
import { loadMatrixView } from '@/server/matrix';
import { buildEditorData, clientProposal, fichaProposalRows } from '@/server/requerimiento-view';
import { maxTdrBytes } from '@/server/storage';

export const metadata: Metadata = { title: 'Requerimiento' };

/** Columnas de la matriz de entregables (AGENTS.md §6 y §8). */
const MATRIX_COLUMNS = [
  { label: 'Ítem' },
  { label: 'Producto' },
  { label: 'Subproducto' },
  { label: 'Descripción' },
  { label: 'Cant.', num: true },
  { label: 'Unidad' },
  { label: 'Días', num: true },
  { label: 'Observaciones' },
  { label: 'Responsable' },
];

/** Fila de la matriz lista para mostrar, venga de la propuesta de la IA o de la matriz confirmada. */
interface MatrixDisplayRow {
  key: string;
  code: string;
  rubro: string;
  producto: string;
  subproducto: string | null;
  descripcion: string;
  cant: string;
  unidad: string | null;
  dias: string;
  observacion: string | null;
  responsible: string | null;
  responsibleId: string | null;
}

const SUBTITLE =
  'El punto de partida del proyecto: aquí se carga el TDR y queda convertido en la ficha y la matriz de entregables, con un responsable por ítem.';

export default async function RequerimientoPage({ searchParams }: { searchParams: Promise<{ evento?: string | string[] }> }) {
  const user = await requirePageUser('matrix.read');
  // Superusuario: todo. Contabilidad: documentos y matriz en lectura. Campo: ficha y sus ítems.
  const canManageTdr = can(user.role, 'tdr.manage');
  const canReadTdr = can(user.role, 'tdr.read');
  const canWriteProject = can(user.role, 'projects.write');
  const canAssign = can(user.role, 'items.assign');
  const canEditMatrix = can(user.role, 'matrix.edit');
  const project = await getCurrentProject();

  if (!project) {
    return (
      <>
        <PageHeader title="Requerimiento" subtitle={SUBTITLE} />
        <Card>
          <EmptyState icon="◫" title={canWriteProject ? 'Todavía no hay proyectos' : 'No tienes proyectos asignados'}>
            {canWriteProject ? (
              <>
                <p>Crea un proyecto y su contratante para cargar el TDR.</p>
                <Link href="/operacion/proyectos/nuevo" className="btn btn-p mt-4">
                  + Nuevo proyecto
                </Link>
              </>
            ) : (
              <p>Aquí aparecerán los proyectos donde seas responsable de algún ítem.</p>
            )}
          </EmptyState>
        </Card>
      </>
    );
  }

  // Los intentos que quedaron activos tras un reinicio se marcan como interrumpidos.
  if (canManageTdr) await sweepInterruptedExtractions();
  const [documents, clients, workers] = await Promise.all([
    canReadTdr ? listDocumentsByProject(db(), project.id) : Promise.resolve([]),
    canWriteProject || canEditMatrix ? listClients(db()) : Promise.resolve([]),
    canAssign ? listWorkers(db(), { onlyActive: true }) : Promise.resolve([]),
  ]);
  const latest = documents[0];
  const ai = aiStatus();
  const extraction = latest ? await getLatestExtraction(db(), latest.id) : null;
  const extractionActive = extraction?.status === 'pending' || extraction?.status === 'processing';
  let proposal: ExtractionOutput | null = null;
  if (extraction && (extraction.status === 'processed' || extraction.status === 'confirmed')) {
    const parsed = validateExtractionOutput(extraction.rawResponse);
    proposal = parsed.ok ? parsed.output : null;
  }

  // Matriz confirmada vigente del proyecto (con responsable por ítem) y sus cotizaciones.
  const confirmed = await loadMatrixView(project.id, user, (await searchParams).evento);
  const [quoteRequests, quoteLines] = confirmed && can(user.role, 'quotes.read')
    ? await Promise.all([listQuoteRequests(db(), project.id), listQuoteLines(db(), project.id)])
    : [[], []];
  // Etapa D: con matriz confirmada se muestra siempre esa (una por proyecto, D-7). Si no, el
  // borrador del último intento procesado del último documento; si no, la matriz está vacía.
  const draft = !confirmed && canReadTdr && extraction?.status === 'processed' ? extraction : null;
  const manual = draft?.provider === MANUAL_PROVIDER;
  const draftItems = draft ? await listDraftItems(db(), draft.id) : [];
  const editor = draft ? buildEditorData(draftItems, manual ? null : proposal) : null;
  const mode: 'confirmed' | 'draft' | 'none' = confirmed ? 'confirmed' : draft ? 'draft' : 'none';
  // Datos de demostración (AGENTS.md §2): se rotulan como tales, nunca como propuesta de la IA.
  const demo = confirmed?.demo ?? false;
  const draftCodes = itemCodes(draftItems);
  const rows: MatrixDisplayRow[] =
    mode === 'confirmed' && confirmed
      ? confirmed.items.map((item) => ({
          key: item.id,
          code: item.code,
          rubro: item.rubro,
          producto: item.producto,
          subproducto: item.subproducto,
          descripcion: item.descripcion,
          cant: formatQuantity(item.cant),
          unidad: item.unidad,
          dias: formatQuantity(item.dias),
          observacion: item.observacion,
          responsible: item.workerName,
          responsibleId: item.workerId,
        }))
      : draftItems.map((item, index) => ({
          key: item.id,
          code: draftCodes[index] ?? String(item.itemNumber),
          rubro: item.rubro,
          producto: item.producto,
          subproducto: item.subproducto,
          descripcion: item.descripcion,
          cant: formatQuantity(item.cant),
          unidad: item.unidad,
          dias: formatQuantity(item.dias),
          observacion: item.observacion,
          responsible: item.workerName,
          responsibleId: item.workerId,
        }));
  const rubroCount = new Set(rows.map((row) => row.rubro.trim().toLowerCase())).size;
  const unassigned = mode === 'confirmed' && confirmed ? confirmed.totals.unassignedCount : (editor?.unassigned ?? 0);
  // Proyecto con eventos (migración 0011): la matriz se muestra por evento, con sus costos.
  const byEvent = confirmed !== null && confirmed.events.length > 0;
  const fromExcel = confirmed?.matrix.provider === EXCEL_PROVIDER;
  const workerOptions = workers.map((worker) => ({ id: worker.id, name: worker.fullName }));
  const matrixKind = demo
    ? 'datos de demostración'
    : fromExcel
      ? 'matriz cargada desde Excel'
      : mode === 'confirmed'
        ? 'matriz confirmada'
        : manual
          ? 'matriz manual en borrador'
          : 'propuesta IA en revisión';
  const draftSummary = editor
    ? [
        `${editor.itemCount} ${editor.itemCount === 1 ? 'ítem' : 'ítems'} en ${editor.rubroCount} ${editor.rubroCount === 1 ? 'rubro' : 'rubros'}`,
        `${editor.unassigned} sin responsable`,
        manual ? 'matriz manual' : `${editor.proposedCount} valores tal como los propuso la IA`,
      ].join(' · ')
    : '';

  // Ficha propuesta (D-6): de la matriz confirmada o del borrador; nunca de la demostración ni de una matriz manual.
  const fichaSource: ExtractionSummary | null =
    mode === 'confirmed' && confirmed && !demo
      ? await getExtraction(db(), confirmed.matrix.extractionId)
      : draft && !manual
        ? draft
        : null;
  const fichaOutput = fichaSource ? validateExtractionOutput(fichaSource.rawResponse) : null;
  const ficha = fichaOutput?.ok ? fichaOutput.output.ficha : null;
  const fichaRows = canEditMatrix && ficha ? fichaProposalRows(project, ficha) : [];
  const fichaClient = canEditMatrix && ficha ? clientProposal(project, ficha, clients) : null;
  const canStartManual = canEditMatrix && mode === 'none' && latest !== undefined && !extractionActive;
  const processDisabledReason = confirmed
    ? DRAFT_MESSAGES.project_has_confirmed_matrix
    : !ai.ready
      ? 'Configura la IA en .env (ver el aviso de la tarjeta).'
      : extractionActive
        ? 'Ya hay un procesamiento en curso.'
        : undefined;

  return (
    <>
      <PageHeader
        title="Requerimiento"
        subtitle={SUBTITLE}
        actions={
          canManageTdr ? (
            <>
              {mode === 'draft' && canEditMatrix ? (
                <a href={`#${NEW_ITEM_FIELD_ID}`} className="btn">
                  + Ítem
                </a>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled
                  title={mode === 'confirmed' ? 'La matriz ya está confirmada' : 'Procesa el TDR o empieza una matriz a mano'}
                >
                  + Ítem
                </button>
              )}
              <label htmlFor={TDR_INPUT_ID} className="btn btn-p cursor-pointer">
                Cargar TDR
              </label>
            </>
          ) : undefined
        }
      />

      {confirmed?.scoped ? <ScopeBanner count={confirmed.items.length} /> : null}
      {confirmed ? <EventTabs basePath="/operacion/requerimiento" events={confirmed.events} current={confirmed.event} /> : null}

      {canReadTdr ? (
        <Card
          title="Documento TDR"
          actions={
            canManageTdr ? (
              <ProcessButton
                documentId={latest?.id ?? null}
                disabled={!latest || !ai.ready || extractionActive || confirmed !== null}
                disabledReason={latest ? processDisabledReason : 'Primero carga el PDF del TDR.'}
                label={extraction ? '◆ Volver a procesar con IA' : '◆ Procesar TDR con IA'}
                confirmMessage={
                  draft
                    ? 'Ya hay un borrador de la matriz para este documento. El nuevo procesamiento crea otro borrador desde cero: las ediciones del actual no pasan al nuevo (el actual se conserva). ¿Continuar?'
                    : undefined
                }
              />
            ) : undefined
          }
        >
          <AutoRefresh active={extractionActive} />
          {documents.length > 0 ? (
            <ul className="border-b border-line">
              {documents.map((document) => {
                const status = document.latestExtractionStatus ? EXTRACTION_STATUS[document.latestExtractionStatus] : null;
                return (
                  <li key={document.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-[11px] last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <b className="font-semibold break-all">{document.originalFilename}</b>
                      <small className="mt-0.5 block text-[11.5px] text-mut2">
                        {formatBytes(document.sizeBytes)}
                        {document.pageCount ? ` · ${document.pageCount} págs.` : ''} · cargado el {formatDateTime(document.uploadedAt)}
                      </small>
                    </div>
                    {status ? <Pill tone={status[1]}>{status[0]}</Pill> : <Pill>Sin procesar</Pill>}
                    <a href={`/api/tdr/${document.id}`} target="_blank" rel="noopener" className="btn">
                      Ver PDF
                    </a>
                    {canManageTdr && document.extractionCount === 0 ? (
                      <DeleteDocumentButton id={document.id} filename={document.originalFilename} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {extraction && extraction.provider !== MANUAL_PROVIDER && extraction.provider !== EXCEL_PROVIDER ? <ExtractionPanel extraction={extraction} output={proposal} /> : null}
          {!canManageTdr ? null : !ai.ready ? (
            <div className="border-t border-line px-4 py-3 text-[12px] text-ink2">
              <p className="font-semibold text-wa">La IA todavía no está configurada; «Procesar TDR con IA» está deshabilitado.</p>
              <ul className="mt-1 list-disc pl-5 text-mut">
                {ai.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-mut">
              IA configurada: {ai.providerLabel} · {ai.model}
            </p>
          )}
          {canManageTdr ? <TdrUploader projectId={project.id} maxBytes={maxTdrBytes()} compact={documents.length > 0} /> : null}
          {canWriteProject ? (
            <div className="border-t border-line px-4 pt-3 pb-4">
              <ProjectValueForm projectId={project.id} version={project.version} initial={projectValueToForm(project)} />
            </div>
          ) : null}
          {!canManageTdr && documents.length === 0 ? <p className="px-4 py-3 text-[12px] text-mut">Sin documentos cargados.</p> : null}
        </Card>
      ) : null}

      <FichaCard
        key={project.id}
        project={{
          id: project.id,
          version: project.version,
          clientId: project.clientId,
          clientName: project.clientName,
          clientTaxId: project.clientTaxId,
          processCode: project.processCode,
          purpose: project.purpose,
          contractAmount: project.contractAmount,
          currency: project.currency,
          amountIncludesVat: project.amountIncludesVat,
          venues: project.venues,
          termText: project.termText,
          startDate: project.startDate,
          endDate: project.endDate,
          contractAdministrator: project.contractAdministrator,
          companyName: project.companyName,
        }}
        clients={clients.map(({ id, name, taxId }) => ({ id, name, taxId }))}
        scope={mode !== 'none' ? `${rows.length} ítems en ${rubroCount} rubros (${matrixKind})` : 'Sin matriz todavía'}
        documentLabel={!canReadTdr ? '—' : latest ? latest.originalFilename : 'Sin cargar'}
      />

      {fichaSource && (fichaRows.length > 0 || fichaClient) ? (
        <FichaProposal
          projectId={project.id}
          projectVersion={project.version}
          extractionId={fichaSource.id}
          rows={fichaRows}
          client={fichaClient}
          observacion={ficha?.observacion ?? null}
        />
      ) : null}

      <Card
        title={
          <>
            Matriz de entregables{confirmed?.event ? ` · ${confirmed.event.name}` : ''}{' '}
            {mode === 'draft' ? manual ? <Pill tone="bl">Matriz manual · borrador</Pill> : <Pill tone="vi">◆ Propuesta IA · en revisión</Pill> : null}
          </>
        }
        actions={
          <button type="button" className="btn" disabled title="Disponible en una etapa posterior">
            Exportar Excel
          </button>
        }
      >
        {mode === 'draft' && draft && editor && canEditMatrix ? (
          <MatrixEditor
            extractionId={draft.id}
            extractionVersion={draft.version}
            groups={editor.groups}
            workers={workers.map((worker) => ({ id: worker.id, name: worker.fullName }))}
            summary={draftSummary}
          />
        ) : byEvent && confirmed ? (
          <>
            {canAssign && confirmed.event && workerOptions.length > 0 ? (
              <BulkAssign
                key={confirmed.event.id}
                projectId={project.id}
                eventId={confirmed.event.id}
                eventName={confirmed.event.name}
                products={groupByProduct(confirmed.items).map((group) => group.producto)}
                workers={workerOptions}
              />
            ) : null}
            <EventMatrixTable
              items={confirmed.items}
              currency={project.currency}
              workers={workerOptions}
              showCosts={can(user.role, 'items.plan_cost') || can(user.role, 'procurement.read')}
              showBalance={can(user.role, 'procurement.read')}
              canUpload={can(user.role, 'evidence.upload')}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-bg px-4 py-2.5 text-[11.5px] text-mut">
              <span>
                {rows.length} ítems · {rubroCount} productos
                {!confirmed.scoped ? ` · ${unassigned} sin responsable` : ''} ·{' '}
                <b className="font-semibold text-ok">{matrixKind}</b>
              </span>
              {can(user.role, 'procurement.read') ? (
                <span className="ml-auto tabular-nums">
                  Subtotal {formatAmount(confirmed.totals.plannedCost, project.currency)} · anticipos{' '}
                  {formatAmount(confirmed.totals.advancesAmount, project.currency)} · saldo{' '}
                  <b className="font-semibold text-ink">{formatSigned(confirmed.totals.costBalance, project.currency)}</b>
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    {MATRIX_COLUMNS.map((column) => (
                      <th key={column.label} className={column.num ? 'num' : undefined} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? (
                    rows.map((row) => (
                      <tr key={row.key} className="align-top">
                        <td>
                          <b className="font-semibold tabular-nums">{row.code}</b>
                        </td>
                        <td>
                          <b className="font-semibold">{row.producto}</b>
                          <small>{row.rubro}</small>
                        </td>
                        <td>{row.subproducto ?? '—'}</td>
                        <td className="min-w-[220px] text-ink2">{row.descripcion || '—'}</td>
                        <td className="num">{row.cant}</td>
                        <td>{row.unidad ?? '—'}</td>
                        <td className="num">{row.dias}</td>
                        <td className="min-w-[200px] text-[11.5px] text-mut">{row.observacion ?? '—'}</td>
                        <td className="whitespace-nowrap">
                          <ResponsibleSelect
                            itemId={row.key}
                            itemLabel={row.code}
                            workerId={row.responsibleId}
                            workerName={row.responsible}
                            workers={workers.map((worker) => ({ id: worker.id, name: worker.fullName }))}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={MATRIX_COLUMNS.length} className="p-0">
                        <EmptyState icon="▦" title={mode === 'draft' ? 'La matriz está vacía' : 'Sin ítems todavía'}>
                          <p>
                            {mode === 'draft'
                              ? 'El borrador todavía no tiene ítems.'
                              : 'La matriz se llena al procesar el TDR con IA (agrupada por rubro: 1.1, 1.2…) o empezándola a mano. Después se revisa, se asigna un responsable a cada ítem y se confirma.'}
                          </p>
                          {canStartManual && latest ? (
                            <div className="mt-4">
                              <StartManualButton documentId={latest.id} />
                            </div>
                          ) : null}
                        </EmptyState>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-bg px-4 py-2.5 text-[11.5px] text-mut">
              <span>
                {mode !== 'none' ? `${rows.length} ítems · ${rubroCount} rubros · ` : '0 ítems · 0 rubros'}
                {mode !== 'none' && !confirmed?.scoped ? `${unassigned} sin responsable · ` : null}
                {demo ? (
                  <b className="font-semibold text-wa">datos de demostración (ilustrativos), matriz confirmada</b>
                ) : mode === 'confirmed' ? (
                  <b className="font-semibold text-ok">matriz confirmada</b>
                ) : mode === 'draft' ? (
                  <b className="font-semibold text-vi">{matrixKind}, todavía sin confirmar</b>
                ) : null}
              </span>
              <span className="ml-auto">
                {!canAssign ? null : workers.length === 0 ? (
                  <>
                    Sin trabajadores activos para asignar.{' '}
                    <Link href="/administracion/trabajadores/nuevo" className="text-bl hover:underline">
                      Registrar trabajador
                    </Link>
                  </>
                ) : (
                  <>
                    {workers.length} {workers.length === 1 ? 'trabajador activo disponible' : 'trabajadores activos disponibles'} como
                    responsables
                  </>
                )}
              </span>
            </div>
          </>
        )}
      </Card>

      {confirmed && quoteRequests.length > 0 ? (
        <QuotesCards requests={quoteRequests} lines={quoteLines} items={confirmed.items} currency={project.currency} />
      ) : null}

      <Note>
        Los valores que propone la IA se ven en <b className="text-vi">violeta</b> («Propuesta IA») hasta que los cambias o confirmas la
        matriz. Cada celda se guarda al salir de ella. La IA nunca asigna responsables. Por ahora cada proyecto admite una sola
        matriz confirmada.
      </Note>
    </>
  );
}
