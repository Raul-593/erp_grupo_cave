/** Valor de `?evento=` que pide ver todos los eventos a la vez. */
export const ALL_EVENTS = 'todos';

/**
 * Evento que corresponde mostrar en un proyecto con eventos (migración 0011): el pedido si
 * existe, todos (null) si se pide `ALL_EVENTS` y, si no se pide ninguno o no existe, el
 * primero del proyecto. Un proyecto sin eventos devuelve null.
 */
export function pickEvent<T extends { id: string }>(events: readonly T[], requested: string | string[] | undefined): T | null {
  const value = Array.isArray(requested) ? requested[0] : requested;
  if (events.length === 0 || value === ALL_EVENTS) return null;
  return events.find((event) => event.id === value) ?? events[0] ?? null;
}
