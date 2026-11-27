'use client';

import { useActionState, useState, useTransition } from 'react';
import { FormMessage } from '@/components/ui';
import { InlineError, ResponsibleSelect, useInlineSave, type Option } from '@/components/operacion/inline';
import { IDLE } from '@/lib/action-state';
import type { DraftField } from '@/lib/draft';
import {
  addMatrixItem,
  confirmMatrixAction,
  deleteMatrixItem,
  moveMatrixItem,
  updateMatrixItem,
} from '@/server/actions/matrix';

/** Fila del borrador lista para editar. Los valores vienen como texto para los campos. */
export interface EditorRow {
  id: string;
  code: string;
  version: number;
  values: Record<DraftField, string>;
  /** Campos que siguen tal como los propuso la IA (se ven en violeta, D-5). */
  proposed: DraftField[];
  workerId: string | null;
  workerName: string | null;
  first: boolean;
  last: boolean;
}

export interface EditorGroup {
  number: string;
  rubro: string;
  rows: EditorRow[];
}

export const NEW_ITEM_FIELD_ID = 'nuevo-item-producto';
const RUBROS_LIST_ID = 'rubros-matriz';

const INPUT = 'field !px-2 !py-[5px] read-only:opacity-60';
const NUMBER_INPUT = `${INPUT} w-[74px] text-right tabular-nums`;

/** Campo de una fila que se guarda al salir (Enter guarda, Esc deshace; D-3). */
function DraftInput({
  label,
  value,
  proposed,
  multiline = false,
  className = INPUT,
  pending,
  invalid,
  resetKey,
  listId,
  onSave,
}: {
  label: string;
  value: string;
  proposed: boolean;
  multiline?: boolean;
  className?: string;
  pending: boolean;
  invalid: boolean;
  resetKey: number;
  listId?: string;
  onSave: (value: string) => void;
}) {
  // La clave reinicia el campo cuando llega un valor distinto o se rechaza lo escrito.
  const key = `${value}:${resetKey}`;
  const common = {
    'aria-label': label,
    defaultValue: value,
    readOnly: pending,
    'aria-invalid': invalid ? true : undefined,
    title: proposed ? 'Propuesta IA: todavía sin revisar' : undefined,
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = event.currentTarget.value;
      if (next.trim() !== value.trim()) onSave(next);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.currentTarget.value = value;
        event.currentTarget.blur();
      }
      if (event.key === 'Enter' && !multiline) event.currentTarget.blur();
    },
  };
  const tone = proposed ? ' text-vi' : '';
  return multiline ? (
    <textarea key={key} {...common} rows={2} className={`${className} min-w-[200px] resize-y${tone}`} />
  ) : (
    <input key={key} {...common} list={listId} autoComplete="off" className={`${className}${tone}`} />
  );
}

