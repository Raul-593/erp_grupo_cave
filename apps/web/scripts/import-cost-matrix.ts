/**
 * Carga una matriz de costos (JSON preparado a partir de un Excel) como proyecto nuevo con sus
 * eventos, matriz confirmada, proveedores y costos por ítem. No es una migración y nunca toca
 * erp_test.
 *
 *   pnpm db:import:matrix --data=<archivo.json> --dry-run   valida y muestra qué haría; no escribe
 *   pnpm db:import:matrix --data=<archivo.json>             carga el proyecto
 *   … --target=supabase                                     en Supabase (SUPABASE_DATABASE_URL y Storage)
 *
 * Es idempotente: si el contratante ya tiene un proyecto con ese nombre, no hace nada. El JSON
 * vive en scripts/local/ (carpeta ignorada por Git: contiene nombres de proveedores y montos).
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  createPool,
  findProjectByName,
  importCostMatrix,
  loadDbConfig,
  summarizeConnection,
  validateCostMatrix,
  withTransaction,
  type CostMatrixDataset,
} from '@erp/db';
import { SCHEMA_VERSION } from '../src/domain/tdr-extraction/contract.ts';
import { createLocalStorage } from '../src/integrations/storage/local.ts';
import { createSupabaseStorage, supabaseAdminClient } from '../src/integrations/storage/supabase.ts';
import { buildTextPdf } from '../src/lib/simple-pdf.ts';

const SCRIPT_DIR = import.meta.dirname;
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const DEFAULT_DATA = path.join(SCRIPT_DIR, 'local', 'graduaciones-unemi.json');

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

/** Misma regla que `storageRoot()` del servidor web. */
function storageRoot(): string {
  const root = process.env['ERP_ROOT'] ?? WORKSPACE_ROOT;
  return path.resolve(root, process.env['STORAGE_LOCAL_DIR']?.trim() || 'storage');
}

function loadDataset(file: string): CostMatrixDataset {
  if (!existsSync(file)) {
    throw new Error(`No existe el archivo de datos ${path.relative(WORKSPACE_ROOT, file)}. Contiene montos y no se versiona.`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as CostMatrixDataset;
}

function originPdf(dataset: CostMatrixDataset, itemCount: number): Buffer {
  return buildTextPdf([
    'MATRIZ CARGADA DESDE UN ARCHIVO DE EXCEL',
    '',
    'Este archivo NO es el TDR ni un documento contractual.',
    'Lo generó el sistema erp_v1 para dejar constancia del origen de la',
    'matriz de entregables de este proyecto.',
    '',
    `Proyecto: ${dataset.project.name}`,
    `Archivo de origen: ${dataset.source}`,
    `Eventos: ${dataset.events.map((event) => event.name).join(', ')}`,
    `Ítems cargados: ${itemCount}`,
  ]);
}

const sum = (values: (string | null)[]): string => {
  // Suma exacta en centavos (los importes llegan con dos decimales).
  let cents = 0n;
  for (const value of values) {
    if (!value) continue;
    const [whole = '0', fraction = ''] = value.split('.');
    cents += BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  }
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { 'dry-run': { type: 'boolean', default: false }, data: { type: 'string' }, target: { type: 'string', default: 'dev' } },
  });
  if (values.target !== 'dev' && values.target !== 'supabase') throw new Error('--target debe ser dev o supabase.');
  const config = loadDbConfig(values.target);
  const { host, port, database, user } = summarizeConnection(config.connectionString);
  console.log(`Base "${database}" en ${host}:${port}, usuario "${user}", esquema "${config.schema}".`);

  const dataset = loadDataset(values.data ? path.resolve(values.data) : DEFAULT_DATA);
  const issues = validateCostMatrix(dataset);
  if (issues.length > 0) throw new Error(`Los datos no son válidos:\n  - ${issues.join('\n  - ')}`);
  const itemCount = dataset.events.reduce((total, event) => total + event.items.length, 0);
  console.log(`Datos "${dataset.source}": proyecto "${dataset.project.name}" (${dataset.project.client}), ${itemCount} ítems.`);
  for (const event of dataset.events) {
    console.log(
      `  ${event.name.padEnd(12)} ${String(event.items.length).padStart(4)} ítems · subtotal ${sum(event.items.map((item) => item.subtotal))}` +
        ` · anticipos ${sum(event.items.flatMap((item) => [item.advance1, item.advance2]))}`,
    );
  }

  const pool = createPool(config, { max: 2 });
  console.log(`Destino: ${values.target === 'supabase' ? 'SUPABASE (producción)' : 'base local'}.`);
  try {
    const existing = await findProjectByName(pool, dataset.project.client, dataset.project.name);
    if (existing) {
      console.log(`El proyecto ya existe (${existing}). No se hizo nada.`);
      return;
    }
    if (values['dry-run']) {
      console.log('Simulación (--dry-run): no se escribió nada.');
      return;
    }

    const storage =
      values.target === 'supabase'
        ? createSupabaseStorage(supabaseAdminClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY')))
        : createLocalStorage(storageRoot());
    const pdf = originPdf(dataset, itemCount);
    let storageKey: string | null = null;
    let committed = false;
    try {
      const result = await withTransaction(pool, (client) =>
        importCostMatrix(client, {
          dataset,
          schemaVersion: SCHEMA_VERSION,
          document: async (projectId) => {
            storageKey = `tdr/${projectId}/${randomUUID()}.pdf`;
            await storage.put(storageKey, pdf);
            return {
              storageProvider: storage.provider,
              storageKey,
              originalFilename: 'matriz-desde-excel.pdf',
              sizeBytes: pdf.length,
              sha256: createHash('sha256').update(pdf).digest('hex'),
            };
          },
        }),
      );
      if (!result.imported) {
        console.log('Otro proceso cargó el proyecto al mismo tiempo. No se hizo nada.');
        return;
      }
      committed = true;
      console.log(`Proyecto cargado: ${result.projectId}. Matriz ${result.extractionId} (confirmada).`);
      console.log('Filas creadas por tabla:');
      for (const [table, count] of Object.entries(result.counts)) console.log(`  ${table.padEnd(18)} ${count}`);
      if (result.createdClient) console.log(`Contratante creado: ${dataset.project.client}`);
      console.log(`Proveedores creados (${result.createdSuppliers.length}): ${result.createdSuppliers.join(', ') || '—'}`);
    } finally {
      // Sin registro en la base, el PDF quedaría huérfano.
      if (!committed && storageKey) await storage.remove(storageKey);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nError al cargar la matriz: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
