import { describe, expect, it } from 'vitest';
import { proposeAllocation } from './allocation';

const lines = [
  { itemId: 'a', balance: '8400.00' },
  { itemId: 'b', balance: '6200.00' },
  { itemId: 'c', balance: '2160.00' },
];

describe('proposeAllocation', () => {
  it('llena el saldo de cada ítem en el orden recibido hasta agotar el monto', () => {
    expect(proposeAllocation('8400', lines)).toEqual([{ itemId: 'a', amount: '8400.00' }]);
    expect(proposeAllocation('10000.50', lines)).toEqual([
      { itemId: 'a', amount: '8400.00' },
      { itemId: 'b', amount: '1600.50' },
    ]);
    expect(proposeAllocation('16760', lines)).toEqual([
      { itemId: 'a', amount: '8400.00' },
      { itemId: 'b', amount: '6200.00' },
      { itemId: 'c', amount: '2160.00' },
    ]);
  });

  it('deja sin repartir lo que no cabe en ningún ítem', () => {
    const proposal = proposeAllocation('20000', lines);
    expect(proposal.map((p) => p.amount)).toEqual(['8400.00', '6200.00', '2160.00']);
    expect(proposeAllocation('380', [{ itemId: 'x', balance: '0.00' }])).toEqual([]);
    expect(proposeAllocation('380', [])).toEqual([]);
  });

  it('salta los ítems sin saldo y no reparte montos nulos', () => {
    expect(
      proposeAllocation('100', [
        { itemId: 'a', balance: '0' },
        { itemId: 'b', balance: '-5.00' },
        { itemId: 'c', balance: '60.25' },
        { itemId: 'd', balance: '100' },
      ]),
    ).toEqual([
      { itemId: 'c', amount: '60.25' },
      { itemId: 'd', amount: '39.75' },
    ]);
    expect(proposeAllocation('0', lines)).toEqual([]);
  });

  it('es exacta al centavo', () => {
    const proposal = proposeAllocation('0.30', [
      { itemId: 'a', balance: '0.10' },
      { itemId: 'b', balance: '0.20' },
      { itemId: 'c', balance: '0.10' },
    ]);
    expect(proposal).toEqual([
      { itemId: 'a', amount: '0.10' },
      { itemId: 'b', amount: '0.20' },
    ]);
  });
});
