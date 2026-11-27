import type { QuoteLine, QuoteRequest } from '@erp/db';
import { RowList } from '@/components/operacion/shared';
import { Card, Pill } from '@/components/ui';
import { formatAmount, formatDayMonth } from '@/lib/format';
import { QUOTE_STATUS } from '@/lib/labels';
import { compareAmounts, sumAmounts } from '@/lib/money';

const rubroKey = (rubro: string) => rubro.trim().toLocaleLowerCase('es');

interface ComparisonRow {
  itemId: string;
  code: string;
  producto: string;
  /** Línea cotizada por cada proveedor (id del proveedor → línea). */
  bySupplier: Map<string, QuoteLine>;
}

/**
 * Solicitudes de cotización y comparativo por rubro (solo lectura). El comparativo se arma con
 * los valores cotizados por ítem; el total adjudicado suma las líneas elegidas de cada proveedor.
 */
export function QuotesCards({
  requests,
  lines,
  items,
  currency,
}: {
  requests: QuoteRequest[];
  lines: QuoteLine[];
  items: { id: string; code: string; rubro: string }[];
  currency: string | null;
}) {
  const money = (amount: string | null) => formatAmount(amount, currency);
  const codes = new Map(items.map((item) => [item.id, item.code]));
  // Número de cada rubro según la matriz (el «1» de 1.1, 1.2…).
  const rubroNumbers = new Map<string, string>();
  for (const item of items) {
    const key = rubroKey(item.rubro);
    if (!rubroNumbers.has(key)) rubroNumbers.set(key, item.code.split('.')[0] ?? '');
  }
  const rubroLabel = (rubro: string) => {
    const number = rubroNumbers.get(rubroKey(rubro));
    return number ? `Rubro ${number} · ${rubro}` : rubro;
  };

  // Comparativo: un grupo por rubro que tenga valores cotizados.
  const comparisons: { rubro: string; suppliers: { id: string; name: string }[]; rows: ComparisonRow[] }[] = [];
  for (const line of lines) {
    let group = comparisons.find((entry) => rubroKey(entry.rubro) === rubroKey(line.rubro));
    if (!group) {
      group = { rubro: line.rubro, suppliers: [], rows: [] };
      comparisons.push(group);
    }
    if (!group.suppliers.some((supplier) => supplier.id === line.supplierId)) {
      group.suppliers.push({ id: line.supplierId, name: line.supplierName });
    }
    let row = group.rows.find((entry) => entry.itemId === line.itemId);
    if (!row) {
      row = { itemId: line.itemId, code: codes.get(line.itemId) ?? String(line.itemNumber), producto: line.producto, bySupplier: new Map() };
      group.rows.push(row);
    }
    row.bySupplier.set(line.supplierId, line);
  }

  return (
    <div className="grid grid-cols-1 gap-x-[18px] min-[1151px]:grid-cols-2">
      <Card title="Solicitudes de cotización">
        <RowList
          rows={requests.map((request) => {
            const [label, tone] = QUOTE_STATUS[request.status];
            const detail = [
              rubroLabel(request.rubro),
              request.lineCount > 0 ? `${request.lineCount} ${request.lineCount === 1 ? 'ítem cotizado' : 'ítems cotizados'}` : null,
              request.status === 'manual_proforma'
                ? 'proforma cargada a mano'
                : request.sentOn
                  ? `enviada el ${formatDayMonth(request.sentOn)}`
                  : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return {
              key: request.id,
              title: request.supplierKind === 'holding' ? `${request.supplierName} · holding` : request.supplierName,
              detail,
              right: <Pill tone={tone}>{label}</Pill>,
            };
          })}
        />
      </Card>

      {comparisons.map((group) => (
        <Card key={group.rubro} title={`Comparativo · ${rubroLabel(group.rubro)}`}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Ítem</th>
                  {group.suppliers.map((supplier) => (
                    <th key={supplier.id} scope="col" className="num">
                      {supplier.name}
                    </th>
                  ))}
                  <th scope="col">Elegido</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const quoted = [...row.bySupplier.values()];
                  const lowest = quoted.reduce<string | null>(
                    (min, line) => (min === null || compareAmounts(line.amount, min) < 0 ? line.amount : min),
                    null,
                  );
                  const awarded = quoted.find((line) => line.awarded);
                  return (
                    <tr key={row.itemId}>
                      <td>
                        <b className="font-semibold tabular-nums">{row.code}</b> {row.producto}
                      </td>
                      {group.suppliers.map((supplier) => {
                        const line = row.bySupplier.get(supplier.id);
                        if (!line) {
                          return (
                            <td key={supplier.id} className="num text-mut">
                              —
                            </td>
                          );
                        }
                        const isLowest = lowest !== null && compareAmounts(line.amount, lowest) === 0;
                        return (
                          <td key={supplier.id} className="num">
                            {isLowest ? <b className="font-semibold text-ok">{money(line.amount)}</b> : money(line.amount)}
                          </td>
                        );
                      })}
                      <td>{awarded ? <Pill tone="ok">{awarded.supplierName}</Pill> : <span className="text-mut">Sin elegir</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-bg font-semibold">
                  <td className="border-t border-line2">Total adjudicado</td>
                  {group.suppliers.map((supplier) => (
                    <td key={supplier.id} className="num border-t border-line2">
                      {money(
                        sumAmounts(
                          group.rows.map((row) => {
                            const line = row.bySupplier.get(supplier.id);
                            return line?.awarded ? line.amount : null;
                          }),
                        ),
                      )}
                    </td>
                  ))}
                  <td className="border-t border-line2" />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-mut">En verde, el valor más bajo de cada ítem.</p>
        </Card>
      ))}
    </div>
  );
}
