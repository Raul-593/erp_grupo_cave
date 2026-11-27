'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Field, fieldProps } from '@/components/forms/fields';
import { FieldError, FormMessage, Pill } from '@/components/ui';
import { IDLE } from '@/lib/action-state';
import { proposeAllocation } from '@/lib/allocation';
import { ALLOCATION_PREFIX, RAISE_COST_FIRST } from '@/lib/constants';
import { formatAmount } from '@/lib/format';
import { PAYMENT_METHOD, PAYMENT_SUPPORT } from '@/lib/labels';
import { compareAmounts, subtractAmounts, sumAmounts } from '@/lib/money';
import { parseDecimal } from '@/lib/parse';
import { savePayment } from '@/server/actions/procurement';
import { amountText, type Option } from './inline';

/** Ítem de una orden tal como lo necesita el reparto de un pago. Importes en texto decimal exacto. */
export interface PaymentLine {
  orderId: string;
  itemId: string;
  /** Numeración de pantalla (1.1, 1.2…). */
  code: string;
  producto: string;
  /** Costo del ítem en la orden. */
  amount: string;
  /** Lo que ya le repartieron los demás pagos (sin contar el que se está editando). */
  paidByOthers: string;
}

/** Importe escrito: texto decimal exacto, null si está vacío o undefined si no es válido. */
function readAmount(text: string): string | null | undefined {
  const value = parseDecimal(text);
  return typeof value === 'string' && /\.\d{3,}$/.test(value) ? undefined : value;
}

/** Reparto guardado de un pago que se edita: id del ítem → importe escrito. */
function savedAllocations(initial: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(initial ?? {})
      .filter(([key]) => key.startsWith(ALLOCATION_PREFIX))
      .map(([key, value]) => [key.slice(ALLOCATION_PREFIX.length), value]),
  );
}

/**
 * Alta y edición de un pago contra una orden, con su reparto entre los ítems de esa orden.
 * En un pago nuevo el sistema propone el reparto (en el orden de la matriz, hasta el saldo de
 * cada ítem) y el usuario puede ajustarlo; lo que no se reparte queda «sin repartir». El
 * servidor vuelve a validar todo.
 */
