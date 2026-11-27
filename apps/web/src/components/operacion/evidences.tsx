'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { formatBytes } from '@/lib/format';
import { checkImageSize, IMAGE_ACCEPT, IMAGE_ERROR_MESSAGES } from '@/lib/image';
import { removeEvidence } from '@/server/actions/evidences';
import { InlineError, useInlineSave } from './inline';

interface FileResult {
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  message?: string;
}

const STATUS_TEXT = { pending: 'En espera', uploading: 'Cargando…', done: 'Cargada', error: 'No se cargó' } as const;
const STATUS_TONE = { pending: 'text-mut', uploading: 'text-bl', done: 'text-ok', error: 'text-ba' } as const;

/**
 * Carga de una o varias fotografías de un ítem. Se envían de una en una para informar el
 * resultado de cada archivo; el servidor valida de nuevo tamaño y contenido.
 */
export function EvidenceUploader({ itemId, maxBytes }: { itemId: string; maxBytes: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function uploadAll(files: File[]) {
    const description = descriptionRef.current?.value ?? '';
    const queue: FileResult[] = files.map((file) => ({ name: file.name, size: file.size, status: 'pending' }));
    const update = (index: number, patch: Partial<FileResult>) => {
      queue[index] = { ...queue[index]!, ...patch };
      setResults([...queue]);
    };
    setResults([...queue]);
    setBusy(true);
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      const invalid = checkImageSize(file.size, maxBytes);
      if (invalid) {
        update(index, { status: 'error', message: IMAGE_ERROR_MESSAGES[invalid](maxBytes) });
        continue;
      }
      update(index, { status: 'uploading' });
      try {
        const body = new FormData();
        body.append('foto', file);
        body.append('descripcion', description);
        const response = await fetch(`/api/items/${itemId}/evidencias`, { method: 'POST', body });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (response.status === 201 && payload.ok) {
          uploaded += 1;
          update(index, { status: 'done' });
        } else {
          update(index, { status: 'error', message: payload.error ?? 'No se pudo cargar la fotografía.' });
        }
      } catch {
        update(index, { status: 'error', message: 'Se perdió la conexión con el servidor durante la carga.' });
      }
    }
    setBusy(false);
    if (uploaded > 0) {
      if (descriptionRef.current) descriptionRef.current.value = '';
      router.refresh();
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="foto-descripcion">
            Descripción (opcional, se aplica a las fotos que elijas ahora)
          </label>
          <input
            ref={descriptionRef}
            id="foto-descripcion"
            className="field"
            maxLength={300}
            autoComplete="off"
            placeholder="Por ejemplo: estructura montada, vista frontal"
            disabled={busy}
          />
        </div>
        <input
          ref={inputRef}
          id="foto-archivos"
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) void uploadAll(files);
          }}
        />
        <button type="button" className="btn btn-p" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Cargando…' : '◎ Elegir fotografías'}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-mut">
        JPEG, PNG o WebP · máximo {formatBytes(maxBytes)} por foto · puedes elegir varias a la vez. En un celular, este botón permite
        tomar la foto con la cámara.
      </p>
      {results.length > 0 ? (
        <ul className="mt-3 rounded-md border border-line" aria-live="polite">
          {results.map((result, index) => (
            <li key={`${result.name}-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line px-3 py-2 text-xs last:border-b-0">
              <span className="font-medium break-all">{result.name}</span>
              <span className="text-mut2">{formatBytes(result.size)}</span>
              <span className={`ml-auto font-semibold ${STATUS_TONE[result.status]}`} role={result.status === 'error' ? 'alert' : undefined}>
                {STATUS_TEXT[result.status]}
                {result.message ? `: ${result.message}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Botón que elimina una fotografía tras confirmar. */
export function DeleteEvidenceButton({ id, filename }: { id: string; filename: string }) {
  const { pending, error, save } = useInlineSave<'delete'>();
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`¿Eliminar la fotografía «${filename}»? Se borrará el archivo y no se puede deshacer.`)) {
            save('delete', () => removeEvidence(id));
          }
        }}
      >
        {pending ? 'Eliminando…' : 'Eliminar'}
      </button>
      <InlineError message={error?.message} />
    </>
  );
}
