import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ProjectEvent } from '@erp/db';
import { formatAmount, formatQuantity } from '@/lib/format';
import { sumAmounts } from '@/lib/money';
import type { MatrixRow } from '@/server/matrix';
import { OperationalSelect, ResponsibleSelect, type Option } from './inline';

/** Dirección de una pantalla conservando el evento que se está viendo. */
export function eventHref(basePath: string, eventId: string | null | undefined, params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  if (eventId) query.set('evento', eventId);
  const text = query.toString();
  return text ? `${basePath}?${text}` : basePath;
}

/**
 * Pestañas de evento de un proyecto con varios eventos (migración 0011): dejan a la vista cuál
 * se está viendo. Todo lo que hay debajo (ítems e indicadores) es solo de ese evento.
 */
export function EventTabs({
  basePath,
  events,
  current,
  params,
}: {
  basePath: string;
  events: readonly ProjectEvent[];
  current: ProjectEvent | null;
  /** Otros parámetros de la dirección que deben conservarse (por ejemplo, la vista). */
  params?: Record<string, string | undefined>;
}) {
  if (events.length === 0) return null;
  return (
    <div className="mb-4 rounded-md border border-line bg-card px-3.5 py-3">
      <nav aria-label="Evento" className="flex flex-wrap items-center gap-2">
        <span className="text-[0.5625rem] font-semibold tracking-[0.1em] text-mut2 uppercase">Evento</span>
        {events.map((event) => {
          const active = event.id === current?.id;
          return (
            <Link
              key={event.id}
              href={eventHref(basePath, event.id, params)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[0.3125rem] border px-3.5 py-2 text-[0.71875rem] font-semibold tracking-[0.05em] uppercase ${
                active ? 'border-bl bg-bl text-white' : 'border-line text-ink2 hover:border-bl hover:text-bl'
              }`}
            >
              {event.name}
            </Link>
          );
        })}
      </nav>
      {current ? (
        <p className="mt-2 text-[0.71875rem] text-mut">
          Estás viendo <b className="font-semibold text-ink">{current.name}</b>
          {current.scheduleText ? ` · ${current.scheduleText}` : ''}
        </p>
      ) : null}
    </div>
  );
}

/** Ítems consecutivos del mismo producto, en el orden de la matriz. */
export interface ProductGroup {
  key: string;
  tdrRef: string | null;
  producto: string;
  productoCodigo: string | null;
  productoDescripcion: string | null;
  items: MatrixRow[];
}

export function groupByProduct(items: readonly MatrixRow[]): ProductGroup[] {
  const groups: ProductGroup[] = [];
  for (const item of items) {
    const key = `${item.eventId ?? ''}|${item.tdrRef ?? ''}|${item.rubro.trim().toLocaleLowerCase('es')}`;
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else {
      groups.push({
        key,
        tdrRef: item.tdrRef,
        producto: item.producto,
        productoCodigo: item.productoCodigo,
        productoDescripcion: item.productoDescripcion,
        items: [item],
      });
    }
  }
  return groups;
}

/** Encabezado de un producto: número del TDR, nombre, código y su descripción en el TDR. */
export function ProductHeading({ group, extra }: { group: ProductGroup; extra?: ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {group.tdrRef ? <span className="rounded bg-nav px-1.5 py-0.5 text-[0.65625rem] font-semibold text-white tabular-nums">{group.tdrRef}</span> : null}
        <b className="text-[0.78125rem] font-semibold tracking-[0.03em] uppercase">{group.producto}</b>
        {group.productoCodigo ? <span className="text-[0.65625rem] text-mut2">{group.productoCodigo}</span> : null}
        <span className="text-[0.65625rem] text-mut2">
          {group.items.length} {group.items.length === 1 ? 'requerimiento' : 'requerimientos'}
        </span>
        {extra}
      </div>
      {group.productoDescripcion ? (
        <details className="mt-1 text-[0.71875rem] text-mut">
          <summary className="cursor-pointer select-none text-bl">Descripción del TDR</summary>
          <p className="mt-1 max-w-[110ch] leading-[1.55] whitespace-pre-line normal-case">{group.productoDescripcion}</p>
        </details>
      ) : null}
    </>
  );
}

/** Botón que lleva a las fotografías de un ítem, con su cantidad. */
export function PhotosLink({ item, canUpload, large = false }: { item: MatrixRow; canUpload: boolean; large?: boolean }) {
  const none = item.evidenceCount === 0;
  return (
    <Link
      href={eventHref(`/operacion/ejecucion/${item.id}`, item.eventId)}
      className={`btn whitespace-nowrap ${large ? '!px-3.5 !py-2.5' : ''} ${none && canUpload ? '!border-bl !text-bl' : ''}`}
      aria-label={`Fotografías del ítem ${item.code}: ${item.evidenceCount}. ${canUpload ? 'Ver y subir' : 'Ver'}`}
    >
      <span aria-hidden>◎</span>
      <span aria-hidden>{none ? (canUpload ? 'Subir foto' : 'Sin fotos') : `${item.evidenceCount} ${item.evidenceCount === 1 ? 'foto' : 'fotos'}`}</span>
    </Link>
  );
}

/**
 * Matriz de un evento con todas las columnas de la matriz de costos: producto con su
 * descripción, subproducto o requerimiento, proveedor, días, cantidad, precio unitario,
 * subtotal, saldo, estado operativo, fotografías y responsable.
 */
export function EventMatrixTable({
  items,
  currency,
  workers,
  showCosts,
  showBalance,
  canUpload,
}: {
  items: readonly MatrixRow[];
  currency: string | null;
  workers: Option[];
  /** Precio unitario y subtotal. */
  showCosts: boolean;
  /** Saldo (subtotal menos anticipos): dato de pagos. */
  showBalance: boolean;
  canUpload: boolean;
}) {
  const groups = groupByProduct(items);
  const columns = 8 + (showCosts ? 2 : 0) + (showBalance ? 1 : 0);
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">Ítem</th>
            <th scope="col">Subproducto / requerimiento</th>
            <th scope="col">Proveedor</th>
            <th scope="col" className="num">
              Días
            </th>
            <th scope="col" className="num">
              Cant.
            </th>
            {showCosts ? (
              <>
                <th scope="col" className="num">
                  P. unit
                </th>
                <th scope="col" className="num">
                  Subtotal
                </th>
              </>
            ) : null}
            {showBalance ? (
              <th scope="col" className="num">
                Saldo
              </th>
            ) : null}
            <th scope="col">Estado operativo</th>
            <th scope="col">Fotos</th>
            <th scope="col">Responsable</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <ProductRows key={group.key} group={group} columns={columns}>
              {group.items.map((item) => {
                const status = item.operationalStatus ?? 'pending';
                const negative = item.costBalance?.startsWith('-') ?? false;
                return (
                  <tr key={item.id} className="align-top">
                    <td>
                      <b className="font-semibold tabular-nums">{item.code}</b>
                    </td>
                    <td className="min-w-65">
                      <b className="font-semibold">{item.subproducto ?? item.producto}</b>
                      {item.categoria ? <small>{item.categoria}</small> : null}
                      {item.descripcion ? <p className="mt-1 text-[0.71875rem] leading-[1.5] text-ink2">{item.descripcion}</p> : null}
                      {item.observacion ? <p className="mt-1 text-[0.6875rem] leading-[1.5] whitespace-pre-line text-mut">{item.observacion}</p> : null}
                    </td>
                    <td>{item.supplierName ?? <span className="text-mut">—</span>}</td>
                    <td className="num">{formatQuantity(item.dias)}</td>
                    <td className="num">{formatQuantity(item.cant)}</td>
                    {showCosts ? (
                      <>
                        <td className="num whitespace-nowrap">{formatAmount(item.unitPrice, currency)}</td>
                        <td className="num whitespace-nowrap">{formatAmount(item.plannedCost, currency)}</td>
                      </>
                    ) : null}
                    {showBalance ? (
                      <td className={`num whitespace-nowrap ${negative ? 'font-semibold text-ba' : ''}`}>
                        {formatSigned(item.costBalance, currency)}
                        {item.advance1 !== null && (item.advance1 !== '0.00' || item.advance2 !== '0.00') ? (
                          <small>anticipos {formatAmount(sumAmounts([item.advance1, item.advance2]), currency)}</small>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap">
                      <OperationalSelect itemId={item.id} itemLabel={item.code} status={status} version={item.executionVersion} />
                    </td>
                    <td>
                      <PhotosLink item={item} canUpload={canUpload} />
                    </td>
                    <td className="whitespace-nowrap">
                      <ResponsibleSelect itemId={item.id} itemLabel={item.code} workerId={item.workerId} workerName={item.workerName} workers={workers} />
                    </td>
                  </tr>
                );
              })}
            </ProductRows>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductRows({ group, columns, children }: { group: ProductGroup; columns: number; children: ReactNode }) {
  return (
    <>
      <tr className="!bg-bg">
        <td colSpan={columns} className="!py-2.5">
          <ProductHeading group={group} />
        </td>
      </tr>
      {children}
    </>
  );
}

/** Importe que puede ser negativo (saldo con anticipos mayores que el subtotal). */
export function formatSigned(value: string | null, currency: string | null): string {
  if (value === null) return '—';
  return value.startsWith('-') ? `−${formatAmount(value.slice(1), currency)}` : formatAmount(value, currency);
}
