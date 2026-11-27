'use client';

import { useState, useTransition } from 'react';
import { deleteTdrDocument } from '@/server/actions/documents';

/** Elimina un TDR cargado por error (solo si aún no se procesó). Pide confirmación. */
export function DeleteDocumentButton({ id, filename }: { id: string; filename: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`¿Eliminar «${filename}»? Se borrará el archivo y no se puede deshacer.`)) return;
          setError(null);
          startTransition(async () => {
            const formData = new FormData();
            formData.set('id', id);
            const result = await deleteTdrDocument(formData);
            if (!result.ok) setError(result.message);
          });
        }}
      >
        {pending ? 'Eliminando…' : 'Eliminar'}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-ba">
          {error}
        </span>
      ) : null}
    </>
  );
}
