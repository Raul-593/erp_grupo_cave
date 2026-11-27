'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui';
import { IDLE } from '@/lib/action-state';
import { saveProjectValue } from '@/server/actions/projects';
import { ProjectValueFields } from './ProjectValueFields';

/**
 * Formulario autónomo del valor del proyecto: se puede colocar en cualquier pantalla que
 * tenga el proyecto a mano. Guarda en el mismo dato que la ficha y el alta del proyecto.
 */
export function ProjectValueForm({
  projectId,
  version,
  initial,
}: {
  projectId: string;
  version: number;
  /** Valores iniciales de projectValueToForm(). */
  initial: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveProjectValue, IDLE);
  const values = state.status === 'error' && state.values ? state.values : initial;
  const errors = state.status === 'error' ? state.fieldErrors : undefined;

  return (
    <form
      action={action}
      // Al cambiar la versión (guardado aquí o en otra tarjeta) se vuelven a cargar los valores.
      key={version}
      className="grid items-start gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      noValidate
    >
      <input type="hidden" name="id" value={projectId} />
      <input type="hidden" name="version" value={version} />
      <ProjectValueFields values={values} errors={errors} />
      <div className="flex flex-col gap-1.5 sm:pt-[19px]">
        <button type="submit" className="btn btn-p" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar valor'}
        </button>
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}
