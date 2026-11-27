'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
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
          {modules.map((module) => {
            const Icon = MODULE_ICONS[module.icon];
            const active = pathname.startsWith(module.prefix);
            return (
              <Link
                key={module.prefix}
                href={module.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex w-full items-center gap-2.5 px-[18px] py-2 text-[11px] font-medium tracking-[0.07em] uppercase ${
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
        <div className="mt-auto border-t border-white/8 px-[18px] pt-3.5 text-[11px] leading-relaxed text-white/55">
          Prototipo local
          <span className="block text-[9px] tracking-[0.08em] text-white/35 uppercase">Ingreso de desarrollo · 127.0.0.1</span>
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
          {projects ? (
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
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right leading-tight min-[560px]:block">
              <b className="block text-[12px] font-semibold">{user.fullName}</b>
              <span className="text-[9.5px] tracking-[0.08em] text-mut2 uppercase">{user.roleLabel}</span>
            </div>
            <form action={signOut}>
              <button type="submit" className="btn !px-2.5 !py-1 text-[11.5px]" title={`Cerrar la sesión de ${user.fullName}`}>
                Cerrar sesión
              </button>
            </form>
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

        {tabs.length > 0 ? (
          <nav
            aria-label="Pestañas del módulo"
            className="sticky top-[54px] z-29 flex gap-0.5 overflow-x-auto border-b border-line bg-card px-[22px]"
          >
            {tabs.map((tab) => {
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
        ) : null}

        <main className="w-full max-w-[1420px] p-4 min-[881px]:p-[22px]">{children}</main>
      </div>
    </div>
  );
}
