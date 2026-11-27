'use client';

import { useState, useTransition, type ReactNode } from 'react';
import type { ActivityStatus, CheckResult, ContractStatus, MountStatus } from '@erp/db';
import type { InlineResult } from '@/lib/action-state';
import { formatAmount } from '@/lib/format';
import { ACTIVITY_STATUS, CHECK_RESULT, CONTRACT_STATUS, MOUNT_STATUS } from '@/lib/labels';
import { assignResponsible, updateItemPlan } from '@/server/actions/planning';
import { updateActivityField, updateCheckResult, updateMountStatus } from '@/server/actions/status';

export interface Option {
  id: string;
  name: string;
}

/**
 * Guardado en línea: cada dato se envía al servidor al cambiarlo. Mientras se guarda, el
 * control queda deshabilitado; si el servidor lo rechaza, se muestra el motivo y la pantalla
 * conserva el valor guardado (que llega de nuevo desde el servidor).
 */
export function useInlineSave<Field extends string>() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  // Cuenta los guardados rechazados: sirve de clave para devolver un campo de texto a su valor guardado.
  const [rejections, setRejections] = useState(0);
  const reject = (field: Field, message: string) => {
    setError({ field, message });
    setRejections((count) => count + 1);
  };
  const save = (field: Field, work: () => Promise<InlineResult>) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) reject(field, result.message);
      } catch {
        reject(field, 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.');
      }
    });
  };
  return { pending, error, save, rejections };
}

export function InlineError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 max-w-[220px] text-[11px] leading-snug whitespace-normal text-ba">
      {message}
    </p>
  );
}

/** Opciones de una lista: las activas más la actual si ya no está activa (para no perderla de vista). */
export function withCurrent(options: Option[], currentId: string | null, currentName: string | null, suffix: string): Option[] {
  if (!currentId || options.some((option) => option.id === currentId)) return options;
  return [{ id: currentId, name: `${currentName ?? 'Registro'} (${suffix})` }, ...options];
}

export const SELECT_CLASS = 'field min-w-[150px] !py-[5px] disabled:opacity-60';

/** Responsable de un ítem: lista de trabajadores activos; se guarda al elegir. */
export function ResponsibleSelect({
  itemId,
  itemLabel,
  workerId,
  workerName,
  workers,
}: {
  itemId: string;
  itemLabel: string;
  workerId: string | null;
  workerName: string | null;
  workers: Option[];
}) {
  const { pending, error, save } = useInlineSave<'worker'>();
  const [draft, setDraft] = useState('');
  return (
    <>
      <select
        className={SELECT_CLASS}
        aria-label={`Responsable del ítem ${itemLabel}`}
        value={pending ? draft : (workerId ?? '')}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          save('worker', () => assignResponsible({ itemId, expectedWorkerId: workerId ?? '', workerId: next }));
        }}
      >
        <option value="">Sin asignar</option>
        {withCurrent(workers, workerId, workerName, 'inactivo').map((worker) => (
          <option key={worker.id} value={worker.id}>
            {worker.name}
          </option>
        ))}
      </select>
      <InlineError message={error?.message} />
    </>
  );
}

const CONTRACT_OPTIONS = Object.entries(CONTRACT_STATUS) as [ContractStatus, (typeof CONTRACT_STATUS)[ContractStatus]][];

/** Texto de un importe para un campo de entrada, en formato es-EC y sin símbolo: «8.400,50». */
export const amountText = (amount: string | null) => (amount === null ? '' : formatAmount(amount, 'USD').slice(1));

/**
 * Celdas editables de una fila de la matriz de planificación: responsable, proveedor, costo,
 * actividades (solo lectura) y contrato. Comparten un mismo guardado porque proveedor, costo y
 * contrato viven en el mismo registro y cada cambio sube su versión.
 */
