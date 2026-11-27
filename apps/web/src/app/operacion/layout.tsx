import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { loadProjectContext } from '@/server/current-project';

export default async function OperacionLayout({ children }: { children: ReactNode }) {
  const { projects, current } = await loadProjectContext();
  return (
    <AppShell projects={projects.map(({ id, name }) => ({ id, name }))} currentProjectId={current?.id ?? null}>
      {children}
    </AppShell>
  );
}
