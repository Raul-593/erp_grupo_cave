import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSupplier } from '@erp/db';
import { AppShell } from '@/components/shell/AppShell';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { homePath, ROLE_LABELS } from '@/domain/access/permissions';
import { requirePageUser } from '@/server/auth';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'Portal del proveedor' };

/**
 * Portal del proveedor (fuera de la Fase 1): el usuario ya existe y queda vinculado a su
 * proveedor, pero todavía no ve ni responde cotizaciones.
 */
export default async function ProveedorPage() {
  const user = await requirePageUser('quotes.respond');
  if (user.role !== 'supplier' || !user.supplierId) redirect(homePath(user.role));
  const supplier = await getSupplier(db(), user.supplierId);

  return (
    <AppShell user={{ fullName: user.fullName, roleLabel: ROLE_LABELS[user.role] }} modules={[]} tabs={[]}>
      <PageHeader title="Portal del proveedor" subtitle={supplier ? supplier.name : undefined} />
      <Card>
        <EmptyState icon="◷" title="En preparación">
          <p>
            Aquí podrás ver las solicitudes de cotización que te envíe la empresa y registrar tus precios. Este módulo todavía no
            está disponible.
          </p>
        </EmptyState>
      </Card>
    </AppShell>
  );
}