export function PlanCells({
  itemId,
  itemLabel,
  workerId,
  workerName,
  workers,
  supplierId,
  supplierName,
  suppliers,
  plannedCost,
  contractStatus,
  planVersion,
  currencySymbol,
  activities,
}: {
  itemId: string;
  itemLabel: string;
  workerId: string | null;
  workerName: string | null;
  workers: Option[];
  supplierId: string | null;
  supplierName: string | null;
  suppliers: Option[];
  plannedCost: string | null;
  contractStatus: ContractStatus | null;
  planVersion: number | null;
  currencySymbol: string;
  activities: ReactNode;
}) {
  const { pending, error, save, rejections } = useInlineSave<'supplierId' | 'plannedCost' | 'contractStatus'>();
  const [draft, setDraft] = useState<{ field: string; value: string }>({ field: '', value: '' });
  const version = planVersion === null ? '' : String(planVersion);
  const send = (field: 'supplierId' | 'plannedCost' | 'contractStatus', value: string) => {
    setDraft({ field, value });
    save(field, () => updateItemPlan({ itemId, version, field, value }));
  };
  const shown = (field: string, saved: string) => (pending && draft.field === field ? draft.value : saved);
  const savedCost = amountText(plannedCost);

  return (
    <>
      <td>
        <ResponsibleSelect itemId={itemId} itemLabel={itemLabel} workerId={workerId} workerName={workerName} workers={workers} />
      </td>
      <td>
        <select
          className={SELECT_CLASS}
          aria-label={`Proveedor del ítem ${itemLabel}`}
          value={shown('supplierId', supplierId ?? '')}
          disabled={pending}
          onChange={(event) => send('supplierId', event.target.value)}
        >
          <option value="">Sin proveedor</option>
          {withCurrent(suppliers, supplierId, supplierName, 'inactivo').map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <InlineError message={error?.field === 'supplierId' ? error.message : undefined} />
      </td>
      <td className="num">
        <span className="inline-flex items-center gap-1">
          <span className="text-mut" aria-hidden>
            {currencySymbol}
          </span>
          <input
            // La clave reinicia el campo cuando llega un costo distinto o se rechaza lo escrito.
            key={`${savedCost}:${rejections}`}
            className="field w-[104px] !py-[5px] text-right tabular-nums disabled:opacity-60"
            aria-label={`Costo asignado del ítem ${itemLabel}`}
            inputMode="decimal"
            autoComplete="off"
            defaultValue={savedCost}
            placeholder="—"
            disabled={pending}
            aria-invalid={error?.field === 'plannedCost' ? true : undefined}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next !== savedCost) send('plannedCost', next);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                event.currentTarget.value = savedCost;
                event.currentTarget.blur();
              }
            }}
          />
        </span>
        <InlineError message={error?.field === 'plannedCost' ? error.message : undefined} />
      </td>
      <td className="text-mut">{activities}</td>
      <td>
        <select
          className={`${SELECT_CLASS} !min-w-[112px]`}
          aria-label={`Contrato del ítem ${itemLabel}`}
          value={shown('contractStatus', contractStatus ?? '')}
          disabled={pending}
          onChange={(event) => send('contractStatus', event.target.value)}
        >
          {contractStatus === null ? <option value="">Sin definir</option> : null}
          {CONTRACT_OPTIONS.map(([value, [label]]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <InlineError message={error?.field === 'contractStatus' ? error.message : undefined} />
      </td>
    </>
  );
}

const ACTIVITY_OPTIONS = Object.entries(ACTIVITY_STATUS) as [ActivityStatus, (typeof ACTIVITY_STATUS)[ActivityStatus]][];

/**
 * Celdas editables de una actividad: responsable y estado (con las fechas y la dependencia,
 * de solo lectura, entre ambas). Comparten guardado porque viven en el mismo registro.
 */
export function ActivityCells({
  id,
  name,
  version,
  wholeTeam,
  workerId,
  workerName,
  workers,
  status,
  children,
}: {
  id: string;
  name: string;
  version: number;
  wholeTeam: boolean;
  workerId: string | null;
  workerName: string | null;
  workers: Option[];
  status: ActivityStatus | null;
  /** Celdas de solo lectura que van entre el responsable y el estado. */
  children: ReactNode;
}) {
  const { pending, error, save } = useInlineSave<'workerId' | 'status'>();
  const [draft, setDraft] = useState<{ field: string; value: string }>({ field: '', value: '' });
  const send = (field: 'workerId' | 'status', value: string) => {
    setDraft({ field, value });
    save(field, () => updateActivityField({ id, version: String(version), field, value }));
  };
  const shown = (field: string, saved: string) => (pending && draft.field === field ? draft.value : saved);

  return (
    <>
      <td>
        {wholeTeam ? (
          'Equipo completo'
        ) : (
          <>
            <select
              className={SELECT_CLASS}
              aria-label={`Responsable de la actividad ${name}`}
              value={shown('workerId', workerId ?? '')}
              disabled={pending}
              onChange={(event) => send('workerId', event.target.value)}
            >
              <option value="">Sin asignar</option>
              {withCurrent(workers, workerId, workerName, 'inactivo').map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
            <InlineError message={error?.field === 'workerId' ? error.message : undefined} />
          </>
        )}
      </td>
      {children}
      <td>
        <select
          className={`${SELECT_CLASS} !min-w-[124px]`}
          aria-label={`Estado de la actividad ${name}`}
          value={shown('status', status ?? '')}
          disabled={pending}
          onChange={(event) => send('status', event.target.value)}
        >
          <option value="">Sin registrar</option>
          {ACTIVITY_OPTIONS.map(([value, [label]]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <InlineError message={error?.field === 'status' ? error.message : undefined} />
      </td>
    </>
  );
}

/** Lista desplegable que guarda un único valor al cambiarlo. */
function SavingSelect({
  label,
  value,
  options,
  onSave,
  className = '',
}: {
  label: string;
  value: string;
  options: readonly (readonly [value: string, label: string])[];
  onSave: (value: string) => Promise<InlineResult>;
  className?: string;
}) {
  const { pending, error, save } = useInlineSave<'value'>();
  const [draft, setDraft] = useState('');
  return (
    <>
      <select
        className={`${SELECT_CLASS} ${className}`}
        aria-label={label}
        value={pending ? draft : value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          save('value', () => onSave(next));
        }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <InlineError message={error?.message} />
    </>
  );
}

const MOUNT_OPTIONS = Object.entries(MOUNT_STATUS) as [MountStatus, string][];

/** Estado de montaje de un ítem. */
export function MountSelect({
  itemId,
  itemLabel,
  status,
  version,
}: {
  itemId: string;
  itemLabel: string;
  status: MountStatus;
  version: number | null;
}) {
  return (
    <SavingSelect
      label={`Estado de montaje del ítem ${itemLabel}`}
      value={status}
      options={MOUNT_OPTIONS}
      className="!min-w-[124px]"
      onSave={(value) => updateMountStatus({ itemId, version: version === null ? '' : String(version), value })}
    />
  );
}

const CHECK_OPTIONS = (Object.entries(CHECK_RESULT) as [CheckResult, (typeof CHECK_RESULT)[CheckResult]][]).map(
  ([value, [label]]) => [value, label] as const,
);

/** Resultado de un control del checklist previo. */
export function CheckResultSelect({
  id,
  description,
  result,
  version,
}: {
  id: string;
  description: string;
  result: CheckResult;
  version: number;
}) {
  return (
    <SavingSelect
      label={`Resultado de: ${description}`}
      value={result}
      options={CHECK_OPTIONS}
      className="!min-w-[116px]"
      onSave={(value) => updateCheckResult({ id, version: String(version), value })}
    />
  );
}
