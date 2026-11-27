'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { UserRole } from '@erp/db';
import { FormMessage } from '@/components/ui';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from '@/domain/access/permissions';
import { IDLE } from '@/lib/action-state';
import { saveUser } from '@/server/actions/users';
import { Field, fieldProps } from './fields';

export interface LinkOption {
  id: string;
  name: string;
  /** Ya vinculado a otro usuario (solo trabajadores: uno por usuario). */
  taken?: boolean;
}

/** Alta o edición de un usuario. El vínculo que se pide depende del tipo de usuario. */
export function UserForm({
  initial,
  workers,
  suppliers,
}: {
  initial?: Record<string, string>;
  workers: LinkOption[];
  suppliers: LinkOption[];
}) {
  const [state, action, pending] = useActionState(saveUser, IDLE);
  const values = state.values ?? initial ?? { active: 'on', role: 'field' };
  const errors = state.fieldErrors;
  const editing = Boolean(initial?.['id']);
  const [role, setRole] = useState<UserRole>((values['role'] as UserRole | undefined) ?? 'field');

  return (
    <form action={action} className="grid gap-4 p-4 md:grid-cols-2" noValidate>
      {editing ? (
        <>
          <input type="hidden" name="id" value={initial?.['id']} />
          <input type="hidden" name="version" value={initial?.['version']} />
        </>
      ) : null}
      <Field name="fullName" label="Nombre" errors={errors}>
        <input {...fieldProps('fullName', values, errors)} maxLength={200} required autoFocus={!editing} autoComplete="off" />
      </Field>
      <Field
        name="email"
        label="Correo (opcional por ahora)"
        errors={errors}
        hint="Será obligatorio para entrar cuando se active el ingreso con Supabase."
      >
        <input type="email" {...fieldProps('email', values, errors)} maxLength={200} autoComplete="off" />
      </Field>
      <Field name="role" label="Tipo de usuario" errors={errors} hint={ROLE_DESCRIPTIONS[role]}>
        <select
          {...fieldProps('role', values, errors)}
          defaultValue={undefined}
          value={role}
          onChange={(event) => setRole(event.target.value as UserRole)}
        >
          {ROLES.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>
      {role === 'supplier' ? (
        <Field name="supplierId" label="Proveedor" errors={errors}>
          <select {...fieldProps('supplierId', values, errors)} key="supplier">
            <option value="">Elige el proveedor…</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field
          name="workerId"
          label={role === 'field' ? 'Trabajador' : 'Trabajador (opcional)'}
          errors={errors}
          hint={role === 'field' ? 'Verá y trabajará solo los ítems donde este trabajador es el responsable.' : undefined}
        >
          <select {...fieldProps('workerId', values, errors)} key="worker">
            <option value="">{role === 'field' ? 'Elige el trabajador…' : 'Sin trabajador'}</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id} disabled={worker.taken}>
                {worker.name}
                {worker.taken ? ' (ya tiene usuario)' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      <label className="flex items-center gap-2 text-[12.5px] md:col-span-2">
        <input type="checkbox" name="active" defaultChecked={values['active'] === 'on' || values['active'] === 'true'} />
        Activo (puede entrar al sistema)
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-p" disabled={pending}>
          {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario'}
        </button>
        <Link href="/administracion/usuarios" className="btn">
          Cancelar
        </Link>
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}
