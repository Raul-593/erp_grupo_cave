'use client';

import { useActionState, useTransition, useState } from 'react';
import { Card, FormMessage, Pill } from '@/components/ui';
import { IDLE } from '@/lib/action-state';
import { applyFichaProposal, startManualMatrix } from '@/server/actions/matrix';

export interface FichaProposalRow {
  field: string;
  label: string;
  current: string;
  proposed: string;
}

export interface FichaClientProposal {
  proposedName: string;
  proposedTaxId: string | null;
  currentName: string;
  matches: { id: string; name: string; taxId: string | null }[];
}

/**
 * Ficha propuesta por la IA frente a la ficha actual del proyecto (D-6). Cada campo se aplica
 * marcándolo; el contratante solo se vincula o se crea si el usuario lo elige. Los valores que
 * se guardan salen del JSON del servidor, no de esta pantalla.
 */
export function FichaProposal({
  projectId,
  projectVersion,
  extractionId,
  rows,
  client,
  observacion,
}: {
  projectId: string;
  projectVersion: number;
  extractionId: string;
  rows: FichaProposalRow[];
  client: FichaClientProposal | null;
  observacion: string | null;
}) {
  const [state, action, pending] = useActionState(applyFichaProposal, IDLE);

  return (
    <Card
      title={
        <>
          Ficha propuesta <Pill tone="vi">◆ Propuesta IA</Pill>
        </>
      }
    >
      <form action={action} key={`${projectVersion}`} className="text-[12.5px]">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="version" value={projectVersion} />
        <input type="hidden" name="extractionId" value={extractionId} />
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Aplicar</th>
                  <th scope="col">Campo</th>
                  <th scope="col">Ficha actual</th>
                  <th scope="col">Propuesta de la IA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field}>
                    <td>
                      <input type="checkbox" name="field" value={row.field} defaultChecked aria-label={`Aplicar ${row.label}`} />
                    </td>
                    <td className="font-semibold">{row.label}</td>
                    <td className="text-mut">{row.current}</td>
                    <td className="text-vi">{row.proposed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {client ? (
          <fieldset className="border-t border-line px-4 py-3">
            <legend className="sr-only">Contratante</legend>
            <p className="mb-1.5 font-semibold">
              Contratante propuesto: <span className="text-vi">{client.proposedName}</span>
              {client.proposedTaxId ? <span className="text-vi"> · RUC {client.proposedTaxId}</span> : null}
            </p>
            <label className="flex items-center gap-2 py-0.5">
              <input type="radio" name="client" value="" defaultChecked />
              Mantener «{client.currentName}»
            </label>
            {client.matches.map((match) => (
              <label key={match.id} className="flex items-center gap-2 py-0.5">
                <input type="radio" name="client" value={match.id} />
                Usar el contratante registrado «{match.name}»{match.taxId ? ` (RUC ${match.taxId})` : ''}
              </label>
            ))}
            <label className="flex items-center gap-2 py-0.5">
              <input type="radio" name="client" value="nuevo" />
              Crear el contratante «{client.proposedName}»
            </label>
          </fieldset>
        ) : null}
        {observacion ? (
          <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-mut">
            <b className="font-semibold text-ink2">Observación de la IA:</b> {observacion}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <button type="submit" className="btn btn-p" disabled={pending}>
            {pending ? 'Aplicando…' : 'Aplicar a la ficha del proyecto'}
          </button>
          <span className="text-[11.5px] text-mut">Desmarca lo que no quieras aplicar. Se puede aplicar antes o después de confirmar la matriz.</span>
          <FormMessage status={state.status} message={state.message} />
        </div>
      </form>
    </Card>
  );
}

/** «Empezar matriz a mano» sobre el TDR cargado (D-1). */
export function StartManualButton({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startManualMatrix(documentId);
            if (!result.ok) setError(result.message);
          });
        }}
      >
        {pending ? 'Creando…' : 'Empezar matriz a mano'}
      </button>
      {error ? (
        <span role="alert" className="text-[12px] text-ba">
          {error}
        </span>
      ) : null}
    </span>
  );
}
