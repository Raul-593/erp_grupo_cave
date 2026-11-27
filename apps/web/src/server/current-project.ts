import { cookies } from 'next/headers';
import { getProject, listProjects, type Project } from '@erp/db';
import { getSessionUser, visibleProjectIds, type SessionUser } from './auth';
import { db } from './db';

const COOKIE = 'erp_proyecto';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Proyectos que el usuario puede ver (el empleado de campo, solo los que tienen ítems suyos). */
export async function listVisibleProjects(user: SessionUser): Promise<Project[]> {
  const [projects, visible] = await Promise.all([listProjects(db()), visibleProjectIds(user)]);
  return visible === null ? projects : projects.filter((project) => visible.has(project.id));
}

/** Proyectos para el selector superior y el proyecto activo (cookie o el más reciente). */
export async function loadProjectContext(user: SessionUser): Promise<{ projects: Project[]; current: Project | null }> {
  const projects = await listVisibleProjects(user);
  const id = (await cookies()).get(COOKIE)?.value;
  const current = (id && UUID.test(id) ? projects.find((p) => p.id === id) : undefined) ?? projects[0] ?? null;
  return { projects, current };
}

/**
 * Proyecto activo dentro del alcance del usuario de la sesión. Una cookie con un proyecto que
 * el usuario no puede ver se ignora.
 */
export async function getCurrentProject(): Promise<Project | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const visible = await visibleProjectIds(user);
  const id = (await cookies()).get(COOKIE)?.value;
  if (id && UUID.test(id) && (visible === null || visible.has(id))) {
    const project = await getProject(db(), id);
    if (project) return project;
  }
  return (await listVisibleProjects(user))[0] ?? null;
}

/** Solo desde Server Actions. */
export async function setCurrentProjectCookie(id: string): Promise<void> {
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
}
