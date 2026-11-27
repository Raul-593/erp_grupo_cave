import { describe, expect, it } from 'vitest';
import { hasPdfSignature } from './pdf';
import { buildTextPdf } from './simple-pdf';

describe('buildTextPdf', () => {
  const pdf = buildTextPdf(['Documento de demostración', 'No es un TDR real (ilustrativo) \\ «prueba»', 'emoji 😀']);
  const text = pdf.toString('latin1');

  it('produce un PDF con la firma y el cierre esperados', () => {
    expect(hasPdfSignature(pdf)).toBe(true);
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('apunta cada entrada de la tabla xref al objeto correcto', () => {
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });

  it('declara la longitud real del contenido y escapa el texto', () => {
    const declared = Number(/\/Length (\d+)/.exec(text)?.[1]);
    const stream = /stream\n([\s\S]*)endstream/.exec(text)?.[1] ?? '';
    expect(stream.length).toBe(declared);
    expect(stream).toContain('(Documento de demostración) Tj');
    expect(stream).toContain('\\(ilustrativo\\) \\\\ «prueba»');
    expect(stream).toContain('(emoji ?) Tj');
  });
});
