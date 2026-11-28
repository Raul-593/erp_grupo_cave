/**
 * Registro de fotografías subidas directamente al almacenamiento (subida firmada, parte S) y
 * reparto de claves entre los buckets de Supabase. Almacenamiento simulado en memoria.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { EvidenceInput } from '@erp/db';
import { splitKey } from '@/integrations/storage/supabase';
import type { FileStorage } from '@/integrations/storage/types';
import { isEvidenceKeyFor, newEvidenceKey, registerStoredEvidence, type EvidenceUploadDeps } from './evidence-upload';

const PROJECT = '8b2f0c1e-5d4a-4c3b-9a1e-2f6d7c8b9a01';
const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const jpeg = (text = 'foto') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);

let files: Map<string, Uint8Array>;
let created: EvidenceInput[];
let deps: EvidenceUploadDeps;

beforeEach(() => {
  files = new Map();
  created = [];
  const storage: FileStorage = {
    provider: 'supabase',
    put: async (key, data) => void files.set(key, data),
    read: async (key) => {
      const data = files.get(key);
      if (!data) throw new Error('no existe');
      return Buffer.from(data);
    },
    remove: async (key) => void files.delete(key),
  };
  deps = {
    storage,
    maxBytes: 1024,
    findByHash: async (itemId, sha) => {
      const found = created.find((row) => row.itemId === itemId && row.sha256 === sha);
      return found ? { id: 'existente', originalFilename: found.originalFilename } : null;
    },
    create: async (input) => {
      created.push(input);
      return `foto-${created.length}`;
    },
    isUniqueViolation: () => false,
  };
});

const register = (key: string, extra: Partial<Parameters<typeof registerStoredEvidence>[1]> = {}) =>
  registerStoredEvidence(deps, { projectId: PROJECT, itemId: ITEM, key, name: 'IMG_0001.HEIC.jpg', description: null, uploadedBy: null, ...extra });

describe('claves de fotografías', () => {
  it('solo acepta claves nuevas del mismo proyecto e ítem', () => {
    const key = newEvidenceKey(PROJECT, ITEM, 'jpg');
    expect(isEvidenceKeyFor(key, PROJECT, ITEM)).toBe(true);
    expect(isEvidenceKeyFor(key, PROJECT, OTHER)).toBe(false);
    expect(isEvidenceKeyFor(`${key}x`, PROJECT, ITEM)).toBe(false);
    expect(isEvidenceKeyFor(`evidencias/${PROJECT}/${ITEM}/../otro.jpg`, PROJECT, ITEM)).toBe(false);
    expect(isEvidenceKeyFor(`tdr/${PROJECT}/${ITEM}/${key.split('/').pop()}`, PROJECT, ITEM)).toBe(false);
  });

  it('reparte las claves entre los buckets privados', () => {
    expect(splitKey(`evidencias/${PROJECT}/${ITEM}/a.jpg`)).toEqual({ bucket: 'evidencias', path: `${PROJECT}/${ITEM}/a.jpg` });
    expect(splitKey(`tdr/${PROJECT}/a.pdf`)).toEqual({ bucket: 'tdr', path: `${PROJECT}/a.pdf` });
    expect(() => splitKey('otro/a.jpg')).toThrow();
    expect(() => splitKey('evidencias')).toThrow();
    expect(() => splitKey('evidencias/../a.jpg')).toThrow();
  });
});

describe('registro de una fotografía ya subida', () => {
  it('la valida por su contenido y la registra con la clave recibida', async () => {
    const key = newEvidenceKey(PROJECT, ITEM, 'jpg');
    files.set(key, jpeg());
    const result = await register(key, { description: 'Montaje', uploadedBy: OTHER });
    expect(result).toMatchObject({ ok: true, evidenceId: 'foto-1' });
    expect(created[0]).toMatchObject({ itemId: ITEM, storageProvider: 'supabase', storageKey: key, mimeType: 'image/jpeg', description: 'Montaje', uploadedBy: OTHER });
    expect(files.has(key)).toBe(true);
  });

  it('rechaza la clave de otro ítem sin leerla ni borrarla', async () => {
    const key = newEvidenceKey(PROJECT, OTHER, 'jpg');
    files.set(key, jpeg());
    expect(await register(key)).toMatchObject({ ok: false, code: 'invalid_key' });
    expect(files.has(key)).toBe(true);
    expect(created).toEqual([]);
  });

  it('borra el archivo si no es una imagen, si es muy grande o si está repetido', async () => {
    const fake = newEvidenceKey(PROJECT, ITEM, 'jpg');
    files.set(fake, new TextEncoder().encode('no soy una foto'));
    expect(await register(fake)).toMatchObject({ ok: false, code: 'not_image' });
    expect(files.has(fake)).toBe(false);

    const big = newEvidenceKey(PROJECT, ITEM, 'jpg');
    files.set(big, jpeg('x'.repeat(2000)));
    expect(await register(big)).toMatchObject({ ok: false, code: 'too_large' });
    expect(files.has(big)).toBe(false);

    const first = newEvidenceKey(PROJECT, ITEM, 'jpg');
    const second = newEvidenceKey(PROJECT, ITEM, 'jpg');
    files.set(first, jpeg('igual'));
    files.set(second, jpeg('igual'));
    expect(await register(first)).toMatchObject({ ok: true });
    expect(await register(second)).toMatchObject({ ok: false, code: 'duplicate' });
    expect(files.has(first)).toBe(true);
    expect(files.has(second)).toBe(false);
  });

  it('avisa si el archivo no llegó y lo borra si el registro falla', async () => {
    expect(await register(newEvidenceKey(PROJECT, ITEM, 'jpg'))).toMatchObject({ ok: false, code: 'missing' });
    const key = newEvidenceKey(PROJECT, ITEM, 'jpg');
    files.set(key, jpeg());
    deps.create = async () => {
      throw new Error('base caída');
    };
    await expect(register(key)).rejects.toThrow('base caída');
    expect(files.has(key)).toBe(false);
  });
});
