import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DEMO_PROVIDER,
  getLatestExtraction,
  listClients,
  listDocumentsByProject,
  listQuoteLines,
  listQuoteRequests,
  listWorkers,
} from '@erp/db';
import { ProjectValueForm } from '@/components/forms/ProjectValueForm';
import { AutoRefresh } from '@/components/requerimiento/AutoRefresh';
import { DeleteDocumentButton } from '@/components/requerimiento/DeleteDocumentButton';
import { EXTRACTION_STATUS, ExtractionPanel } from '@/components/requerimiento/ExtractionPanel';
import { FichaCard } from '@/components/requerimiento/FichaCard';
import { ProcessButton } from '@/components/requerimiento/ProcessButton';
import { TdrUploader } from '@/components/requerimiento/TdrUploader';
import { Card, EmptyState, Note, PageHeader, Pill } from '@/components/ui';
import { validateExtractionOutput, type ExtractionOutput } from '@/domain/tdr-extraction/contract';
import { TDR_INPUT_ID } from '@/lib/constants';
import { ResponsibleSelect } from '@/components/operacion/inline';
import { QuotesCards } from '@/components/requerimiento/QuotesCards';
import { formatBytes, formatDateTime, formatQuantity } from '@/lib/format';
import { itemCodes } from '@/lib/numbering';
import { projectValueToForm } from '@/lib/project-value';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { aiStatus, sweepInterruptedExtractions } from '@/server/extraction-runner';
import { loadMatrixView } from '@/server/matrix';
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

