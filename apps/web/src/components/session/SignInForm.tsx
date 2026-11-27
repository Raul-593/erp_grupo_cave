'use client';

import { useActionState } from 'react';
import { signInAsDev } from '@/server/actions/session';

export interface SignInGroup {
  label: string;
  users: { id: string; label: string }[];
}

/** «Entrar como…»: lista de usuarios activos agrupados por tipo (solo desarrollo local). */
export function SignInForm({ groups }: { groups: SignInGroup[] }) {
  const [state, action, pending] = useActionState(signInAsDev, null);
  return (
    <form action={action} className="grid gap-3">
      <label className="label" htmlFor="userId">
        Entrar como
      </label>
      <select id="userId" name="userId" className="field" defaultValue="" required autoFocus>
        <option value="" disabled>
          Elige un usuario…
        </option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="submit" className="btn btn-p justify-center" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      {state?.message ? (
        <p role="alert" className="text-[12px] text-ba">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
