'use client';

import { useState, useTransition } from 'react';
import { assignResponsibleToEvent } from '@/server/actions/planning';
import type { Option } from './inline';

/**
 * Responsable en bloque: asigna un mismo trabajador a los ítems del evento que se está viendo,
 * o solo a los de uno de sus productos. Sirve para que el encargado de un evento alcance sus
 * ítems (y pueda subir sus fotografías) sin asignarlos uno por uno.
 */
export function BulkAssign({
  projectId,
  eventId,
  eventName,
  products,
  workers,
}: {
  projectId: string;
  eventId: string;
  eventName: string;
  /** Productos del evento, en el orden de la matriz. */
  products: string[];
  workers: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [workerId, setWorkerId] = useState('');
  const [rubro, setRubro] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  function submit() {
    const worker = workers.find((option) => option.id === workerId);
    if (!worker) return;
    const scope = rubro ? `del producto «${rubro}»` : `de ${eventName}`;
    if (
      !onlyUnassigned &&
      !window.confirm(`Se reemplazará el responsable de TODOS los ítems ${scope} por ${worker.name}, también los que ya tienen uno. ¿Continuar?`)
    ) {
      return;
    }
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await assignResponsibleToEvent({ projectId, eventId, rubro, workerId, onlyUnassigned });
        if (!result.ok) setNotice({ tone: 'error', text: result.message });
        else {
          const changed = result.changed ?? 0;
          setNotice({
            tone: 'ok',
            text:
              changed === 0
                ? 'No había ítems por asignar con esa selección.'
                : `${worker.name} quedó como responsable de ${changed} ${changed === 1 ? 'ítem' : 'ítems'} ${scope}.`,
          });
        }
      } catch {
        setNotice({ tone: 'error', text: 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.' });
      }
    });
  }

  return (
    <div className="border-b border-line bg-bg px-4 py-3">
      <p className="text-[9px] font-semibold tracking-[0.1em] text-mut2 uppercase">Responsable en bloque · {eventName}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2.5">
        <div className="min-w-[190px]">
          <label className="label" htmlFor="bloque-trabajador">
            Trabajador
          </label>
          <select id="bloque-trabajador" className="field" value={workerId} disabled={pending} onChange={(event) => setWorkerId(event.target.value)}>
            <option value="">Elegir…</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] max-w-[340px] flex-1">
          <label className="label" htmlFor="bloque-producto">
            Ítems
          </label>
          <select id="bloque-producto" className="field" value={rubro} disabled={pending} onChange={(event) => setRubro(event.target.value)}>
            <option value="">Todo el evento</option>
            {products.map((product) => (
              <option key={product} value={product}>
                Solo: {product}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-ink2">
          <input type="checkbox" checked={onlyUnassigned} disabled={pending} onChange={(event) => setOnlyUnassigned(event.target.checked)} />
          Solo los que no tienen responsable
        </label>
        <button type="button" className="btn btn-p mb-px" disabled={pending || workerId === ''} onClick={submit}>
          {pending ? 'Asignando…' : 'Asignar'}
        </button>
      </div>
      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs ${notice.tone === 'error' ? 'text-ba' : 'text-ok'}`}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
