import type { ReactNode } from 'react';

type Tone = 'ok' | 'wa' | 'ba' | 'bl' | 'vi' | 'neutral';

const PILL_TONES: Record<Tone, string> = {
  ok: 'bg-okb text-ok',
  wa: 'bg-wab text-wa',
  ba: 'bg-bab text-ba',
  bl: 'bg-bl2 text-bl',
  vi: 'bg-vib text-vi',
  neutral: 'bg-bg text-mut',
};

/** Etiqueta de estado («pill») del prototipo. */
export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-[7px] py-[3px] text-[9.5px] font-semibold tracking-[0.05em] uppercase ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-[18px] flex flex-wrap items-start gap-5">
      <div>
        <h1 className="text-[17px] font-semibold tracking-[0.05em] uppercase">{title}</h1>
        {subtitle ? <p className="mt-[5px] max-w-[78ch] text-[12.5px] text-mut">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ml-auto flex flex-wrap gap-[7px]">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="card">
      {title || actions ? (
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          {title ? <h2 className="text-[10.5px] font-semibold tracking-[0.1em] text-ink2 uppercase">{title}</h2> : null}
          {actions ? <div className="ml-auto flex items-center gap-[7px]">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon = '◷', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-16 text-center text-mut">
      <div className="mx-auto mb-3.5 grid size-11 place-items-center rounded-[10px] bg-bl2 text-lg text-bl" aria-hidden>
        {icon}
      </div>
      <h3 className="mb-[7px] text-sm font-semibold tracking-[0.04em] text-ink uppercase">{title}</h3>
      {children ? <div className="mx-auto max-w-[52ch] text-[12.5px] leading-[1.7]">{children}</div> : null}
    </div>
  );
}

/** Nota informativa azul del prototipo. */
export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-bl2 px-[13px] py-[11px] text-xs leading-[1.6] text-ink2">{children}</div>;
}

/** Cuadrícula etiqueta/valor («ficha») del prototipo. */
export function FichaGrid({ items }: { items: { label: string; value: ReactNode; ai?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(152px,1fr))] gap-px bg-line">
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-3">
          <dt className="text-[8.5px] font-semibold tracking-[0.1em] text-mut2 uppercase">{item.label}</dt>
          <dd className={`mt-[5px] text-[13px] font-medium ${item.ai ? 'text-vi' : ''}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FieldError({ errors }: { errors?: string[] | undefined }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-[11.5px] text-ba">{errors[0]}</p>;
}

export function FormMessage({ status, message }: { status: 'idle' | 'ok' | 'error'; message?: string | undefined }) {
  if (status === 'idle' || !message) return null;
  return (
    <p role={status === 'error' ? 'alert' : 'status'} className={`text-xs ${status === 'error' ? 'text-ba' : 'text-ok'}`}>
      {message}
    </p>
  );
}
