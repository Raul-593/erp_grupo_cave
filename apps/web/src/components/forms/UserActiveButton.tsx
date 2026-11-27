'use client';

import { useActionState } from 'react';
import { IDLE } from '@/lib/action-state';
import { setUserActive } from '@/server/actions/users';

/** Activa o desactiva un usuario y muestra el motivo si la base lo impide (último superusuario). */
export function UserActiveButton({ id, version, active, name }: { id: string; version: number; active: boolean; name: string }) {
  const [state, action, pending] = useActionState(setUserActive, IDLE);
  return (
    <form action={action} className="grid justify-items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <button type="submit" className="btn" disabled={pending} aria-label={`${active ? 'Desactivar' : 'Activar'} a ${name}`}>
        {active ? 'Desactivar' : 'Activar'}
      </button>
      {state.status === 'error' ? (
        <p role="alert" className="max-w-[240px] text-right text-[11px] text-ba">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
