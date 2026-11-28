import type { ReactNode } from 'react';

/** Marco de las páginas de ingreso y de cambio de contraseña. */
export function AuthFrame({ children, subtitle = 'Ingreso' }: { children: ReactNode; subtitle?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4">
      <section className="card w-full max-w-[440px]">
        <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <div className="grid size-[26px] flex-none place-items-center rounded-[7px] bg-bl text-xs font-semibold text-white">C</div>
          <div>
            <b className="text-sm font-semibold tracking-[0.06em]">CAVE ERP</b>
            <span className="mt-px block text-[9px] tracking-[0.14em] text-mut2 uppercase">{subtitle}</span>
          </div>
        </header>
        <div className="grid gap-4 px-5 py-5">{children}</div>
      </section>
    </main>
  );
}
