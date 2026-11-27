import { describe, expect, it } from 'vitest';
import { groupByRubro, unchangedFromProposal, type DraftValues, type ProposalValues } from './draft';

const proposal: ProposalValues = {
  rubro: 'Audio',
  producto: 'Parlantes',
  subproducto: null,
  descripcion: 'Line array',
  cant: 2,
  unidad: 'Unidad',
  dias: 1.5,
  observacion: null,
};
const row: DraftValues = {
  rubro: 'Audio',
  producto: 'Parlantes',
  subproducto: null,
  descripcion: 'Line array',
  cant: '2.0000',
  unidad: 'Unidad',
  dias: '1.50',
  observacion: null,
};

describe('comparación con la propuesta de la IA', () => {
  it('marca como propuestos los campos que nadie cambió', () => {
    expect([...unchangedFromProposal(row, proposal)].sort()).toEqual(
      ['cant', 'descripcion', 'dias', 'observacion', 'producto', 'rubro', 'subproducto', 'unidad'].sort(),
    );
  });

  it('deja de marcar los campos editados, incluidos los vaciados o llenados', () => {
    const edited = unchangedFromProposal({ ...row, cant: '3', observacion: 'Revisado', unidad: null }, proposal);
    expect(edited.has('cant')).toBe(false);
    expect(edited.has('observacion')).toBe(false);
    expect(edited.has('unidad')).toBe(false);
    expect(edited.has('producto')).toBe(true);
    expect(unchangedFromProposal({ ...row, dias: null }, proposal).has('dias')).toBe(false);
    expect(unchangedFromProposal({ ...row, cant: null }, { ...proposal, cant: null }).has('cant')).toBe(true);
  });

  it('una fila manual no tiene campos propuestos', () => {
    expect(unchangedFromProposal(row, undefined).size).toBe(0);
  });
});

describe('agrupación por rubro', () => {
  it('agrupa sin distinguir mayúsculas ni espacios, en orden de aparición', () => {
    const groups = groupByRubro([
      { rubro: 'Audio', id: 1 },
      { rubro: 'Escenario', id: 2 },
      { rubro: ' audio ', id: 3 },
    ]);
    expect(groups.map((g) => [g.rubro, g.rows.map((r) => r.id)])).toEqual([
      ['Audio', [1, 3]],
      ['Escenario', [2]],
    ]);
  });
});
