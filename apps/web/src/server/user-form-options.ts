import { listSuppliers, listUsers, listWorkers } from '@erp/db';
import type { LinkOption } from '@/components/forms/UserForm';
import { db } from './db';

/**
 * Opciones de vínculo para el formulario de usuario: trabajadores activos (marcando los que ya
 * tienen otro usuario) y proveedores activos. Incluye el vínculo actual aunque esté inactivo.
 */
export async function userFormOptions(current?: { id: string; workerId: string | null; supplierId: string | null }) {
  const [workers, suppliers, users] = await Promise.all([listWorkers(db()), listSuppliers(db()), listUsers(db())]);
  const takenWorkers = new Set(users.filter((user) => user.workerId && user.id !== current?.id).map((user) => user.workerId));
  const workerOptions: LinkOption[] = workers
    .filter((worker) => worker.active || worker.id === current?.workerId)
    .map((worker) => ({ id: worker.id, name: worker.active ? worker.fullName : `${worker.fullName} (inactivo)`, taken: takenWorkers.has(worker.id) }));
  const supplierOptions: LinkOption[] = suppliers
    .filter((supplier) => supplier.active || supplier.id === current?.supplierId)
    .map((supplier) => ({ id: supplier.id, name: supplier.active ? supplier.name : `${supplier.name} (inactivo)` }));
  return { workers: workerOptions, suppliers: supplierOptions };
}
