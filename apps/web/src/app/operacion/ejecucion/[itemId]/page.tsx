import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listItemEvidences, MOUNT_STATUSES } from '@erp/db';
import { DeleteEvidenceButton, EvidenceUploader } from '@/components/operacion/evidences';
import { DemoBanner } from '@/components/operacion/shared';
import { Card, EmptyState, FichaGrid, Note, PageHeader, Pill } from '@/components/ui';
import { formatBytes, formatDateTime } from '@/lib/format';
import { MOUNT_STATUS } from '@/lib/labels';
import { getCurrentProject } from '@/server/current-project';
import { db } from '@/server/db';
import { UUID } from '@/server/http';
import { loadMatrixView } from '@/server/matrix';
import { maxEvidenceBytes } from '@/server/storage';

export const metadata: Metadata = { title: 'Fotografías del ítem' };

const MOUNTED_FROM = MOUNT_STATUSES.indexOf('mounted');

export default async function EvidenciasItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!UUID.test(itemId)) notFound();
  const project = await getCurrentProject();
  if (!project) notFound();
  // El ítem debe pertenecer a la matriz confirmada vigente del proyecto seleccionado.
  const view = await loadMatrixView(project.id);
  const item = view?.items.find((row) => row.id === itemId);
  if (!view || !item) notFound();

  const evidences = await listItemEvidences(db(), item.id);
  const status = item.mountStatus ?? 'not_started';
  const mounted = MOUNT_STATUSES.indexOf(status) >= MOUNTED_FROM;

  return (
    <>
      <PageHeader
        title={`Fotografías · ítem ${item.code}`}
        subtitle={`${item.producto} · ${item.rubro}`}
        actions={
          <Link href="/operacion/ejecucion" className="btn">
            ← Volver a Ejecución
          </Link>
        }
      />
      {view.demo ? <DemoBanner source={view.matrix.model} /> : null}

      <Card title="Entregable">
        <FichaGrid
          items={[
            { label: 'Descripción', value: item.descripcion || '—' },
            { label: 'Responsable', value: item.workerName ?? '—' },
            { label: 'Proveedor', value: item.supplierName ?? '—' },
            { label: 'Estado de montaje', value: MOUNT_STATUS[status] },
            {
              label: 'Verificado',
              value:
                evidences.length === 0 ? (
                  <Pill tone="wa">Falta foto</Pill>
                ) : mounted ? (
                  <Pill tone="ok">Sí</Pill>
                ) : (
                  <Pill>Sin montar</Pill>
                ),
            },
          ]}
        />
      </Card>

      <Card title="Subir fotografías">
        <EvidenceUploader itemId={item.id} maxBytes={maxEvidenceBytes()} />
      </Card>

      <Card title={`${evidences.length} ${evidences.length === 1 ? 'fotografía' : 'fotografías'}`}>
        {evidences.length === 0 ? (
          <EmptyState icon="◎" title="Sin fotografías todavía">
            <p>Sube la primera fotografía de este entregable para dejar evidencia de su cumplimiento.</p>
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-4">
            {evidences.map((evidence) => (
              <li key={evidence.id} className="overflow-hidden rounded-md border border-line bg-bg">
                <a href={`/api/evidencias/${evidence.id}`} target="_blank" rel="noopener" title="Abrir a tamaño completo">
                  {/* Archivo privado servido por la propia aplicación: no pasa por el optimizador de imágenes. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/evidencias/${evidence.id}`}
                    alt={evidence.description ?? `Fotografía ${evidence.originalFilename} del ítem ${item.code}`}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full bg-line object-cover"
                  />
                </a>
                <div className="bg-card px-3 py-2.5">
                  <p className="text-[12.5px] font-medium break-words">{evidence.description ?? <span className="text-mut">Sin descripción</span>}</p>
                  <p className="mt-0.5 text-[11px] break-all text-mut2">
                    {evidence.originalFilename} · {formatBytes(evidence.sizeBytes)}
                  </p>
                  <p className="text-[11px] text-mut2">Cargada el {formatDateTime(evidence.uploadedAt)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <DeleteEvidenceButton id={evidence.id} filename={evidence.originalFilename} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Note>
        Las fotografías se guardan en el almacenamiento privado del equipo, no en la base de datos, y solo se ven desde esta aplicación. El
        archivo conserva los datos que le puso la cámara (por ejemplo, la ubicación), así que conviene revisarlo antes de compartirlo fuera.
      </Note>
    </>
  );
}
