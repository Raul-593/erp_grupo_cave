import { Pill } from '@/components/ui';
import type { MatrixRow } from '@/server/matrix';
import { groupByProduct, PhotosLink, ProductHeading } from './events';
import { MountSelect, OperationalSelect } from './inline';

/**
 * Checklist de un evento pensado para el celular: los requerimientos agrupados por producto,
 * cada uno con su estado operativo y un botón grande para ver y subir sus fotografías. En
 * pantallas anchas añade el estado de montaje.
 */
export function EventChecklist({ items, canUpload }: { items: readonly MatrixRow[]; canUpload: boolean }) {
  const groups = groupByProduct(items);
  return (
    <div>
      {groups.map((group) => (
        <section key={group.key} className="border-b border-line last:border-b-0">
          <header className="bg-bg px-4 py-2.5">
            <ProductHeading group={group} />
          </header>
          <ul>
            {group.items.map((item) => {
              const status = item.operationalStatus ?? 'pending';
              const detail = [item.categoria, item.supplierName].filter(Boolean).join(' · ');
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line px-4 py-3">
                  <div className="min-w-0 flex-1 basis-[250px]">
                    <p className="text-[13px] leading-snug">
                      <b className="mr-1.5 font-semibold tabular-nums text-mut">{item.code}</b>
                      <b className="font-semibold">{item.subproducto ?? item.producto}</b>
                    </p>
                    {detail ? <p className="mt-0.5 text-[11px] text-mut2">{detail}</p> : null}
                    {item.descripcion ? <p className="mt-0.5 text-[11.5px] leading-[1.45] text-ink2">{item.descripcion}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div>
                      <OperationalSelect itemId={item.id} itemLabel={item.code} status={status} version={item.executionVersion} />
                    </div>
                    <div className="hidden lg:block">
                      <MountSelect itemId={item.id} itemLabel={item.code} status={item.mountStatus ?? 'not_started'} version={item.executionVersion} />
                    </div>
                    <PhotosLink item={item} canUpload={canUpload} large />
                    <span className="min-w-[84px]">
                      {item.evidenceCount === 0 ? (
                        <Pill tone="wa">Falta foto</Pill>
                      ) : status === 'ready' ? (
                        <Pill tone="ok">Verificado</Pill>
                      ) : (
                        <Pill tone="bl">Con foto</Pill>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
