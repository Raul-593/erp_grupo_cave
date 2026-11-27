/**
 * Pruebas de la carga de fotografías con dependencias simuladas y una carpeta temporal.
 * Las «fotos» son unos pocos bytes con la firma de cada formato: no son imágenes reales.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EvidenceInput } from '@erp/db';
import { createLocalStorage } from '@/integrations/storage/local';
import { detectImageType, sanitizeImageFilename } from '@/lib/image';
import { uploadEvidence, type EvidenceUploadDeps } from './evidence-upload';

const PROJECT = '8b2f0c1e-5d4a-4c3b-9a1e-2f6d7c8b9a01';
const ITEM = '11111111-1111-4111-8111-111111111111';

const bytes = (signature: number[], text = 'contenido') => new Uint8Array([...signature, ...new TextEncoder().encode(text)]);
const jpeg = (text?: string) => bytes([0xff, 0xd8, 0xff, 0xe0], text);
const png = (text?: string) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], text);
const webp = (text?: string) => bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], text);

let root: string;
let created: EvidenceInput[];
let deps: EvidenceUploadDeps;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'erp-evidencias-'));
  created = [];
  deps = {
    storage: createLocalStorage(root),
    maxBytes: 1024,
    findByHash: async (itemId, sha) => {
      const found = created.find((row) => row.itemId === itemId && row.sha256 === sha);
      return found ? { id: 'existente', originalFilename: found.originalFilename } : null;
    },
    create: async (input) => {
      created.push(input);
      return `foto-${created.length}`;
    },
    isUniqueViolation: (error) => error instanceof Error && error.message === 'unique',
  };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const stored = async () => (await readdir(root, { recursive: true })).filter((entry) => /\.(jpg|png|webp)$/.test(entry));
const upload = (name: string, data: Uint8Array, itemId = ITEM, description: string | null = null) =>
  uploadEvidence(deps, { projectId: PROJECT, itemId, name, bytes: data, description });

describe('detección del tipo de imagen', () => {
  it('reconoce JPEG, PNG y WebP por su firma y nada más', () => {
    expect(detectImageType(jpeg())).toBe('image/jpeg');
    expect(detectImageType(png())).toBe('image/png');
    expect(detectImageType(webp())).toBe('image/webp');
    expect(detectImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // RIFF de audio
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it('limpia el nombre y le pone la extensión del contenido real', () => {
    expect(sanitizeImageFilename('C:\\fotos\\Escenario: vista?.HEIC', 'image/jpeg')).toBe('Escenario vista.jpg');
    expect(sanitizeImageFilename('../../foto.final.png', 'image/webp')).toBe('foto.final.webp');
    expect(sanitizeImageFilename('  ', 'image/png')).toBe('fotografia.png');
  });
});

describe('carga de fotografías', () => {
  it('guarda con clave opaca por proyecto e ítem y registra el tipo detectado', async () => {
    const data = png();
    // El nombre dice .jpg pero el contenido es PNG: manda el contenido.
    const result = await upload('escenario montado.jpg', data, ITEM, 'Vista frontal');
    expect(result).toEqual({ ok: true, evidenceId: 'foto-1', filename: 'escenario montado.png' });
    const [row] = created;
    expect(row?.storageKey).toMatch(new RegExp(`^evidencias/${PROJECT}/${ITEM}/[0-9a-f-]{36}\\.png$`));
    expect(row).toMatchObject({ mimeType: 'image/png', sizeBytes: data.length, description: 'Vista frontal', storageProvider: 'local' });
    expect(row?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(path.join(root, ...row!.storageKey.split('/')))).toEqual(Buffer.from(data));
  });

  it.each([
    ['vacío', new Uint8Array(), 'empty'],
    ['demasiado grande', jpeg('x'.repeat(2000)), 'too_large'],
    ['un PDF con nombre de foto', new TextEncoder().encode('%PDF-1.7\ncontenido'), 'not_image'],
    ['texto', new TextEncoder().encode('no soy una imagen'), 'not_image'],
  ])('rechaza un archivo %s sin guardar nada', async (_label, data, code) => {
    const result = await upload('foto.jpg', data);
    expect(result).toMatchObject({ ok: false, code });
    expect(created).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it('rechaza la misma foto en el mismo ítem y la admite en otro', async () => {
    await upload('a.jpg', jpeg());
    const repeated = await upload('copia.jpg', jpeg());
    expect(repeated).toMatchObject({ ok: false, code: 'duplicate' });
    if (!repeated.ok) expect(repeated.message).toContain('a.jpg');
    expect(await upload('a.jpg', jpeg(), '22222222-2222-4222-8222-222222222222')).toMatchObject({ ok: true });
    expect(await stored()).toHaveLength(2);
  });

  it('borra el archivo si falla el registro en la base', async () => {
    deps.create = async () => {
      throw new Error('fallo de base');
    };
    await expect(upload('a.webp', webp())).rejects.toThrow('fallo de base');
    expect(await stored()).toEqual([]);
  });

  it('trata la restricción única de la base como duplicado y limpia el archivo', async () => {
    deps.create = async () => {
      throw new Error('unique');
    };
    expect(await upload('a.jpg', jpeg())).toMatchObject({ ok: false, code: 'duplicate' });
    expect(await stored()).toEqual([]);
  });
});
