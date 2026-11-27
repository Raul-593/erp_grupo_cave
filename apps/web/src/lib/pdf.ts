/** Validación de archivos PDF por nombre, tipo declarado, tamaño y contenido real. */

export const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024;

/** Tipos que los navegadores envían para un PDF (algunos en Windows envían vacío). */
const ACCEPTED_MIME = new Set(['application/pdf', 'application/x-pdf', '']);
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
/** La especificación permite bytes previos a la cabecera dentro del primer kilobyte. */
const SIGNATURE_WINDOW = 1024;

export type PdfValidationError = 'empty' | 'too_large' | 'not_pdf_name' | 'not_pdf_type' | 'not_pdf_content';

export function formatMegabytes(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}

export const PDF_ERROR_MESSAGES: Record<PdfValidationError, (maxBytes: number) => string> = {
  empty: () => 'El archivo está vacío.',
  too_large: (max) => `El archivo supera el máximo permitido de ${formatMegabytes(max)}.`,
  not_pdf_name: () => 'El archivo debe tener la extensión .pdf.',
  not_pdf_type: () => 'El archivo no es un PDF.',
  not_pdf_content: () => 'El contenido del archivo no corresponde a un PDF.',
};

/** Validación previa (navegador o servidor) sin leer el contenido. */
export function checkPdfMetadata(file: { name: string; size: number; type: string }, maxBytes: number): PdfValidationError | null {
  if (file.size === 0) return 'empty';
  if (file.size > maxBytes) return 'too_large';
  if (!/\.pdf$/i.test(file.name.trim())) return 'not_pdf_name';
  if (!ACCEPTED_MIME.has(file.type.toLowerCase())) return 'not_pdf_type';
  return null;
}

export function hasPdfSignature(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - PDF_SIGNATURE.length, SIGNATURE_WINDOW);
  for (let start = 0; start <= limit; start++) {
    if (PDF_SIGNATURE.every((byte, offset) => bytes[start + offset] === byte)) return true;
  }
  return false;
}

/** Validación completa en el servidor. */
export function validatePdf(
  file: { name: string; type: string; bytes: Uint8Array },
  maxBytes: number,
): PdfValidationError | null {
  const metadata = checkPdfMetadata({ name: file.name, size: file.bytes.length, type: file.type }, maxBytes);
  if (metadata) return metadata;
  return hasPdfSignature(file.bytes) ? null : 'not_pdf_content';
}

/**
 * Nombre original apto para guardar y mostrar: sin rutas, caracteres de control ni
 * caracteres reservados de Windows; conserva la extensión .pdf.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  let clean = base.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  if (!/\.pdf$/i.test(clean)) clean = `${clean}.pdf`;
  if (clean.length > 200) clean = `${clean.slice(0, 196).trimEnd()}.pdf`;
  return clean === '.pdf' ? 'documento.pdf' : clean;
}
