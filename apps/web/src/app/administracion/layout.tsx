import type { ReactNode } from 'react';
import { AccessProvider } from '@/components/access';
import { AppShell } from '@/components/shell/AppShell';
import { ROLE_LABELS } from '@/domain/access/permissions';
import { adminTabs, navModules } from '@/lib/navigation';
import { requirePageUser } from '@/server/auth';

export default async function AdministracionLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser('users.manage');
  return (
    <AccessProvider user={{ id: user.id, fullName: user.fullName, role: user.role }}>
      <AppShell user={{ fullName: user.fullName, roleLabel: ROLE_LABELS[user.role] }} modules={navModules(user.role)} tabs={adminTabs(user.role)}>
        {children}
      </AppShell>
    </AccessProvider>
  );
}
