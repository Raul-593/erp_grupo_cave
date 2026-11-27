/**
 * Pruebas del flujo de carga con dependencias simuladas y una carpeta temporal.
 * Los "PDF" son bytes mínimos con la cabecera %PDF-: no representan ningún TDR.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TdrDocumentInput } from '@erp/db';
import { createLocalStorage } from '@/integrations/storage/local';
import { uploadTdr, type UploadDeps } from './tdr-upload';

const PROJECT = '8b2f0c1e-5d4a-4c3b-9a1e-2f6d7c8b9a01';
const pdfBytes = (text = 'contenido') => new TextEncoder().encode(`%PDF-1.7\n${text}\n%%EOF\n`);

let root: string;
let created: TdrDocumentInput[];
let deps: UploadDeps;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'erp-tdr-'));
  created = [];
  deps = {
    storage: createLocalStorage(root),
    maxBytes: 1024,
    findByHash: async (_project, sha) => {
      const found = created.find((doc) => doc.sha256 === sha);
      return found ? { id: 'existente', originalFilename: found.originalFilename } : null;
    },
    create: async (input) => {
      created.push(input);
      return `doc-${created.length}`;
    },
    isUniqueViolation: (error) => error instanceof Error && error.message === 'unique',
  };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function storedFiles(): Promise<string[]> {
  return (await readdir(root, { recursive: true })).filter((entry) => entry.endsWith('.pdf'));
}

describe('carga de TDR', () => {
  it('guarda el archivo con una clave opaca y registra hash, tamaño y nombre seguro', async () => {
    const bytes = pdfBytes();
    const result = await uploadTdr(deps, { projectId: PROJECT, name: 'C:\\carpeta\\TDR final?.pdf', type: 'application/pdf', bytes });
    expect(result).toEqual({ ok: true, documentId: 'doc-1', filename: 'TDR final.pdf' });
    const [doc] = created;
    expect(doc?.storageKey).toMatch(new RegExp(`^tdr/${PROJECT}/[0-9a-f-]{36}\\.pdf$`));
    expect(doc?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc?.sizeBytes).toBe(bytes.length);
    expect(await readFile(path.join(root, ...doc!.storageKey.split('/')))).toEqual(Buffer.from(bytes));
  });

  it.each([
    ['vacío', 'a.pdf', 'application/pdf', new Uint8Array(), 'empty'],
    ['sin extensión .pdf', 'a.docx', 'application/pdf', pdfBytes(), 'not_pdf_name'],
    ['tipo declarado distinto', 'a.pdf', 'image/png', pdfBytes(), 'not_pdf_type'],
    ['contenido que no es PDF', 'a.pdf', 'application/pdf', new TextEncoder().encode('hola'), 'not_pdf_content'],
    ['demasiado grande', 'a.pdf', 'application/pdf', new Uint8Array(2048).fill(0x25), 'too_large'],
  ])('rechaza un archivo %s sin guardar nada', async (_label, name, type, bytes, code) => {
    const result = await uploadTdr(deps, { projectId: PROJECT, name, type, bytes });
    expect(result).toMatchObject({ ok: false, code });
    expect(created).toHaveLength(0);
    expect(await storedFiles()).toHaveLength(0);
  });

  it('acepta el tipo vacío que envían algunos navegadores', async () => {
    expect(await uploadTdr(deps, { projectId: PROJECT, name: 'a.PDF', type: '', bytes: pdfBytes() })).toMatchObject({ ok: true });
  });

  it('detecta el mismo PDF cargado dos veces en el proyecto', async () => {
    await uploadTdr(deps, { projectId: PROJECT, name: 'primero.pdf', type: 'application/pdf', bytes: pdfBytes() });
    const second = await uploadTdr(deps, { projectId: PROJECT, name: 'copia.pdf', type: 'application/pdf', bytes: pdfBytes() });
    expect(second).toMatchObject({ ok: false, code: 'duplicate' });
    expect(second.ok ? '' : second.message).toContain('primero.pdf');
    expect(await storedFiles()).toHaveLength(1);
  });

  it('borra el archivo si falla el registro en la base', async () => {
    deps.create = async () => {
      throw new Error('fallo de base');
    };
    await expect(uploadTdr(deps, { projectId: PROJECT, name: 'a.pdf', type: 'application/pdf', bytes: pdfBytes() })).rejects.toThrow(
      'fallo de base',
    );
    expect(await storedFiles()).toHaveLength(0);
  });

  it('informa como duplicado una carga simultánea detectada por la base', async () => {
    deps.create = async () => {
      throw new Error('unique');
    };
    const result = await uploadTdr(deps, { projectId: PROJECT, name: 'a.pdf', type: 'application/pdf', bytes: pdfBytes() });
    expect(result).toMatchObject({ ok: false, code: 'duplicate' });
    expect(await storedFiles()).toHaveLength(0);
  });
});

describe('almacenamiento local', () => {
  it.each(['../fuera.pdf', 'tdr/../../x.pdf', '/abs.pdf', 'C:/x.pdf', 'tdr\\x.pdf', 'tdr//x.pdf', ''])(
    'rechaza la clave insegura %j',
    async (key) => {
      await expect(deps.storage.put(key, pdfBytes())).rejects.toThrow('Clave de almacenamiento');
    },
  );

  it('no sobrescribe un archivo existente y elimina sin error si no existe', async () => {
    await deps.storage.put('tdr/x/a.pdf', pdfBytes('uno'));
    await expect(deps.storage.put('tdr/x/a.pdf', pdfBytes('dos'))).rejects.toThrow();
    await deps.storage.remove('tdr/x/a.pdf');
    await deps.storage.remove('tdr/x/a.pdf');
    expect(await storedFiles()).toHaveLength(0);
  });
});
