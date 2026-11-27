import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SupplierKind } from '@erp/db';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui';
import type { Tone } from '@/lib/labels';

const TEXT_TONES: Record<Tone, string> = {
  ok: 'text-ok',
  wa: 'text-wa',
  ba: 'text-ba',
  bl: 'text-bl',
  vi: 'text-vi',
  neutral: '',
};

export interface Kpi {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}

/** Fila de indicadores del prototipo. Los valores se calculan siempre de las filas guardadas. */
export function Kpis({ items }: { items: Kpi[] }) {
  return (
    <dl
      className={`mb-[18px] grid grid-cols-1 gap-[18px] min-[520px]:grid-cols-2 ${
        items.length === 5 ? 'min-[1151px]:grid-cols-5' : 'min-[1151px]:grid-cols-4'
      }`}
    >
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-line bg-card px-4 py-3.5">
          <dt className="text-[9px] font-semibold tracking-[0.1em] text-mut2 uppercase">{item.label}</dt>
          <dd className={`mt-[7px] text-[22px] font-semibold tracking-[-0.01em] tabular-nums ${TEXT_TONES[item.tone ?? 'neutral']}`}>
            {item.value}
          </dd>
          {item.hint ? <dd className="mt-[3px] text-[11.5px] text-mut">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Aviso visible mientras la matriz del proyecto sea la de demostración (AGENTS.md §2). */
export function DemoBanner({ source }: { source: string }) {
  return (
    <div role="note" className="mb-[18px] rounded-md bg-wab px-[13px] py-[11px] text-xs leading-[1.6] text-ink2">
      <b className="font-semibold text-wa">Datos de demostración.</b> Lo que ves aquí son los datos ilustrativos del prototipo ({source}
      ), no los de un TDR real ni una referencia de precios. Los indicadores se calculan de las filas guardadas.
    </div>
  );
}

/** Aviso para el empleado de campo: la pantalla muestra solo sus ítems. */
export function ScopeBanner({ count }: { count: number }) {
  return (
    <div role="note" className="mb-[18px] rounded-md bg-bl2 px-[13px] py-[11px] text-xs leading-[1.6] text-ink2">
      <b className="font-semibold text-bl">Tus ítems.</b> Ves solo {count === 1 ? 'el ítem' : `los ${count} ítems`} de este proyecto donde
      eres responsable, y sus indicadores.
    </div>
  );
}

/**
 * Pantalla de un módulo que todavía no tiene de dónde leer. Sin `canCreate`, el usuario no
 * puede crear proyectos (empleado de campo o contabilidad) y no se le ofrece.
 */
export function ModuleEmpty({
  title,
  subtitle,
  reason,
  canCreate = true,
}: {
  title: string;
  subtitle: string;
  reason: 'project' | 'matrix';
  canCreate?: boolean;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        {reason === 'project' ? (
          <EmptyState icon="◫" title={canCreate ? 'Todavía no hay proyectos' : 'No tienes proyectos asignados'}>
            {canCreate ? (
              <>
                <p>Crea un proyecto y su contratante para empezar.</p>
                <Link href="/operacion/proyectos/nuevo" className="btn btn-p mt-4">
                  + Nuevo proyecto
                </Link>
              </>
            ) : (
              <p>Aquí aparecerán los proyectos donde seas responsable de algún ítem.</p>
            )}
          </EmptyState>
        ) : (
          <EmptyState icon="▦" title="El proyecto no tiene una matriz confirmada">
            <p>
              Este módulo trabaja sobre la matriz de entregables confirmada en Requerimiento. Carga el TDR, procésalo y confirma la
              matriz para verla aquí.
            </p>
            <Link href="/operacion/requerimiento" className="btn mt-4">
              Ir a Requerimiento
            </Link>
          </EmptyState>
        )}
      </Card>
    </>
  );
}

/** Selector de vista («chips» del prototipo) como enlaces: funciona sin JavaScript. */
export function ViewChips({ basePath, current, options }: { basePath: string; current: string; options: readonly (readonly [string, string])[] }) {
  return (
    <nav aria-label="Vista" className="mb-4 flex flex-wrap gap-1.5">
      {options.map(([value, label]) => {
        const active = value === current;
        return (
          <Link
            key={value}
            href={`${basePath}?vista=${value}`}
            aria-current={active ? 'page' : undefined}
            className={`rounded-[5px] border px-[11px] py-[5px] text-[10.5px] font-semibold tracking-[0.05em] uppercase ${
              active ? 'border-transparent bg-bl2 text-bl' : 'border-line text-mut hover:text-ink'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Proveedor de un ítem; los del holding se distinguen en violeta, como en el prototipo. */
export function SupplierName({ name, kind }: { name: string | null; kind: SupplierKind | null }) {
  if (!name) return <span className="text-mut">—</span>;
  return kind === 'holding' ? <Pill tone="vi">{name} · holding</Pill> : <>{name}</>;
}

/** Producto con un texto secundario debajo (rubro o proveedor). */
export function ProductCell({ producto, secondary }: { producto: string; secondary?: string | null }) {
  return (
    <>
      <b className="font-semibold">{producto}</b>
      {secondary ? <small>{secondary}</small> : null}
    </>
  );
}

/** Avance en pasos (puntos del prototipo). */
export function StepDots({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <i key={index} className={`block size-[5px] rounded-full ${index < done ? 'bg-bl' : 'bg-line2'}`} />
        ))}
      </span>
      <span className="text-[11.5px] text-ink2">{label}</span>
      <span className="sr-only">
        (paso {done} de {total})
      </span>
    </div>
  );
}

/** Lista de filas con título, detalle y una etiqueta a la derecha. */
export function RowList({ rows }: { rows: { key: string; title: ReactNode; detail?: ReactNode; right?: ReactNode }[] }) {
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 border-b border-line px-4 py-[11px] last:border-b-0">
          <div className="min-w-0 flex-1">
            <b className="font-semibold">{row.title}</b>
            {row.detail ? <small className="mt-0.5 block text-[11.5px] text-mut2">{row.detail}</small> : null}
          </div>
          {row.right}
        </li>
      ))}
    </ul>
  );
}
