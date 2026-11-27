import { cookies } from 'next/headers';
import { getProject, listProjects, type Project } from '@erp/db';
import { db } from './db';

const COOKIE = 'erp_proyecto';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Proyectos para el selector superior y el proyecto activo (cookie o el más reciente). */
export async function loadProjectContext(): Promise<{ projects: Project[]; current: Project | null }> {
  const projects = await listProjects(db());
  const id = (await cookies()).get(COOKIE)?.value;
  const current = (id && UUID.test(id) ? projects.find((p) => p.id === id) : undefined) ?? projects[0] ?? null;
  return { projects, current };
}

export async function getCurrentProject(): Promise<Project | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (id && UUID.test(id)) {
    const project = await getProject(db(), id);
    if (project) return project;
  }
  return (await listProjects(db()))[0] ?? null;
}

/** Solo desde Server Actions. */
export async function setCurrentProjectCookie(id: string): Promise<void> {
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
}
