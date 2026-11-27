'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { Field, fieldProps } from '@/components/forms/fields';
import { FormMessage } from '@/components/ui';
import { IDLE } from '@/lib/action-state';
import { PAYMENT_METHOD, PAYMENT_SUPPORT } from '@/lib/labels';
import { changeItemOrder, createOrder, removePayment, savePayment, updateOrderLineField } from '@/server/actions/procurement';
import { amountText, InlineError, SELECT_CLASS, useInlineSave, withCurrent, type Option } from './inline';

type LineField = 'orderId' | 'amount' | 'paidAmount' | 'paymentWorkerId';

/** Campo de importe que guarda al salir o con Enter (Esc cancela). */
function AmountField({
  label,
  saved,
  disabled,
  invalid,
  symbol,
  resetKey,
  onSave,
}: {
  label: string;
  saved: string;
  disabled: boolean;
  invalid: boolean;
  symbol: string;
  /** Cambia cuando el servidor rechaza un guardado: el campo vuelve a su valor guardado. */
  resetKey: number;
  onSave: (value: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-mut" aria-hidden>
        {symbol}
      </span>
      <input
        // La clave reinicia el campo cuando llega un valor distinto o se rechaza lo escrito.
        key={`${saved}:${resetKey}`}
        className="field w-[96px] !py-[5px] text-right tabular-nums disabled:opacity-60"
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={saved}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        onBlur={(event) => {
          const next = event.target.value.trim();
          if (next !== saved) onSave(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            event.currentTarget.value = saved;
            event.currentTarget.blur();
          }
        }}
      />
    </span>
  );
}

/**
 * Celdas editables de un ítem en «Órdenes por entregable»: orden, responsable de compra (solo
 * lectura), responsable de pago, costo, pagado, saldo y estado. Sin orden, solo se puede elegir
 * una; el costo mostrado es el asignado en Planificación.
 */
export function OrderCells({
  itemId,
  itemLabel,
  orderId,
  orders,
  lineVersion,
  amount,
  paidAmount,
  plannedCostText,
  balanceText,
  paymentWorkerId,
  paymentWorkerName,
  workers,
  buyerName,
  currencySymbol,
  status,
}: {
  itemId: string;
  itemLabel: string;
  orderId: string | null;
  orders: Option[];
  lineVersion: number | null;
  amount: string | null;
  paidAmount: string | null;
  /** Costo asignado ya formateado, para los ítems sin orden. */
  plannedCostText: string;
  balanceText: string;
  paymentWorkerId: string | null;
  paymentWorkerName: string | null;
  workers: Option[];
  buyerName: string | null;
  currencySymbol: string;
  status: ReactNode;
}) {
  const { pending, error, save, rejections } = useInlineSave<LineField>();
  const [draft, setDraft] = useState<{ field: string; value: string }>({ field: '', value: '' });
  const ordered = lineVersion !== null;
  const version = ordered ? String(lineVersion) : '';
  const shown = (field: string, saved: string) => (pending && draft.field === field ? draft.value : saved);
  const sendLine = (field: 'amount' | 'paidAmount' | 'paymentWorkerId', value: string) => {
    setDraft({ field, value });
    save(field, () => updateOrderLineField({ itemId, version, field, value }));
  };
  const message = (field: LineField) => (error?.field === field ? error.message : undefined);

  return (
    <>
      <td>
        <select
          className={`${SELECT_CLASS} !min-w-[112px]`}
          aria-label={`Orden del ítem ${itemLabel}`}
          value={shown('orderId', orderId ?? '')}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            setDraft({ field: 'orderId', value: next });
            save('orderId', () => changeItemOrder({ itemId, version, orderId: next }));
          }}
        >
          <option value="">Sin orden</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.name}
            </option>
          ))}
        </select>
        <InlineError message={message('orderId')} />
      </td>
      <td>{buyerName ?? <span className="text-mut">—</span>}</td>
      <td>
        {ordered ? (
          <>
            <select
              className={SELECT_CLASS}
              aria-label={`Responsable de pago del ítem ${itemLabel}`}
              value={shown('paymentWorkerId', paymentWorkerId ?? '')}
              disabled={pending}
              onChange={(event) => sendLine('paymentWorkerId', event.target.value)}
            >
              <option value="">Sin asignar</option>
              {withCurrent(workers, paymentWorkerId, paymentWorkerName, 'inactivo').map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
            <InlineError message={message('paymentWorkerId')} />
          </>
        ) : (
          <span className="text-mut">—</span>
        )}
      </td>
      <td className="num">
        {ordered ? (
          <>
            <AmountField
              label={`Costo en la orden del ítem ${itemLabel}`}
              saved={amountText(amount)}
              disabled={pending}
              invalid={error?.field === 'amount'}
              symbol={currencySymbol}
              resetKey={rejections}
              onSave={(value) => sendLine('amount', value)}
            />
            <InlineError message={message('amount')} />
          </>
        ) : (
          plannedCostText
        )}
      </td>
      <td className="num">
        {ordered ? (
          <>
            <AmountField
              label={`Pagado del ítem ${itemLabel}`}
              saved={amountText(paidAmount)}
              disabled={pending}
              invalid={error?.field === 'paidAmount'}
              symbol={currencySymbol}
              resetKey={rejections}
              onSave={(value) => sendLine('paidAmount', value)}
            />
            <InlineError message={message('paidAmount')} />
          </>
        ) : (
          <span className="text-mut">—</span>
        )}
      </td>
      <td className="num">{balanceText}</td>
      <td>{status}</td>
    </>
  );
}

