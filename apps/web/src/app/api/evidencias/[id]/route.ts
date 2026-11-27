import { getEvidenceFile } from '@erp/db';
import { db } from '@/server/db';
import { toUserMessage } from '@/server/errors';
import { contentDisposition, jsonError, UUID } from '@/server/http';
import { fileStorage } from '@/server/storage';

/** Muestra una fotografía de evidencia (solo servidor local; sin enlaces públicos). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, 'Fotografía no encontrada.');
  try {
    const evidence = await getEvidenceFile(db(), id);
    const storage = fileStorage();
    if (!evidence || evidence.storageProvider !== storage.provider) return jsonError(404, 'Fotografía no encontrada.');
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
