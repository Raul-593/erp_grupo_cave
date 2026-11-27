'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { selectProject } from '@/server/actions/projects';
import { BoxIcon, MenuIcon, ThemeIcon } from './icons';

const TABS = [
  { href: '/operacion/proyectos', label: 'Proyectos' },
  { href: '/operacion/requerimiento', label: 'Requerimiento' },
  { href: '/operacion/planificacion', label: 'Planificación' },
  { href: '/operacion/abastecimiento', label: 'Abastecimiento' },
  { href: '/operacion/ejecucion', label: 'Ejecución' },
  { href: '/operacion/trabajadores', label: 'Trabajadores' },
  { href: '/operacion/proveedores', label: 'Proveedores' },
];

export interface ShellProject {
  id: string;
  name: string;
}

function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  try {
    localStorage.setItem('erp-theme', next);
  } catch {
    // Sin almacenamiento local: el tema solo dura esta visita.
  }
}

/** Barra lateral, barra superior con selector de proyecto y pestañas de Operación. */
export function AppShell({
  projects,
  currentProjectId,
  children,
}: {
  projects: ShellProject[];
  currentProjectId: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="grid min-h-screen grid-cols-1 min-[881px]:grid-cols-[228px_1fr]">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-50 bg-black/40 min-[881px]:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed top-0 z-60 flex h-screen w-[228px] flex-col overflow-auto bg-nav pb-3.5 transition-[left] duration-200 min-[881px]:sticky min-[881px]:left-0 ${
          menuOpen ? 'left-0' : '-left-[240px]'
        }`}
      >
        <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-4 text-white">
          <div className="grid size-[26px] flex-none place-items-center rounded-[7px] bg-bl text-xs font-semibold">C</div>
          <div>
            <b className="text-sm font-semibold tracking-[0.06em]">CAVE ERP</b>
            <span className="mt-px block text-[8.5px] tracking-[0.16em] text-white/40">HOLDING</span>
          </div>
        </div>
        <div className="px-[18px] pt-4 pb-[7px] text-[8.5px] tracking-[0.16em] text-white/30 uppercase">Gestión</div>
        <nav aria-label="Módulos">
          <Link
            href="/operacion/requerimiento"
            onClick={() => setMenuOpen(false)}
            aria-current={pathname.startsWith('/operacion') ? 'page' : undefined}
            className="relative flex w-full items-center gap-2.5 bg-white/7 px-[18px] py-2 text-[11px] font-medium tracking-[0.07em] text-white uppercase before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-bl"
          >
            <BoxIcon />
            <span>Operación</span>
          </Link>
        </nav>
        <div className="mt-auto border-t border-white/8 px-[18px] pt-3.5 text-[11px] leading-relaxed text-white/55">
          Prototipo local
          <span className="block text-[9px] tracking-[0.08em] text-white/35 uppercase">Sin autenticación · 127.0.0.1</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[54px] items-center gap-3.5 border-b border-line bg-card px-[22px]">
          <button
            type="button"
            className="grid size-[30px] place-items-center rounded-md text-mut hover:bg-bg hover:text-ink min-[881px]:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <MenuIcon />
          </button>
          <form action={selectProject} className="flex items-center gap-1.5 rounded-md border border-line bg-card px-[9px] py-[5px]">
            <label htmlFor="proyecto-activo" className="text-[8.5px] tracking-[0.1em] text-mut2 uppercase">
              Proyecto
            </label>
            {projects.length > 0 ? (
              <select
                id="proyecto-activo"
                name="projectId"
                defaultValue={currentProjectId ?? undefined}
                key={currentProjectId ?? 'ninguno'}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                className="max-w-[108px] cursor-pointer bg-card text-[12.5px] font-medium outline-none min-[881px]:max-w-[240px]"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : (
              <span id="proyecto-activo" className="text-[12.5px] text-mut">
                Sin proyectos
              </span>
            )}
          </form>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title="Modo claro u oscuro"
              aria-label="Cambiar entre modo claro y oscuro"
              className="grid size-[30px] place-items-center rounded-md text-mut hover:bg-bg hover:text-ink"
            >
              <ThemeIcon />
            </button>
          </div>
        </header>

        <nav
          aria-label="Operación"
          className="sticky top-[54px] z-29 flex gap-0.5 overflow-x-auto border-b border-line bg-card px-[22px]"
        >
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 px-[13px] py-[11px] text-[10.5px] font-medium tracking-[0.07em] whitespace-nowrap uppercase ${
                  active ? 'border-bl text-bl' : 'border-transparent text-mut hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <main className="w-full max-w-[1420px] p-4 min-[881px]:p-[22px]">{children}</main>
      </div>
    </div>
  );
}
