/**
 * Validación de fotografías de evidencia por tamaño y contenido real. El tipo se decide por la
 * firma del archivo, nunca por su extensión ni por el tipo que declare el navegador.
 */
export const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type ImageMime = keyof typeof IMAGE_TYPES;

/** Valor del atributo `accept` del selector de archivos. */
export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).join(',');

export type ImageValidationError = 'empty' | 'too_large' | 'not_image';

const megabytes = (bytes: number) => `${Math.floor(bytes / (1024 * 1024))} MB`;

export const IMAGE_ERROR_MESSAGES: Record<ImageValidationError, (maxBytes: number) => string> = {
  empty: () => 'El archivo está vacío.',
  too_large: (max) => `La fotografía supera el máximo permitido de ${megabytes(max)}.`,
  not_image: () => 'Solo se aceptan fotografías JPEG, PNG o WebP (las HEIC del iPhone hay que convertirlas antes).',
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

/** Tipo de imagen según los primeros bytes, o null si no es JPEG, PNG ni WebP. */
export function detectImageType(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

/** Comprobación previa sin leer el contenido (navegador o servidor). */
export function checkImageSize(size: number, maxBytes: number): ImageValidationError | null {
  if (size === 0) return 'empty';
  if (size > maxBytes) return 'too_large';
  return null;
}

/** Validación completa en el servidor: devuelve el tipo detectado o el motivo del rechazo. */
export function validateImage(bytes: Uint8Array, maxBytes: number): { ok: true; mime: ImageMime } | { ok: false; error: ImageValidationError } {
  const size = checkImageSize(bytes.length, maxBytes);
  if (size) return { ok: false, error: size };
  const mime = detectImageType(bytes);
  return mime ? { ok: true, mime } : { ok: false, error: 'not_image' };
}

/**
 * Nombre original apto para guardar y mostrar: sin rutas, caracteres de control ni reservados de
 * Windows, y con la extensión que corresponde al contenido real.
 */
export function sanitizeImageFilename(name: string, mime: ImageMime): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  let clean = base.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  clean = clean.replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 190).trimEnd() || 'fotografia';
  return `${clean}.${IMAGE_TYPES[mime]}`;
}
