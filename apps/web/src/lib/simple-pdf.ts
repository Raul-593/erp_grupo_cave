/**
 * PDF mínimo de una página con líneas de texto, sin dependencias. Sirve para el documento de
 * demostración (AGENTS.md §2): un PDF real y legible que declara no ser un TDR.
 *
 * Texto en Helvetica con WinAnsiEncoding: admite los caracteres de Latin-1 (tildes, ñ, «»);
 * cualquier otro se sustituye por «?».
 */
const escapeText = (text: string): string =>
  Array.from(text, (char) => {
    const code = char.codePointAt(0) ?? 63;
    if (char === '\\' || char === '(' || char === ')') return `\\${char}`;
    return code >= 32 && code <= 255 ? char : '?';
  }).join('');

export function buildTextPdf(lines: readonly string[]): Buffer {
  const text = lines.map((line) => `(${escapeText(line)}) Tj T*`).join('\n');
  const content = `BT\n/F1 12 Tf\n56 780 Td\n18 TL\n${text}\nET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
  ];

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const part = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, 'latin1');
    parts.push(part);
    length += part.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}
