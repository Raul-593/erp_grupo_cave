'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '@/lib/format';
import { checkImageSize, IMAGE_ACCEPT, IMAGE_ERROR_MESSAGES } from '@/lib/image';
import { removeEvidence } from '@/server/actions/evidences';
import { InlineError, useInlineSave } from './inline';

/** Fotografía elegida que todavía no se ha guardado en el servidor. */
interface Selected {
  key: string;
  file: File;
  /** Vista previa local (URL de objeto); se libera al quitar la foto o salir de la página. */
  preview: string;
  status: 'ready' | 'uploading' | 'error';
  message?: string;
}

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/**
 * Carga de fotografías de un ítem en dos pasos: primero se eligen (quedan en una lista con su
 * vista previa, sin enviarse) y solo se guardan al pulsar «Guardar». El servidor valida de
 * nuevo tamaño y contenido de cada archivo.
 */
export function EvidenceUploader({ itemId, maxBytes }: { itemId: string; maxBytes: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Libera las vistas previas pendientes al salir de la página.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => () => selectedRef.current.forEach((entry) => URL.revokeObjectURL(entry.preview)), []);

  // Avisa antes de cerrar o recargar la pestaña con fotografías sin guardar.
  const pendingCount = selected.length;
  useEffect(() => {
    if (pendingCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);

  function addFiles(files: File[]) {
    setNotice(null);
    setSelected((current) => {
      const known = new Set(current.map((entry) => entry.key));
      const added: Selected[] = [];
      for (const file of files) {
        const key = fileKey(file);
        if (known.has(key)) continue;
        known.add(key);
        const invalid = checkImageSize(file.size, maxBytes);
        added.push({
          key,
          file,
          preview: URL.createObjectURL(file),
          status: invalid ? 'error' : 'ready',
          ...(invalid ? { message: IMAGE_ERROR_MESSAGES[invalid](maxBytes) } : {}),
        });
      }
      return [...current, ...added];
    });
  }

  function discard(keys: readonly string[]) {
    setSelected((current) => {
      current.filter((entry) => keys.includes(entry.key)).forEach((entry) => URL.revokeObjectURL(entry.preview));
      return current.filter((entry) => !keys.includes(entry.key));
    });
  }

  async function saveAll() {
    const queue = selected.filter((entry) => checkImageSize(entry.file.size, maxBytes) === null);
    if (queue.length === 0) return;
    const description = descriptionRef.current?.value ?? '';
    const patch = (key: string, change: Partial<Selected>) =>
      setSelected((current) => current.map((entry) => (entry.key === key ? { ...entry, ...change } : entry)));
    setBusy(true);
    setNotice(null);
    const saved: string[] = [];
    for (const entry of queue) {
      patch(entry.key, { status: 'uploading', message: undefined });
      try {
        const body = new FormData();
        body.append('foto', entry.file);
        body.append('descripcion', description);
        const response = await fetch(`/api/items/${itemId}/evidencias`, { method: 'POST', body });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (response.status === 201 && payload.ok) saved.push(entry.key);
        else patch(entry.key, { status: 'error', message: payload.error ?? 'No se pudo guardar la fotografía.' });
      } catch {
        patch(entry.key, { status: 'error', message: 'Se perdió la conexión con el servidor.' });
      }
    }
    // Las guardadas salen de la lista; las rechazadas se quedan con su motivo.
    discard(saved);
    setBusy(false);
    const failed = queue.length - saved.length;
    if (saved.length > 0) {
      if (failed === 0 && descriptionRef.current) descriptionRef.current.value = '';
      router.refresh();
    }
    setNotice(
      failed === 0
        ? { tone: 'ok', text: saved.length === 1 ? 'Se guardó 1 fotografía.' : `Se guardaron ${saved.length} fotografías.` }
        : {
            tone: 'error',
            text: `${saved.length === 0 ? 'No se guardó ninguna fotografía' : saved.length === 1 ? 'Se guardó 1' : `Se guardaron ${saved.length}`}; ${failed} ${
              failed === 1 ? 'quedó' : 'quedaron'
            } sin guardar (revisa el motivo en cada una).`,
          },
    );
  }

  const ready = selected.filter((entry) => checkImageSize(entry.file.size, maxBytes) === null).length;

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="foto-descripcion">
            Descripción (opcional, se aplica a las fotos que guardes ahora)
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
            if (files.length > 0) addFiles(files);
          }}
        />
        <button type="button" className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
          ◎ {selected.length > 0 ? 'Añadir más' : 'Elegir fotografías'}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-mut">
        JPEG, PNG o WebP · máximo {formatBytes(maxBytes)} por foto · puedes elegir varias. Las fotos elegidas no se guardan hasta que
        pulses «Guardar». En un celular, el botón permite tomar la foto con la cámara.
      </p>

      {selected.length > 0 ? (
        <div className="mt-3 rounded-md border border-wa/40 bg-wab/40 p-3">
          <p className="text-[9px] font-semibold tracking-[0.1em] text-wa uppercase" aria-live="polite">
            {selected.length} {selected.length === 1 ? 'fotografía elegida' : 'fotografías elegidas'} · sin guardar
          </p>
          <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {selected.map((entry) => (
              <li key={entry.key} className="overflow-hidden rounded-md border border-line bg-card">
                {/* Vista previa local de un archivo que aún no se ha enviado. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={entry.preview} alt={`Vista previa de ${entry.file.name}`} className="aspect-[4/3] w-full bg-line object-cover" />
                <div className="px-2.5 py-2">
                  <p className="text-[11.5px] font-medium break-all">{entry.file.name}</p>
                  <p className="text-[11px] text-mut2">{formatBytes(entry.file.size)}</p>
                  {entry.status === 'uploading' ? <p className="text-[11px] font-semibold text-bl">Guardando…</p> : null}
                  {entry.status === 'error' ? (
                    <p role="alert" className="text-[11px] leading-snug text-ba">
                      {entry.message}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="mt-1.5 text-[11px] font-semibold text-bl hover:underline disabled:opacity-50"
                    disabled={busy}
                    aria-label={`Quitar ${entry.file.name} de la selección`}
                    onClick={() => discard([entry.key])}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn btn-p" disabled={busy || ready === 0} onClick={() => void saveAll()}>
              {busy ? 'Guardando…' : `Guardar ${ready === 1 ? '1 fotografía' : `${ready} fotografías`}`}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => discard(selected.map((entry) => entry.key))}>
              Descartar selección
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-2.5 text-xs ${notice.tone === 'error' ? 'text-ba' : 'text-ok'}`}>
          {notice.text}
        </p>
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
