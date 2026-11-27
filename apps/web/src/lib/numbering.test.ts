import { describe, expect, it } from 'vitest';
import { itemCodes } from './numbering';

describe('numeración rubro.ítem', () => {
  it('numera por orden de aparición del rubro, sin distinguir mayúsculas', () => {
    expect(itemCodes([{ rubro: 'Audio' }, { rubro: 'Escenario' }, { rubro: 'audio ' }, { rubro: 'Personal' }, { rubro: 'Escenario' }])).toEqual([
      '1.1',
      '2.1',
      '1.2',
      '3.1',
      '2.2',
    ]);
    expect(itemCodes([])).toEqual([]);
  });
});
