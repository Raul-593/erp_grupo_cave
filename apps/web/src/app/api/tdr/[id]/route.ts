import { getDocumentFile } from '@erp/db';
import { authorize } from '@/server/auth';
import { db } from '@/server/db';
import { toUserMessage } from '@/server/errors';
import { contentDisposition, jsonError, UUID } from '@/server/http';
import { fileStorage, SIGNED_URL_SECONDS } from '@/server/storage';

/** Muestra el PDF original de un TDR a quien puede ver los documentos (sin enlaces públicos). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, 'Documento no encontrado.');
  const auth = await authorize('tdr.read');
  if (!auth.ok) return jsonError(auth.status, auth.message);
  try {
    const document = await getDocumentFile(db(), id);
    const storage = fileStorage();
    if (!document || document.storageProvider !== storage.provider) return jsonError(404, 'Documento no encontrado.');
    // Almacenamiento remoto: enlace temporal, sin que el archivo pase por este servidor.
    if (storage.signedReadUrl) {
      try {
        const url = await storage.signedReadUrl(document.storageKey, SIGNED_URL_SECONDS);
        return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store' } });
      } catch {
        console.error('[erp] No se pudo crear el enlace temporal', { id: document.id });
        return jsonError(404, 'El archivo no está disponible.');
      }
    }
    let bytes: Buffer;
    try {
      bytes = await storage.read(document.storageKey);
    } catch {
      console.error('[erp] Archivo de TDR no encontrado en el almacenamiento', { documentId: document.id });
      return jsonError(404, 'El archivo del documento no está disponible.');
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': contentDisposition('inline', document.originalFilename),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(500, toUserMessage(error));
  }
}
