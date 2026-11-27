'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UserRole } from '@erp/db';
import { can, canDeleteEvidence, type Permission } from '@/domain/access/permissions';

/**
 * Usuario de la sesión para los componentes de cliente. Solo decide qué controles se muestran:
 * el servidor vuelve a comprobar el permiso y el alcance en cada acción.
 */
export interface AccessUser {
  id: string;
  fullName: string;
  role: UserRole;
}

const AccessContext = createContext<AccessUser | null>(null);

export function AccessProvider({ user, children }: { user: AccessUser; children: ReactNode }) {
  return <AccessContext.Provider value={user}>{children}</AccessContext.Provider>;
}

export function useAccessUser(): AccessUser | null {
  return useContext(AccessContext);
}

/** ¿El usuario de la sesión tiene el permiso? Sin sesión, nunca. */
export function useCan(permission: Permission): boolean {
  const user = useContext(AccessContext);
  return user !== null && can(user.role, permission);
}

export function useCanDeleteEvidence(uploadedBy: string | null): boolean {
  const user = useContext(AccessContext);
  return user !== null && canDeleteEvidence(user, uploadedBy);
}
