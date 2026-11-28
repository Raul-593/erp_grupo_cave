import { getEvidenceFile } from '@erp/db';
import { authorize } from '@/server/auth';
import { db } from '@/server/db';
import { toUserMessage } from '@/server/errors';
import { contentDisposition, jsonError, UUID } from '@/server/http';
import { fileStorage, SIGNED_URL_SECONDS } from '@/server/storage';

/** Muestra una fotografía de evidencia a quien puede ver su ítem (sin enlaces públicos). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, 'Fotografía no encontrada.');
  try {
    const evidence = await getEvidenceFile(db(), id);
    // Sin permiso sobre el ítem se responde igual que si no existiera.
    const auth = await authorize('evidence.read', evidence ? { itemId: evidence.itemId } : {});
    if (!auth.ok) return jsonError(auth.status === 401 ? 401 : 404, auth.status === 401 ? auth.message : 'Fotografía no encontrada.');
    const storage = fileStorage();
    if (!evidence || evidence.storageProvider !== storage.provider) return jsonError(404, 'Fotografía no encontrada.');
    // Almacenamiento remoto: enlace temporal, sin que el archivo pase por este servidor.
    if (storage.signedReadUrl) {
      try {
        const url = await storage.signedReadUrl(evidence.storageKey, SIGNED_URL_SECONDS);
        return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store' } });
      } catch {
        console.error('[erp] No se pudo crear el enlace temporal', { id: evidence.id });
        return jsonError(404, 'El archivo no está disponible.');
      }
    }
    let bytes: Buffer;
    try {
      bytes = await storage.read(evidence.storageKey);
    } catch {
      console.error('[erp] Fotografía no encontrada en el almacenamiento', { evidenceId: evidence.id });
      return jsonError(404, 'El archivo de la fotografía no está disponible.');
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        // Tipo detectado por contenido al cargar; nunca el que declaró el navegador.
        'Content-Type': evidence.mimeType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': contentDisposition('inline', evidence.originalFilename),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return jsonError(500, toUserMessage(error));
  }
}
