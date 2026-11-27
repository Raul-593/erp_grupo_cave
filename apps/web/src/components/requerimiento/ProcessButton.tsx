'use client';

import { useState, useTransition } from 'react';
import { processTdr } from '@/server/actions/extractions';

/**
 * «Procesar TDR con IA». Genera una clave de operación por clic: si el envío se repite
 * (doble clic, reintento de red), el servidor devuelve el mismo intento.
 */
export function ProcessButton({
  documentId,
  disabled,
  disabledReason,
  label = '◆ Procesar TDR con IA',
  confirmMessage,
}: {
  documentId: string | null;
  disabled: boolean;
  disabledReason?: string;
  label?: string;
  /** Aviso antes de procesar, por ejemplo si hay un borrador editado que no pasará al nuevo intento (D-9). */
  confirmMessage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {message && !message.ok ? (
        <span role="alert" className="max-w-[46ch] text-xs text-ba">
          {message.text}
        </span>
      ) : null}
      <button
        type="button"
        className="btn btn-g"
        disabled={disabled || pending || !documentId}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          if (!documentId) return;
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          const idempotencyKey = crypto.randomUUID();
          setMessage(null);
          startTransition(async () => {
            const result = await processTdr(documentId, idempotencyKey);
            setMessage({ ok: result.ok, text: result.message });
          });
        }}
      >
        {pending ? 'Enviando…' : label}
      </button>
    </span>
  );
}
