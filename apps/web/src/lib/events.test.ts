import { describe, expect, it } from 'vitest';
import { bulkResponsibleSchema, firstIssue, operationalChangeSchema } from '@/server/schemas';
import { ALL_EVENTS, pickEvent } from './events';
import { matrixCodes } from './numbering';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('evento que se muestra', () => {
  const events = [{ id: A }, { id: B }];

  it('usa el pedido, y el primero si no se pide o no existe', () => {
    expect(pickEvent(events, B)).toEqual({ id: B });
    expect(pickEvent(events, [B, A])).toEqual({ id: B });
    expect(pickEvent(events, undefined)).toEqual({ id: A });
    expect(pickEvent(events, 'otro')).toEqual({ id: A });
  });

  it('devuelve null para «todos» y para un proyecto sin eventos', () => {
    expect(pickEvent(events, ALL_EVENTS)).toBeNull();
    expect(pickEvent([], A)).toBeNull();
  });
});

describe('numeración de una matriz con eventos', () => {
  const row = (eventId: string | null, tdrRef: string | null, rubro: string) => ({ eventId, tdrRef, rubro });

  it('numera cada evento por separado con el ítem del TDR', () => {
    expect(
      matrixCodes([
        row(A, '1', 'Código QR'),
        row(A, '1', 'Código QR'),
        row(A, '9', 'Localidad'),
        row(A, null, 'Adicionales'),
        row(A, null, 'Adicionales'),
        row(B, '1', 'Código QR'),
        row(B, '10', 'Localidad'),
        row(B, null, 'Adicionales'),
        row(B, null, 'Otros'),
      ]),
    ).toEqual(['1.1', '1.2', '9.1', 'A.1', 'A.2', '1.1', '10.1', 'A.1', 'B.1']);
  });

  it('sin eventos ni números de TDR conserva la numeración por rubro', () => {
    expect(matrixCodes([row(null, null, 'Audio'), row(null, null, 'Escenario'), row(null, null, 'audio')])).toEqual(['1.1', '2.1', '1.2']);
    expect(matrixCodes([])).toEqual([]);
  });
});

describe('cambios nuevos de la matriz por evento', () => {
  it('valida el estado operativo', () => {
    expect(operationalChangeSchema.parse({ itemId: A, version: '', value: 'ready' })).toEqual({ itemId: A, version: null, value: 'ready' });
    expect(operationalChangeSchema.parse({ itemId: A, version: '3', value: 'in_progress' }).version).toBe(3);
    const bad = operationalChangeSchema.safeParse({ itemId: A, version: '', value: 'mounted' });
    expect(bad.success ? '' : firstIssue(bad.error)).toBe('Estado operativo no válido.');
  });

  it('valida el responsable en bloque', () => {
    expect(bulkResponsibleSchema.parse({ projectId: A, eventId: B, rubro: '', workerId: A, onlyUnassigned: true })).toEqual({
      projectId: A,
      eventId: B,
      rubro: null,
      workerId: A,
      onlyUnassigned: true,
    });
    expect(bulkResponsibleSchema.parse({ projectId: A, eventId: B, rubro: ' Carpas ', workerId: A, onlyUnassigned: false }).rubro).toBe('Carpas');
    expect(bulkResponsibleSchema.safeParse({ projectId: A, eventId: B, rubro: '', workerId: '', onlyUnassigned: true }).success).toBe(false);
    expect(bulkResponsibleSchema.safeParse({ projectId: A, eventId: 'x', rubro: '', workerId: A, onlyUnassigned: true }).success).toBe(false);
  });
});
