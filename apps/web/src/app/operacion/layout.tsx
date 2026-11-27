import type { ReactNode } from 'react';
import { AccessProvider } from '@/components/access';
import { AppShell } from '@/components/shell/AppShell';
import { ROLE_LABELS } from '@/domain/access/permissions';
import { navModules, operationTabs } from '@/lib/navigation';
import { requirePageUser } from '@/server/auth';
import { loadProjectContext } from '@/server/current-project';

export default async function OperacionLayout({ children }: { children: ReactNode }) {
  // Sin sesión lleva a «Entrar»; el proveedor no ve Operación y va a su portal.
  const user = await requirePageUser('projects.read');
  const { projects, current } = await loadProjectContext(user);
  return (
    <AccessProvider user={{ id: user.id, fullName: user.fullName, role: user.role }}>
      <AppShell
        user={{ fullName: user.fullName, roleLabel: ROLE_LABELS[user.role] }}
        modules={navModules(user.role)}
        tabs={operationTabs(user.role)}
        projects={projects.map(({ id, name }) => ({ id, name }))}
        currentProjectId={current?.id ?? null}
      >
        {children}
      </AppShell>
    </AccessProvider>
  );
}
