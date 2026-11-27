/** Utilidades puras para convertir valores de formularios. Sin dependencias de servidor. */

/** Recorta y devuelve null para cadenas vacías. */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
}

/** Igual que textOrNull pero conserva los saltos de línea (textos largos). */
export function longTextOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Convierte un importe escrito en formato ecuatoriano o internacional a texto decimal
 * exacto ("286.400,50", "286400.50", "286,400.50" -> "286400.50"). Devuelve:
 *   null       si está vacío,
 *   undefined  si no es un número válido.
 */
export function parseDecimal(value: unknown): string | null | undefined {
  if (typeof value !== 'string') return null;
  let s = value.trim().replace(/\s/g, '').replace(/^\$/, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // El último separador es el decimal; el otro, de miles.
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    // Solo comas: "1,5" es decimal; "1,234,567" son miles.
    s = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.split(',').join('') : s.replace(',', '.');
  } else if (lastDot !== -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Convención es-EC: "286.400" son miles.
    s = s.split('.').join('');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const [int = '0', frac] = s.split('.');
  const normalizedInt = int.replace(/^0+(?=\d)/, '');
  return frac === undefined ? normalizedInt : `${normalizedInt}.${frac}`;
}

/** Sedes separadas por comas, punto y coma o saltos de línea; sin vacíos ni duplicados. */
export function parseList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(/[,;\n]/)) {
    const item = part.trim().replace(/\s+/g, ' ');
    const key = item.toLocaleLowerCase('es');
    if (item !== '' && !seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