export default async function RequerimientoPage() {
  const project = await getCurrentProject();

  if (!project) {
    return (
      <>
        <PageHeader title="Requerimiento" subtitle={SUBTITLE} />
        <Card>
          <EmptyState icon="◫" title="Todavía no hay proyectos">
            <p>Crea un proyecto y su contratante para cargar el TDR.</p>
            <Link href="/operacion/proyectos/nuevo" className="btn btn-p mt-4">
              + Nuevo proyecto
            </Link>
          </EmptyState>
        </Card>
      </>
    );
  }

  // Los intentos que quedaron activos tras un reinicio se marcan como interrumpidos.
  await sweepInterruptedExtractions();
  const [documents, clients, workers] = await Promise.all([
    listDocumentsByProject(db(), project.id),
    listClients(db()),
    listWorkers(db(), { onlyActive: true }),
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
  const codes = proposal ? itemCodes(proposal.items) : [];

  // Matriz confirmada vigente del proyecto (con responsable por ítem) y sus cotizaciones.
  const confirmed = await loadMatrixView(project.id);
  const [quoteRequests, quoteLines] = confirmed
    ? await Promise.all([listQuoteRequests(db(), project.id), listQuoteLines(db(), project.id)])
    : [[], []];
  // Una propuesta todavía sin confirmar del último documento tiene prioridad en la tarjeta de la matriz.
  const showConfirmed = confirmed !== null && extraction?.status !== 'processed';
  // Datos de demostración (AGENTS.md §2): se rotulan como tales, nunca como propuesta de la IA.
  const demo = showConfirmed ? confirmed.demo : extraction?.provider === DEMO_PROVIDER;
  const rows: MatrixDisplayRow[] = showConfirmed
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
    : (proposal?.items ?? []).map((row, index) => ({
        key: `${row.item}-${index}`,
        code: codes[index] ?? '',
        rubro: row.rubro,
        producto: row.producto,
        subproducto: row.subproducto,
        descripcion: row.descripcion,
        cant: row.cant === null ? '—' : row.cant.toLocaleString('es-EC'),
        unidad: row.unidad,
        dias: row.dias === null ? '—' : row.dias.toLocaleString('es-EC'),
        observacion: row.observacion,
        responsible: null,
        responsibleId: null,
      }));
  const hasMatrix = showConfirmed || proposal !== null;
  const rubroCount = new Set(rows.map((row) => row.rubro.trim().toLowerCase())).size;
  const unassigned = showConfirmed ? confirmed.totals.unassignedCount : 0;
  const matrixKind = demo ? 'datos de demostración' : showConfirmed ? 'matriz confirmada' : 'propuesta IA';
  const processDisabledReason = !ai.ready
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
          <>
            <button type="button" className="btn" disabled title="Disponible en la etapa D (tabla editable)">
              + Ítem
            </button>
            <label htmlFor={TDR_INPUT_ID} className="btn btn-p cursor-pointer">
              Cargar TDR
            </label>
          </>
        }
      />

      <Card
        title="Documento TDR"
        actions={
          <ProcessButton
            documentId={latest?.id ?? null}
            disabled={!latest || !ai.ready || extractionActive}
            disabledReason={latest ? processDisabledReason : 'Primero carga el PDF del TDR.'}
            label={extraction ? '◆ Volver a procesar con IA' : '◆ Procesar TDR con IA'}
          />
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
                  {document.extractionCount === 0 ? (
                    <DeleteDocumentButton id={document.id} filename={document.originalFilename} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {extraction ? <ExtractionPanel extraction={extraction} output={proposal} /> : null}
        {!ai.ready ? (
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
        <TdrUploader projectId={project.id} maxBytes={maxTdrBytes()} compact={documents.length > 0} />
        <div className="border-t border-line px-4 pt-3 pb-4">
          <ProjectValueForm projectId={project.id} version={project.version} initial={projectValueToForm(project)} />
        </div>
      </Card>

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
        scope={hasMatrix ? `${rows.length} ítems en ${rubroCount} rubros (${matrixKind})` : 'Sin matriz todavía'}
        documentLabel={latest ? latest.originalFilename : 'Sin cargar'}
      />

      <Card
        title="Matriz de entregables"
        actions={
          <button type="button" className="btn" disabled title="Disponible en una etapa posterior">
            Exportar Excel
          </button>
        }
      >
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
                  <tr key={row.key} className={showConfirmed || demo ? 'align-top' : 'align-top text-vi'}>
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
                      {showConfirmed ? (
                        <ResponsibleSelect
                          itemId={row.key}
                          itemLabel={row.code}
                          workerId={row.responsibleId}
                          workerName={row.responsible}
                          workers={workers.map((worker) => ({ id: worker.id, name: worker.fullName }))}
                        />
                      ) : (
                        <select className="field" disabled aria-label="Responsable" title="Se asigna en la etapa D (tabla editable)">
                          <option>—</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={MATRIX_COLUMNS.length} className="p-0">
                    <EmptyState icon="▦" title={hasMatrix ? 'La IA no encontró requerimientos' : 'Sin ítems todavía'}>
                      <p>
                        {hasMatrix
                          ? 'El documento se procesó y no se identificaron bienes, servicios ni personal. Revisa la observación de la ficha propuesta.'
                          : 'La matriz se llenará al procesar el TDR con IA, agrupada por rubro (1.1, 1.2…). También podrás agregar, editar y eliminar ítems, y elegir un responsable para cada uno.'}
                      </p>
                    </EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-bg px-4 py-2.5 text-[11.5px] text-mut">
          <span>
            {hasMatrix ? `${rows.length} ítems · ${rubroCount} rubros · ` : '0 ítems · 0 rubros'}
            {showConfirmed ? `${unassigned} sin responsable · ` : null}
            {hasMatrix ? (
              demo ? (
                <b className="font-semibold text-wa">datos de demostración (ilustrativos), matriz confirmada</b>
              ) : showConfirmed ? (
                <b className="font-semibold text-ok">matriz confirmada</b>
              ) : (
                <b className="font-semibold text-vi">◆ propuesta IA, solo lectura hasta la etapa D</b>
              )
            ) : null}
          </span>
          <span className="ml-auto">
            {workers.length === 0 ? (
              <>
                Sin trabajadores activos para asignar.{' '}
                <Link href="/operacion/trabajadores/nuevo" className="text-bl hover:underline">
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
      </Card>

      {confirmed && quoteRequests.length > 0 ? (
        <QuotesCards requests={quoteRequests} lines={quoteLines} items={confirmed.items} currency={project.currency} />
      ) : null}

      <Note>
        Los valores que proponga la IA se mostrarán en <b className="text-vi">violeta</b> con el rótulo «Propuesta IA» hasta que
        los confirmes. La IA nunca asigna responsables.
      </Note>
    </>
  );
}