/** Alta rápida de una orden vacía. */
export function NewOrderForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(createOrder, IDLE);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5 border-t border-line bg-bg px-4 py-2.5" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor="nueva-orden" className="text-[9px] font-semibold tracking-[0.1em] text-mut2 uppercase">
        Nueva orden
      </label>
      <input
        id="nueva-orden"
        name="code"
        // Tras crearla, el campo vuelve vacío; con error conserva lo escrito.
        key={state.status === 'ok' ? state.message : 'codigo'}
        defaultValue={state.status === 'error' ? (state.values?.['code'] ?? '') : ''}
        className="field !w-[150px] !py-[5px]"
        placeholder="Código, p. ej. OC-019"
        maxLength={40}
        autoComplete="off"
        aria-invalid={state.fieldErrors?.['code'] ? true : undefined}
      />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Creando…' : '+ Crear orden'}
      </button>
      <FormMessage status={state.status} message={state.fieldErrors?.['code']?.[0] ?? state.message} />
    </form>
  );
}

/** Botón que elimina un pago tras confirmar. */
export function DeletePaymentButton({ id, version, summary }: { id: string; version: number; summary: string }) {
  const { pending, error, save } = useInlineSave<'delete'>();
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`¿Eliminar el pago ${summary}? Esta acción no se puede deshacer.`)) {
            save('delete', () => removePayment({ id, version }));
          }
        }}
      >
        {pending ? 'Eliminando…' : 'Eliminar'}
      </button>
      <InlineError message={error?.message} />
    </>
  );
}

/** Alta y edición de un pago contra una orden. */
export function PaymentForm({ orders, initial }: { orders: Option[]; initial?: Record<string, string> }) {
  const [state, action, pending] = useActionState(savePayment, IDLE);
  const values = state.values ?? initial ?? { method: 'transfer', support: 'invoice_and_receipt' };
  const errors = state.fieldErrors;
  const editing = Boolean(initial?.['id']);

  return (
    <form action={action} className="grid gap-4 p-4 md:grid-cols-2" noValidate>
      {editing ? (
        <>
          <input type="hidden" name="id" value={initial?.['id']} />
          <input type="hidden" name="version" value={initial?.['version']} />
        </>
      ) : null}
      <Field name="orderId" label="Orden" errors={errors}>
        <select {...fieldProps('orderId', values, errors)}>
          <option value="">Selecciona…</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="paidOn" label="Fecha del pago" errors={errors}>
        <input type="date" {...fieldProps('paidOn', values, errors)} />
      </Field>
      <Field name="concept" label="Concepto" errors={errors} className="md:col-span-2">
        <input {...fieldProps('concept', values, errors)} maxLength={200} autoComplete="off" />
      </Field>
      <Field name="amount" label="Monto" errors={errors} hint="Por ejemplo 8.400,50">
        <input {...fieldProps('amount', values, errors)} inputMode="decimal" autoComplete="off" />
      </Field>
      <Field name="method" label="Forma de pago" errors={errors}>
        <select {...fieldProps('method', values, errors)}>
          {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field name="support" label="Respaldo" errors={errors}>
        <select {...fieldProps('support', values, errors)}>
          {Object.entries(PAYMENT_SUPPORT).map(([value, [label]]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-p" disabled={pending}>
          {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar pago'}
        </button>
        <Link href="/operacion/abastecimiento" className="btn">
          Cancelar
        </Link>
        <FormMessage status={state.status} message={state.message} />
      </div>
      <p className="text-[11.5px] text-mut md:col-span-2">
        Registrar un pago no cambia lo pagado de cada ítem: ese valor se escribe en la tabla «Órdenes por entregable».
      </p>
    </form>
  );
}
