/**
 * Carga los datos de demostración en un proyecto del esquema de desarrollo (AGENTS.md §2,
 * «Vista previa con datos de demostración»). No es una migración y nunca toca erp_test.
 *
 *   pnpm db:seed:demo --dry-run          valida los datos y muestra qué haría; no escribe
 *   pnpm db:seed:demo                    carga en el proyecto más antiguo (el «proyecto 1»)
 *   pnpm db:seed:demo --project=<uuid>   carga en otro proyecto
 *
 * Es idempotente: si el proyecto ya tiene la demostración, no hace nada. Los datos se leen de
 * scripts/local/ (carpeta ignorada por Git: contiene nombres y montos del prototipo).
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildDemoRawResponse,
  createPool,
  DEMO_PROVIDER,
  findDemoExtraction,
  loadDbConfig,
  seedDemo,
  summarizeConnection,
  withTransaction,
  type DemoDataset,
} from '@erp/db';
import { SCHEMA_VERSION, summarizeOutput, validateExtractionOutput } from '../src/domain/tdr-extraction/contract.ts';
import { createLocalStorage } from '../src/integrations/storage/local.ts';
import { buildTextPdf } from '../src/lib/simple-pdf.ts';

const SCRIPT_DIR = import.meta.dirname;
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const DEFAULT_DATA = path.join(SCRIPT_DIR, 'local', 'demo-cave-v3.ts');
const DEMO_FILENAME = 'demostracion-prototipo.pdf';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Misma regla que `storageRoot()` del servidor web. */
function storageRoot(): string {
  const root = process.env['ERP_ROOT'] ?? WORKSPACE_ROOT;
  return path.resolve(root, process.env['STORAGE_LOCAL_DIR']?.trim() || 'storage');
}

async function loadDataset(file: string): Promise<DemoDataset> {
  if (!existsSync(file)) {
    throw new Error(
      `No existe el archivo de datos ${path.relative(WORKSPACE_ROOT, file)}. Contiene los datos del prototipo y no se versiona.`,
    );
  }
  const loaded = (await import(pathToFileURL(file).href)) as { default?: DemoDataset };
  if (!loaded.default) throw new Error('El archivo de datos debe exportar el conjunto como `export default`.');
  return loaded.default;
}

function demoPdf(dataset: DemoDataset, projectName: string): Buffer {
  return buildTextPdf([
    'DOCUMENTO DE DEMOSTRACIÓN',
    '',
    'Este archivo NO es un TDR real ni un documento contractual.',
    'Lo generó el sistema erp_v1 para acompañar los datos ilustrativos',
    `de demostración (origen: ${dataset.source}).`,
    '',
    `Proyecto: ${projectName}`,
    `Ítems de demostración: ${dataset.items.length}`,
    '',
    'Los nombres, cantidades y montos asociados son ilustrativos y no',
    'deben usarse como referencia de precios ni como datos de un cliente.',
  ]);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      project: { type: 'string' },
      data: { type: 'string' },
    },
  });
  if (values.project !== undefined && !UUID.test(values.project)) throw new Error('--project debe ser el UUID de un proyecto.');

  const config = loadDbConfig('dev');
  const { host, port, database, user } = summarizeConnection(config.connectionString);
  console.log(`Base "${database}" en ${host}:${port}, usuario "${user}", esquema "${config.schema}".`);

  const dataset = await loadDataset(values.data ? path.resolve(values.data) : DEFAULT_DATA);
  const raw = buildDemoRawResponse(dataset);
  const validation = validateExtractionOutput(raw);
  if (!validation.ok) {
    throw new Error(`Los datos no cumplen el contrato ${SCHEMA_VERSION}:\n  - ${validation.issues.join('\n  - ')}`);
  }
  const summary = summarizeOutput(validation.output);
  console.log(`Datos "${dataset.source}": cumplen el contrato ${SCHEMA_VERSION} (${summary.items} ítems en ${summary.rubros} rubros).`);

  const pool = createPool(config, { max: 2 });
  try {
    const target = await pool.query<{ id: string; name: string }>(
      values.project
        ? `SELECT id, name FROM projects WHERE id = $1`
        : `SELECT id, name FROM projects ORDER BY created_at, id LIMIT 1`,
      values.project ? [values.project] : [],
    );
    const project = target.rows[0];
    if (!project) throw new Error(values.project ? 'El proyecto indicado no existe.' : 'No hay proyectos en la base.');
    console.log(`Proyecto destino: "${project.name}" (${project.id}).`);

    const existing = await findDemoExtraction(pool, project.id);
    if (existing) {
      console.log(`El proyecto ya tiene la demostración (extracción ${existing}, proveedor "${DEMO_PROVIDER}"). No se hizo nada.`);
      return;
    }

    if (values['dry-run']) {
      console.log('Simulación (--dry-run): no se escribió nada. Se cargarían:');
      console.log(
        `  ${dataset.items.length} ítems, ${dataset.workers.length} trabajadores, ${dataset.suppliers.length} proveedores, ` +
          `${dataset.activities.length} actividades, ${dataset.payments.length} pagos, ${dataset.preEventChecks.length} controles previos, ` +
          `${dataset.quoteRequests.length} solicitudes de cotización.`,
      );
      return;
    }

    const storage = createLocalStorage(storageRoot());
    const pdf = demoPdf(dataset, project.name);
    const storageKey = `tdr/${project.id}/${randomUUID()}.pdf`;
    await storage.put(storageKey, pdf);
    let committed = false;
    try {
      const result = await withTransaction(pool, (client) =>
        seedDemo(client, {
          projectId: project.id,
          dataset,
          schemaVersion: SCHEMA_VERSION,
          document: {
            storageProvider: storage.provider,
            storageKey,
            originalFilename: DEMO_FILENAME,
            sizeBytes: pdf.length,
            sha256: createHash('sha256').update(pdf).digest('hex'),
          },
        }),
      );
      if (!result.seeded) {
        console.log('Otro proceso cargó la demostración al mismo tiempo. No se hizo nada.');
        return;
      }
      committed = true;
      console.log(`Demostración cargada. Extracción ${result.extractionId} (confirmada), documento ${result.documentId}.`);
      console.log('Filas creadas por tabla:');
      for (const [table, count] of Object.entries(result.counts)) console.log(`  ${table.padEnd(24)} ${count}`);
      console.log('Valores anteriores del proyecto (para revertir la ficha si hiciera falta):');
      console.log(`  ${JSON.stringify(result.previousProject)}`);
    } finally {
      // Sin registro en la base, el PDF quedaría huérfano.
      if (!committed) await storage.remove(storageKey);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nError al cargar la demostración: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