export function PaymentForm({
  orders,
  lines,
  currency,
  initial,
}: {
  orders: Option[];
  lines: PaymentLine[];
  currency: string | null;
  initial?: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(savePayment, IDLE);
  const values = state.values ?? initial ?? { method: 'transfer', support: 'invoice_and_receipt' };
  const errors = state.fieldErrors;
  const editing = Boolean(initial?.['id']);
  const saved = savedAllocations(initial);
  const savedOrderId = initial?.['orderId'] ?? '';

  const [orderId, setOrderId] = useState(savedOrderId);
  const [amountInput, setAmountInput] = useState(initial?.['amount'] ?? '');
  // null: se muestra la propuesta automática. Si no, lo que hay escrito por ítem.
  const [manual, setManual] = useState<Record<string, string> | null>(editing ? saved : null);

  const money = (amount: string) => formatAmount(amount, currency);
  const symbol = currency === null || currency === 'USD' ? '$' : currency;
  const orderLines = lines.filter((line) => line.orderId === orderId);
  const amount = readAmount(amountInput);
  const balanceOf = (line: PaymentLine) => subtractAmounts(line.amount, line.paidByOthers);
  const proposal = new Map(
    (typeof amount === 'string' ? proposeAllocation(amount, orderLines.map((line) => ({ itemId: line.itemId, balance: balanceOf(line) }))) : []).map(
      (part) => [part.itemId, amountText(part.amount)],
    ),
  );
  const written = (itemId: string) => (manual ? (manual[itemId] ?? '') : (proposal.get(itemId) ?? ''));

  const rows = orderLines.map((line) => {
    const text = written(line.itemId);
    const part = readAmount(text);
    const balance = balanceOf(line);
    return { line, text, balance, part, invalid: part === undefined, over: typeof part === 'string' && compareAmounts(part, balance) > 0 };
  });
  const allocated = sumAmounts(rows.map((row) => (typeof row.part === 'string' ? row.part : null)));
  const rest = typeof amount === 'string' ? subtractAmounts(amount, allocated) : null;
  const overBalance = rows.some((row) => row.over);
  const overPayment = rest !== null && compareAmounts(rest, '0') < 0;
  const blocked = overBalance || overPayment || rows.some((row) => row.invalid);
  // Decisión R-4: un pago ya repartido no cambia de orden hasta guardarlo sin reparto.
  const lockedOrder = editing && Object.keys(saved).length > 0 && orderId !== savedOrderId;

  // Tras cada envío React restablece el formulario a sus valores por defecto, y una lista solo fija
  // su opción por defecto al montarse: la clave la vuelve a montar con lo que se envió, para que un
  // rechazo del servidor no devuelva la lista a su primera opción.
  const selectKey = (name: string) => `${name}:${values[name] ?? ''}`;

  const changeOrder = (next: string) => {
    setOrderId(next);
    if (!editing) setManual(null);
    else setManual(next === savedOrderId ? saved : {});
  };

  return (
    <form action={action} className="grid gap-4 p-4 md:grid-cols-2" noValidate>
      {editing ? (
        <>
          <input type="hidden" name="id" value={initial?.['id']} />
          <input type="hidden" name="version" value={initial?.['version']} />
        </>
      ) : null}
      <Field name="orderId" label="Orden" errors={errors}>
        <select key={selectKey('orderId')} {...fieldProps('orderId', values, errors)} onChange={(event) => changeOrder(event.target.value)}>
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
        <input
          {...fieldProps('amount', values, errors)}
          defaultValue={undefined}
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
        />
      </Field>
      <Field name="method" label="Forma de pago" errors={errors}>
        <select key={selectKey('method')} {...fieldProps('method', values, errors)}>
          {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field name="support" label="Respaldo" errors={errors}>
        <select key={selectKey('support')} {...fieldProps('support', values, errors)}>
          {Object.entries(PAYMENT_SUPPORT).map(([value, [label]]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="min-w-0 md:col-span-2">
        <legend className="label">Reparto entre los ítems de la orden</legend>
        {lockedOrder ? (
          <p role="alert" className="mb-2 rounded-md bg-wab px-[13px] py-[11px] text-xs leading-[1.6] text-ink2">
            Este pago ya está repartido entre ítems de su orden actual. Para cambiarlo de orden, guárdalo primero sin reparto (en su orden
            actual, con los importes en blanco) y después elige la nueva orden.
          </p>
        ) : null}
        {orderId === '' ? (
          <p className="text-xs text-mut">Elige la orden para ver sus ítems y repartir el pago.</p>
        ) : orderLines.length === 0 ? (
          <p className="text-xs text-mut">
            Esta orden todavía no tiene ítems: el pago quedará sin repartir. Cuando le asignes ítems, edita el pago para repartirlo.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Ítem</th>
                    <th scope="col">Producto</th>
                    <th scope="col" className="num">
                      Costo
                    </th>
                    <th scope="col" className="num">
                      {editing ? 'Pagado con otros pagos' : 'Ya pagado'}
                    </th>
                    <th scope="col" className="num">
                      Saldo
                    </th>
                    <th scope="col" className="num">
                      De este pago
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ line, text, balance, invalid, over }) => {
                    const name = `${ALLOCATION_PREFIX}${line.itemId}`;
                    return (
                      <tr key={line.itemId}>
                        <td>
                          <b className="font-semibold tabular-nums">{line.code}</b>
                        </td>
                        <td>{line.producto}</td>
                        <td className="num">{money(line.amount)}</td>
                        <td className="num">{money(line.paidByOthers)}</td>
                        <td className="num">{money(balance)}</td>
                        <td className="num">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-mut" aria-hidden>
                              {symbol}
                            </span>
                            <input
                              name={name}
                              className="field !w-[112px] !py-[5px] text-right tabular-nums"
                              aria-label={`De este pago para el ítem ${line.code}`}
                              inputMode="decimal"
                              autoComplete="off"
                              value={text}
                              aria-invalid={invalid || over || errors?.[name] ? true : undefined}
                              onChange={(event) =>
                                setManual({ ...(manual ?? Object.fromEntries(proposal)), [line.itemId]: event.target.value })
                              }
                            />
                          </span>
                          {over ? (
                            <p role="alert" className="mt-1 ml-auto max-w-[240px] text-[11px] leading-snug whitespace-normal text-ba">
                              Supera el saldo del ítem ({money(balance)}). Primero sube su costo en la orden.
                            </p>
                          ) : invalid ? (
                            <p role="alert" className="mt-1 text-[11px] text-ba">
                              Escribe un número, por ejemplo 8.400,50.
                            </p>
                          ) : (
                            <FieldError errors={errors?.[name]} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs">
              <span>
                Repartido <b className="font-semibold tabular-nums">{money(allocated)}</b>
                {typeof amount === 'string' ? (
                  <>
                    {' '}
                    de <b className="font-semibold tabular-nums">{money(amount)}</b>
                  </>
                ) : null}
              </span>
              {rest === null ? null : overPayment ? (
                <Pill tone="ba">Supera el monto en {money(subtractAmounts('0', rest))}</Pill>
              ) : compareAmounts(rest, '0') > 0 ? (
                <Pill tone="wa">Sin repartir {money(rest)}</Pill>
              ) : (
                <Pill tone="ok">Repartido por completo</Pill>
              )}
              <span className="ml-auto flex flex-wrap gap-[7px]">
                <button type="button" className="btn" onClick={() => setManual(null)} disabled={manual === null}>
                  Proponer reparto
                </button>
                <button type="button" className="btn" onClick={() => setManual({})}>
                  Dejar sin repartir
                </button>
              </span>
            </div>
          </>
        )}
      </fieldset>

      {overBalance ? (
        <div role="alert" className="rounded-md bg-bab px-[13px] py-[11px] text-xs leading-[1.6] text-ba md:col-span-2">
          <b className="font-semibold">No se puede pagar a un ítem más que su costo en la orden.</b> {RAISE_COST_FIRST}
        </div>
      ) : overPayment ? (
        <div role="alert" className="rounded-md bg-bab px-[13px] py-[11px] text-xs leading-[1.6] text-ba md:col-span-2">
          El reparto entre los ítems suma más que el monto del pago. Baja algún importe o sube el monto.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-p" disabled={pending || blocked}>
          {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar pago'}
        </button>
        <Link href="/operacion/abastecimiento" className="btn">
          Cancelar
        </Link>
        <FormMessage status={state.status} message={state.message} />
      </div>
      <p className="text-[11.5px] text-mut md:col-span-2">
        Lo pagado de cada ítem es la suma de lo que le reparten los pagos; ya no se escribe a mano. El reparto se propone en el orden de la
        matriz hasta el saldo de cada ítem y puedes ajustarlo. Lo que no repartas queda «sin repartir» y se puede asignar después editando el
        pago.
      </p>
    </form>
  );
}
