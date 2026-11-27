import { getDocumentFile } from '@erp/db';
import { db } from '@/server/db';
import { toUserMessage } from '@/server/errors';
import { contentDisposition, jsonError, UUID } from '@/server/http';
import { fileStorage } from '@/server/storage';

/** Muestra el PDF original de un TDR (solo servidor local; sin enlaces públicos). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, 'Documento no encontrado.');
  try {
    const document = await getDocumentFile(db(), id);
    const storage = fileStorage();
    if (!document || document.storageProvider !== storage.provider) return jsonError(404, 'Documento no encontrado.');
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