/** Una fila editable: comparte un mismo guardado porque todos sus campos viven en el mismo registro. */
function DraftRow({ row, workers }: { row: EditorRow; workers: Option[] }) {
  const { pending, error, save, rejections } = useInlineSave<DraftField | 'move' | 'delete'>();
  const proposed = new Set(row.proposed);
  const version = String(row.version);
  const send = (field: DraftField) => (value: string) =>
    save(field, () => updateMatrixItem({ itemId: row.id, version, field, value }));
  const cell = (field: DraftField, label: string, extra: Partial<Parameters<typeof DraftInput>[0]> = {}) => (
    <DraftInput
      label={`${label} del ítem ${row.code}`}
      value={row.values[field]}
      proposed={proposed.has(field)}
      pending={pending}
      invalid={error?.field === field}
      resetKey={rejections}
      onSave={send(field)}
      {...extra}
    />
  );

  return (
    <tr className="align-top">
      <td>
        <b className="font-semibold tabular-nums">{row.code}</b>
      </td>
      <td className="min-w-[190px]">
        {cell('producto', 'Producto')}
        <div className="mt-1">{cell('rubro', 'Rubro', { listId: RUBROS_LIST_ID, className: `${INPUT} !text-[11.5px]` })}</div>
      </td>
      <td className="min-w-[130px]">{cell('subproducto', 'Subproducto')}</td>
      <td>{cell('descripcion', 'Descripción', { multiline: true })}</td>
      <td className="num">{cell('cant', 'Cantidad', { className: NUMBER_INPUT })}</td>
      <td className="min-w-[96px]">{cell('unidad', 'Unidad')}</td>
      <td className="num">{cell('dias', 'Días', { className: NUMBER_INPUT })}</td>
      <td>{cell('observacion', 'Observaciones', { multiline: true })}</td>
      <td className="whitespace-nowrap">
        <ResponsibleSelect itemId={row.id} itemLabel={row.code} workerId={row.workerId} workerName={row.workerName} workers={workers} />
      </td>
      <td className="whitespace-nowrap">
        <div className="flex gap-1">
          <button
            type="button"
            className="btn !px-2 !py-1"
            disabled={pending || row.first}
            aria-label={`Subir el ítem ${row.code}`}
            title="Subir dentro del rubro"
            onClick={() => save('move', () => moveMatrixItem({ itemId: row.id, version, direction: 'up' }))}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn !px-2 !py-1"
            disabled={pending || row.last}
            aria-label={`Bajar el ítem ${row.code}`}
            title="Bajar dentro del rubro"
            onClick={() => save('move', () => moveMatrixItem({ itemId: row.id, version, direction: 'down' }))}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn !px-2 !py-1 text-ba"
            disabled={pending}
            aria-label={`Eliminar el ítem ${row.code}`}
            title="Eliminar el ítem"
            onClick={() => {
              if (window.confirm(`¿Eliminar el ítem ${row.code} «${row.values.producto}»? Las demás filas se renumeran.`)) {
                save('delete', () => deleteMatrixItem({ itemId: row.id, version }));
              }
            }}
          >
            ✕
          </button>
        </div>
        <InlineError message={error?.message} />
      </td>
    </tr>
  );
}

/** Alta de una fila al final de su rubro (o de un rubro nuevo). */
function AddItemForm({ extractionId, defaultRubro }: { extractionId: string; defaultRubro: string }) {
  const [state, action, pending] = useActionState(addMatrixItem, IDLE);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.fieldErrors : undefined;
  return (
    <form action={action} className="grid gap-2 border-t border-line px-4 py-3 md:grid-cols-[180px_1fr_1.4fr_auto] md:items-start">
      <input type="hidden" name="extractionId" value={extractionId} />
      <div>
        <label className="label" htmlFor="nuevo-item-rubro">
          Rubro
        </label>
        <input
          id="nuevo-item-rubro"
          name="rubro"
          list={RUBROS_LIST_ID}
          className="field"
          defaultValue={values['rubro'] ?? defaultRubro}
          key={`rubro:${state.status}:${state.message ?? ''}`}
          autoComplete="off"
          aria-invalid={errors?.['rubro'] ? true : undefined}
        />
        <InlineError message={errors?.['rubro']?.[0]} />
      </div>
      <div>
        <label className="label" htmlFor={NEW_ITEM_FIELD_ID}>
          Producto
        </label>
        <input
          id={NEW_ITEM_FIELD_ID}
          name="producto"
          className="field"
          defaultValue={values['producto'] ?? ''}
          key={`producto:${state.status}:${state.message ?? ''}`}
          autoComplete="off"
          aria-invalid={errors?.['producto'] ? true : undefined}
        />
        <InlineError message={errors?.['producto']?.[0]} />
      </div>
      <div>
        <label className="label" htmlFor="nuevo-item-descripcion">
          Descripción (opcional)
        </label>
        <input
          id="nuevo-item-descripcion"
          name="descripcion"
          className="field"
          defaultValue={values['descripcion'] ?? ''}
          key={`descripcion:${state.status}:${state.message ?? ''}`}
          autoComplete="off"
        />
      </div>
      <div className="md:pt-[19px]">
        <button type="submit" className="btn btn-p" disabled={pending}>
          {pending ? 'Añadiendo…' : '+ Añadir ítem'}
        </button>
      </div>
      {state.message ? (
        <div className="md:col-span-4">
          <FormMessage status={state.status} message={state.message} />
        </div>
      ) : null}
    </form>
  );
}

