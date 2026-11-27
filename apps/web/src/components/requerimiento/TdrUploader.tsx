'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { TDR_INPUT_ID } from '@/lib/constants';
import { formatBytes } from '@/lib/format';
import { checkPdfMetadata, formatMegabytes, PDF_ERROR_MESSAGES } from '@/lib/pdf';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string; size: number; loaded: number }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

/** Zona de carga del PDF del TDR con arrastrar y soltar, progreso y cancelación. */
export function TdrUploader({ projectId, maxBytes, compact }: { projectId: string; maxBytes: number; compact: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const busy = state.kind === 'uploading';

  function upload(file: File) {
    const invalid = checkPdfMetadata(file, maxBytes);
    if (invalid) {
      setState({ kind: 'error', message: PDF_ERROR_MESSAGES[invalid](maxBytes) });
      return;
    }
    const body = new FormData();
    body.append('archivo', file);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    setState({ kind: 'uploading', filename: file.name, size: file.size, loaded: 0 });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setState({ kind: 'uploading', filename: file.name, size: file.size, loaded: Math.min(event.loaded, file.size) });
      }
    };
    xhr.onload = () => {
      xhrRef.current = null;
      let payload: { ok?: boolean; error?: string; filename?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText) as typeof payload;
      } catch {
        // Respuesta no JSON: se trata como error genérico.
      }
      if (xhr.status === 201 && payload.ok) {
        setState({ kind: 'done', message: `«${payload.filename ?? file.name}» se cargó correctamente.` });
        router.refresh();
      } else {
        setState({ kind: 'error', message: payload.error ?? 'No se pudo cargar el archivo. Inténtalo de nuevo.' });
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setState({ kind: 'error', message: 'Se perdió la conexión con el servidor durante la carga.' });
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setState({ kind: 'idle' });
    };
    xhr.open('POST', `/api/proyectos/${projectId}/tdr`);
    xhr.send(body);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      setState({ kind: 'error', message: 'Suelta un solo archivo PDF.' });
      return;
    }
    upload(files[0]!);
  }

  const percent = state.kind === 'uploading' && state.size > 0 ? Math.round((state.loaded / state.size) * 100) : 0;

  return (
    <div className="p-4">
      <input
        ref={inputRef}
        id={TDR_INPUT_ID}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) upload(file);
        }}
      />
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        aria-describedby="tdr-ayuda"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!busy && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed text-center text-[12.5px] transition-colors ${
          compact ? 'px-4 py-4' : 'px-5 py-8'
        } ${dragging ? 'border-bl bg-bl2' : 'border-line2 bg-bg'} ${busy ? 'cursor-progress' : 'cursor-pointer hover:border-bl'}`}
      >
        {state.kind === 'uploading' ? (
          <div className="mx-auto max-w-md" aria-live="polite">
            <p className="font-medium text-ink">Cargando «{state.filename}»…</p>
            <div className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <i className="block h-full rounded-[3px] bg-bl transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-mut">
              {formatBytes(state.loaded)} de {formatBytes(state.size)} · {percent}%
            </p>
            <button
              type="button"
              className="btn mt-2"
              onClick={(event) => {
                event.stopPropagation();
                xhrRef.current?.abort();
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <p className="font-semibold tracking-[0.04em] text-ink2 uppercase">
              {compact ? 'Cargar otro PDF (por ejemplo, una adenda)' : 'Arrastra aquí el PDF del TDR'}
            </p>
            <p id="tdr-ayuda" className="mt-1 text-mut">
              o haz clic para elegirlo · solo PDF · máximo {formatMegabytes(maxBytes)}
            </p>
          </>
        )}
      </div>
      {state.kind === 'error' ? (
        <p role="alert" className="mt-2 text-xs text-ba">
          {state.message}
        </p>
      ) : null}
      {state.kind === 'done' ? (
        <p role="status" className="mt-2 text-xs text-ok">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
