import { revalidatePath } from 'next/cache';
import { createDocument, findDocumentByHash, getPgErrorCode, getProject, PgErrorCode } from '@erp/db';
import { db } from '@/server/db';
import { toUserMessage } from '@/server/errors';
import { isSameOrigin, jsonError, UUID } from '@/server/http';
import { uploadTdr } from '@/server/services/tdr-upload';
import { fileStorage, maxTdrBytes } from '@/server/storage';
import { formatMegabytes } from '@/lib/pdf';

/** Margen para las cabeceras multipart sobre el tamaño del archivo. */
const MULTIPART_OVERHEAD = 64 * 1024;

/** Carga el PDF del TDR de un proyecto (multipart/form-data, campo "archivo"). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, 'Origen no permitido.');
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, 'Proyecto no encontrado.');

  const maxBytes = maxTdrBytes();
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes + MULTIPART_OVERHEAD) {
    return jsonError(413, `El archivo supera el máximo permitido de ${formatMegabytes(maxBytes)}.`);
  }
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return jsonError(400, 'Envía el archivo como formulario.');
  }

  try {
    const project = await getProject(db(), id);
    if (!project) return jsonError(404, 'Proyecto no encontrado.');

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get('archivo');
    } catch {
      return jsonError(400, 'No se pudo leer el archivo enviado.');
    }
    if (!(file instanceof File)) return jsonError(400, 'Selecciona un archivo PDF.');
    if (file.size > maxBytes) return jsonError(413, `El archivo supera el máximo permitido de ${formatMegabytes(maxBytes)}.`);

    const result = await uploadTdr(
      {
        storage: fileStorage(),
        maxBytes,
        findByHash: (projectId, sha256) => findDocumentByHash(db(), projectId, sha256),
        create: (input) => createDocument(db(), input),
        isUniqueViolation: (error) => getPgErrorCode(error) === PgErrorCode.uniqueViolation,
      },
      { projectId: project.id, name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
    );
    if (!result.ok) return jsonError(result.code === 'too_large' ? 413 : result.code === 'duplicate' ? 409 : 400, result.message);

    revalidatePath('/operacion', 'layout');
    return Response.json(
      { ok: true, documentId: result.documentId, filename: result.filename },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return jsonError(500, toUserMessage(error));
  }
}
