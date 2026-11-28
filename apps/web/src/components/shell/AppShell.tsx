'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { NavLink, NavModule } from '@/lib/navigation';
import { selectProject } from '@/server/actions/projects';
import { signOut } from '@/server/actions/session';
import { BoxIcon, MenuIcon, ThemeIcon, UsersIcon } from './icons';

export interface ShellProject {
  id: string;
  name: string;
}

export interface ShellUser {
  fullName: string;
  roleLabel: string;
}

const MODULE_ICONS = { box: BoxIcon, users: UsersIcon } as const;

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

/**
 * Al cambiar de módulo o de pestaña con un enlace, la página nueva empieza arriba. Se guarda fuera
 * del componente porque cada módulo monta su propio AppShell. «Atrás» y «Adelante» no pasan por
 * aquí y conservan la posición que restaura el navegador.
 */
let scrollTopOnNavigation = false;

function requestScrollTop() {
  scrollTopOnNavigation = true;
}

/**
 * Barra lateral con los módulos del rol, barra superior (selector de proyecto si el módulo lo
 * usa, usuario y «Cerrar sesión») y pestañas del módulo.
 */
export function AppShell({
  user,
  modules,
  tabs,
  projects,
  currentProjectId,
  children,
}: {
  user: ShellUser;
  modules: NavModule[];
  tabs: NavLink[];
  /** Sin valor, el módulo no usa el selector de proyecto. */
  projects?: ShellProject[];
  currentProjectId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);

  // En el celular las pestañas no caben: la activa queda siempre a la vista.
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  useEffect(() => {
    if (!scrollTopOnNavigation) return;
    scrollTopOnNavigation = false;
    window.scrollTo(0, 0);
  }, [pathname]);

  // Con el menú abierto en el celular, el contenido de atrás no se desplaza.
  useEffect(() => {
    if (!menuOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [menuOpen]);

  return (
    <div className="grid min-h-dvh grid-cols-1 shell:grid-cols-[14.25rem_1fr]">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-50 bg-black/40 shell:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-60 flex w-57 max-w-[85vw] flex-col overflow-y-auto overscroll-contain bg-nav pb-[max(0.875rem,env(safe-area-inset-bottom))] transition-transform duration-200 shell:sticky shell:h-dvh shell:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-4.5 pt-4.5 pb-4 text-white">
          <div className="grid size-6.5 flex-none place-items-center rounded-[0.4375rem] bg-bl text-xs font-semibold">C</div>
          <div>
            <b className="text-sm font-semibold tracking-[0.06em]">CAVE ERP</b>
            <span className="mt-px block text-[0.53125rem] tracking-[0.16em] text-white/40">HOLDING</span>
          </div>
        </div>
        <div className="px-4.5 pt-4 pb-1.75 text-[0.53125rem] tracking-[0.16em] text-white/30 uppercase">Gestión</div>
        <nav aria-label="Módulos">
          {modules.map((module) => {
            const Icon = MODULE_ICONS[module.icon];
            const active = pathname.startsWith(module.prefix);
            return (
              <Link
                key={module.prefix}
                href={module.href}
                onClick={() => {
                  setMenuOpen(false);
                  requestScrollTop();
                }}
                aria-current={active ? 'page' : undefined}
                className={`relative flex w-full items-center gap-2.5 px-4.5 py-2 text-[0.6875rem] font-medium tracking-[0.07em] uppercase ${
                  active
                    ? 'bg-white/7 text-white before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-bl'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon />
                <span>{module.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/8 px-4.5 pt-3.5 text-[0.6875rem] leading-relaxed text-white/55">
          Prototipo local
          <span className="block text-[0.5625rem] tracking-[0.08em] text-white/35 uppercase">Ingreso de desarrollo · 127.0.0.1</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-13.5 items-center gap-2 border-b border-line bg-card px-3 shell:gap-3.5 shell:px-5.5">
          <button
            type="button"
            className="grid size-9 flex-none place-items-center rounded-md text-mut hover:bg-bg hover:text-ink shell:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <MenuIcon />
          </button>
          {projects ? (
            <form action={selectProject} className="flex min-w-0 items-center gap-1.5 rounded-md border border-line bg-card px-2.25 py-1.25">
              <label htmlFor="proyecto-activo" className="hidden text-[0.53125rem] tracking-[0.1em] text-mut2 uppercase min-[26rem]:block">
                Proyecto
              </label>
              {projects.length > 0 ? (
                <select
                  id="proyecto-activo"
                  aria-label="Proyecto"
                  name="projectId"
                  defaultValue={currentProjectId ?? undefined}
                  key={currentProjectId ?? 'ninguno'}
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                  className="w-full min-w-0 cursor-pointer bg-card text-base font-medium text-ellipsis outline-none shell:w-auto shell:max-w-60 shell:text-[0.78125rem]"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span id="proyecto-activo" className="text-[0.78125rem] text-mut">
                  Sin proyectos
                </span>
              )}
            </form>
          ) : null}
          <div className="ml-auto flex flex-none items-center gap-1 shell:gap-2">
            <div className="hidden text-right leading-tight min-[35rem]:block">
              <b className="block text-[0.75rem] font-semibold">{user.fullName}</b>
              <span className="text-[0.59375rem] tracking-[0.08em] text-mut2 uppercase">{user.roleLabel}</span>
            </div>
            <form action={signOut}>
              <button type="submit" className="btn !px-2.5 !py-1 text-[0.71875rem]" title={`Cerrar la sesión de ${user.fullName}`}>
                Cerrar sesión
              </button>
            </form>
            <button
              type="button"
              onClick={toggleTheme}
              title="Modo claro u oscuro"
              aria-label="Cambiar entre modo claro y oscuro"
              className="grid size-9 flex-none place-items-center rounded-md text-mut hover:bg-bg hover:text-ink shell:size-7.5"
            >
              <ThemeIcon />
            </button>
          </div>
        </header>

        {tabs.length > 0 ? (
          <nav
            ref={tabsRef}
            aria-label="Pestañas del módulo"
            className="sticky top-13.5 z-29 flex gap-0.5 overflow-x-auto border-b border-line bg-card px-1 shell:px-5.5"
          >
            {tabs.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={requestScrollTop}
                  aria-current={active ? 'page' : undefined}
                  className={`border-b-2 px-3.25 py-2.75 text-[0.65625rem] font-medium tracking-[0.07em] whitespace-nowrap uppercase ${
                    active ? 'border-bl text-bl' : 'border-transparent text-mut hover:text-ink'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <main className="w-full max-w-355 px-3 py-4 shell:p-5.5">{children}</main>
      </div>
    </div>
  );
}
