'use client';

import { useActionState } from 'react';
import { changeOwnPassword, signInWithPassword } from '@/server/actions/session';

function Message({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-[0.75rem] text-ba">
      {text}
    </p>
  );
}

/** Ingreso con correo y contraseña (Supabase Auth). */
export function PasswordSignInForm() {
  const [state, action, pending] = useActionState(signInWithPassword, null);
  return (
    <form action={action} className="grid gap-3">
      <div>
        <label className="label" htmlFor="email">
          Correo
        </label>
        <input id="email" name="email" type="email" className="field" autoComplete="username" inputMode="email" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Contraseña
        </label>
        <input id="password" name="password" type="password" className="field" autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn btn-p justify-center !py-2.5" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      <Message text={state?.message} />
      <p className="text-[0.71875rem] text-mut">¿Olvidaste tu contraseña? Pide al administrador una contraseña temporal nueva.</p>
    </form>
  );
}

/** Cambio de la contraseña propia. */
export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changeOwnPassword, null);
  return (
    <form action={action} className="grid gap-3">
      <div>
        <label className="label" htmlFor="password">
          Contraseña nueva (mínimo {minLength} caracteres)
        </label>
        <input id="password" name="password" type="password" className="field" autoComplete="new-password" minLength={minLength} required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Repite la contraseña nueva
        </label>
        <input id="confirm" name="confirm" type="password" className="field" autoComplete="new-password" minLength={minLength} required />
      </div>
      <button type="submit" className="btn btn-p justify-center !py-2.5" disabled={pending}>
        {pending ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
      <Message text={state?.message} />
    </form>
  );
}