/** «Confirmar matriz…» con el resumen antes de un paso que no se puede deshacer (D-8). */
function ConfirmMatrix({
  extractionId,
  extractionVersion,
  summary,
  disabled,
}: {
  extractionId: string;
  extractionVersion: number;
  summary: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className="btn btn-p ml-auto" disabled={disabled} onClick={() => setOpen(true)}>
        Confirmar matriz…
      </button>
    );
  }
  return (
    <div role="dialog" aria-label="Confirmar matriz" className="min-w-0 basis-full rounded-md border border-bl bg-bl2 px-4 py-3 text-[12.5px]">
      <p className="font-semibold text-ink">¿Confirmar la matriz de entregables?</p>
      <p className="mt-1 text-ink2">{summary}</p>
      <p className="mt-1 text-ink2">
        Al confirmarla pasa a Planificación, Abastecimiento y Ejecución y <b className="font-semibold">ya no se puede editar</b> (solo el
        responsable de cada ítem). Por ahora el proyecto admite una sola matriz confirmada.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-p"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await confirmMatrixAction({ extractionId, version: String(extractionVersion) });
              if (!result.ok) setError(result.message);
              else setOpen(false);
            });
          }}
        >
          {pending ? 'Confirmando…' : 'Sí, confirmar matriz'}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </button>
        {error ? (
          <span role="alert" className="text-[12px] text-ba">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Matriz de entregables en borrador (etapa D): edición celda a celda, filas agrupadas por
 * rubro con su numeración, alta, orden, eliminación, responsable y confirmación.
 */
export function MatrixEditor({
  extractionId,
  extractionVersion,
  groups,
  workers,
  summary,
}: {
  extractionId: string;
  extractionVersion: number;
  groups: EditorGroup[];
  workers: Option[];
  summary: string;
}) {
  const rubros = groups.map((group) => group.rubro);
  const itemCount = groups.reduce((total, group) => total + group.rows.length, 0);
  return (
    <>
      <datalist id={RUBROS_LIST_ID}>
        {rubros.map((rubro) => (
          <option key={rubro} value={rubro} />
        ))}
      </datalist>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Ítem</th>
              <th scope="col">Producto · rubro</th>
              <th scope="col">Subproducto</th>
              <th scope="col">Descripción</th>
              <th scope="col" className="num">
                Cant.
              </th>
              <th scope="col">Unidad</th>
              <th scope="col" className="num">
                Días
              </th>
              <th scope="col">Observaciones</th>
              <th scope="col">Responsable</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.number}>
              <tr className="bg-bg">
                <th scope="colgroup" colSpan={10} className="!py-2 text-left text-[10.5px] font-semibold tracking-[0.08em] text-ink2 uppercase">
                  {group.number} · {group.rubro}
                  <span className="ml-2 font-normal tracking-normal text-mut normal-case">
                    {group.rows.length} {group.rows.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </th>
              </tr>
              {group.rows.map((row) => (
                <DraftRow key={row.id} row={row} workers={workers} />
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {itemCount === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-mut">La matriz está vacía. Añade el primer ítem con el formulario de abajo.</p>
      ) : null}
      <AddItemForm extractionId={extractionId} defaultRubro={rubros.at(-1) ?? ''} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-bg px-4 py-2.5 text-[11.5px] text-mut">
        <span>{summary}</span>
        <ConfirmMatrix extractionId={extractionId} extractionVersion={extractionVersion} summary={summary} disabled={itemCount === 0} />
      </div>
    </>
  );
}
