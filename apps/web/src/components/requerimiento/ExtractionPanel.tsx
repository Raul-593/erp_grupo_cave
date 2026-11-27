import type { ExtractionSummary } from '@erp/db';
import { FichaGrid, Pill } from '@/components/ui';
import type { ExtractionOutput } from '@/domain/tdr-extraction/contract';
import { summarizeOutput } from '@/domain/tdr-extraction/contract';
import { formatDateTime } from '@/lib/format';

export const EXTRACTION_STATUS = {
  pending: ['En cola', 'neutral'],
  processing: ['Procesando', 'bl'],
  processed: ['Procesado', 'vi'],
  failed: ['Error', 'ba'],
  confirmed: ['Confirmado', 'ok'],
  superseded: ['Reemplazado', 'neutral'],
} as const;

const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

function formatNumber(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-EC', { maximumFractionDigits: 4 });
}

/** Último intento de extracción de un documento: estado, metadatos y propuesta de la IA. */
export function ExtractionPanel({ extraction, output }: { extraction: ExtractionSummary; output: ExtractionOutput | null }) {
  const [label, tone] = EXTRACTION_STATUS[extraction.status];
  const active = extraction.status === 'pending' || extraction.status === 'processing';
  const seconds = extraction.durationMs === null ? null : Math.round(extraction.durationMs / 100) / 10;
  const summary = output ? summarizeOutput(output) : null;

  return (
    <div className="border-t border-line px-4 py-3.5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[9px] font-semibold tracking-[0.1em] text-mut2 uppercase">Último procesamiento</span>
        <Pill tone={tone}>{label}</Pill>
        {summary ? (
          <Pill tone="vi">
            ◆ Propuesta IA · {summary.items} ítems en {summary.rubros} rubros
          </Pill>
        ) : null}
        <span className="text-[11.5px] text-mut">
          {extraction.provider} · {extraction.model} · prompt {extraction.promptVersion} · esquema {extraction.schemaVersion}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] text-mut2">
        Iniciado el {formatDateTime(extraction.createdAt)}
        {seconds !== null ? ` · duración ${seconds.toLocaleString('es-EC')} s` : ''}
        {extraction.totalTokens !== null
          ? ` · tokens: ${dash(extraction.inputTokens)} entrada, ${dash(extraction.outputTokens)} salida`
          : ''}
        {active ? ' · la página se actualiza sola' : ''}
      </p>
      {extraction.status === 'failed' && extraction.errorMessage ? (
        <p role="alert" className="mt-2 text-xs text-ba">
          {extraction.errorMessage}
        </p>
      ) : null}

      {output ? (
        <div className="mt-3 overflow-hidden rounded-md border border-line">
          <div className="bg-vib px-3 py-1.5 text-[9px] font-semibold tracking-[0.1em] text-vi uppercase">
            ◆ Ficha propuesta por la IA (sin aplicar)
          </div>
          <FichaGrid
            items={[
              { label: 'Contratante', value: dash(output.ficha.contratante), ai: true },
              { label: 'RUC', value: dash(output.ficha.ruc_contratante), ai: true },
              { label: 'Proceso', value: dash(output.ficha.codigo_proceso), ai: true },
              { label: 'Objeto', value: dash(output.ficha.objeto), ai: true },
              {
                label: 'Valor',
                value:
                  output.ficha.monto === null
                    ? '—'
                    : `${formatNumber(output.ficha.monto)} ${output.ficha.moneda ?? ''}${
                        output.ficha.incluye_iva === null ? '' : output.ficha.incluye_iva ? ' · con IVA' : ' · sin IVA'
                      }`,
                ai: true,
              },
              { label: 'Sedes', value: output.ficha.sedes.length ? output.ficha.sedes.join(' · ') : '—', ai: true },
              {
                label: 'Plazo',
                value: [output.ficha.fecha_inicio, output.ficha.fecha_fin, output.ficha.plazo].filter(Boolean).join(' · ') || '—',
                ai: true,
              },
              { label: 'Administrador', value: dash(output.ficha.administrador_contrato), ai: true },
              { label: 'Observación', value: dash(output.ficha.observacion), ai: true },
            ]}
          />
        </div>
      ) : null}

      {extraction.rawResponse !== null ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11.5px] font-medium text-bl">
            {extraction.status === 'failed'
              ? 'Ver la respuesta recibida y los problemas encontrados (para ajustar el prompt)'
              : 'Ver el JSON original de la IA'}
          </summary>
          <pre className="mt-2 max-h-[420px] overflow-auto rounded-md bg-bg p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink2">
            {JSON.stringify(extraction.rawResponse, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
