import { revalidatePath } from 'next/cache';
import { createEvidence, findEvidenceByHash, getItemProjectId, getPgErrorCode, PgErrorCode, withTransaction } from '@erp/db';
import { IMAGE_ERROR_MESSAGES } from '@/lib/image';
import { textOrNull } from '@/lib/parse';
import { audit, authorize } from '@/server/auth';
import { db } from '@/server/db';
import { toUserMessage } from '@/server/errors';
import { isSameOrigin, jsonError, UUID } from '@/server/http';
import { uploadEvidence } from '@/server/services/evidence-upload';
import { fileStorage, maxEvidenceBytes } from '@/server/storage';

/** Margen para las cabeceras multipart y la descripción sobre el tamaño del archivo. */
const MULTIPART_OVERHEAD = 64 * 1024;
const MAX_DESCRIPTION = 300;

/** Carga una fotografía de evidencia de un ítem (multipart/form-data, campos "foto" y "descripcion"). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, 'Origen no permitido.');
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, 'Ítem no encontrado.');
  // Superusuario, o el empleado de campo responsable del ítem.
  const auth = await authorize('evidence.upload', { itemId: id });
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const maxBytes = maxEvidenceBytes();
  const tooLarge = () => jsonError(413, IMAGE_ERROR_MESSAGES.too_large(maxBytes));
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes + MULTIPART_OVERHEAD) return tooLarge();
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return jsonError(400, 'Envía la fotografía como formulario.');
  }

  try {
    const projectId = await getItemProjectId(db(), id);
    if (!projectId) return jsonError(404, 'Ítem no encontrado.');

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(400, 'No se pudo leer el archivo enviado.');
    }
    const file = form.get('foto');
    if (!(file instanceof File)) return jsonError(400, 'Selecciona una fotografía.');
    if (file.size > maxBytes) return tooLarge();
    const description = textOrNull(form.get('descripcion'));
    if (description !== null && description.length > MAX_DESCRIPTION) {
      return jsonError(400, `Descripción: máximo ${MAX_DESCRIPTION} caracteres.`);
    }

    const result = await uploadEvidence(
      {
        storage: fileStorage(),
        maxBytes,
        findByHash: (itemId, sha256) => findEvidenceByHash(db(), itemId, sha256),
        create: (input) =>
          withTransaction(db(), async (tx) => {
            const evidenceId = await createEvidence(tx, input);
            await audit(tx, auth.user, 'evidence.upload', 'item_evidences', evidenceId, { itemId: id, filename: input.originalFilename });
            return evidenceId;
          }),
        isUniqueViolation: (error) => getPgErrorCode(error) === PgErrorCode.uniqueViolation,
      },
      {
        projectId,
        itemId: id,
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        description,
        uploadedBy: auth.user.id,
      },
    );
    if (!result.ok) return jsonError(result.code === 'too_large' ? 413 : result.code === 'duplicate' ? 409 : 400, result.message);

    revalidatePath('/operacion', 'layout');
    return Response.json(
      { ok: true, evidenceId: result.evidenceId, filename: result.filename },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // La base solo admite fotografías sobre ítems de una matriz confirmada.
    if (getPgErrorCode(error) === PgErrorCode.checkViolation) {
      return jsonError(409, 'Solo se pueden cargar fotografías en ítems de una matriz confirmada.');
    }
    return jsonError(500, toUserMessage(error));
  }
}
