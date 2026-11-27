/**
 * Geometría del cronograma: posición de cada actividad dentro de un rango de fechas operativas
 * (`AAAA-MM-DD`, inclusive). Solo cálculo; la pantalla dibuja con estos porcentajes.
 */
const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Fecha no válida: ${date}`);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export interface GanttRange {
  start: string;
  end: string;
  /** Días del rango, contando ambos extremos. */
  days: number;
}

/** Rango que cubre todas las actividades y, si se indican, las fechas del proyecto. */
export function ganttRange(
  activities: readonly { startDate: string; endDate: string }[],
  project: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null },
): GanttRange | null {
  const starts = activities.map((a) => dayNumber(a.startDate));
  const ends = activities.map((a) => dayNumber(a.endDate));
  if (project.startDate) starts.push(dayNumber(project.startDate));
  if (project.endDate) ends.push(dayNumber(project.endDate));
  if (starts.length === 0 || ends.length === 0) return null;
  const start = Math.min(...starts);
  const end = Math.max(...ends, start);
  return { start: isoDate(start), end: isoDate(end), days: end - start + 1 };
}

/** Borde izquierdo y ancho de una actividad, en porcentaje del rango. */
export function ganttBar(range: GanttRange, activity: { startDate: string; endDate: string }): { left: number; width: number } {
  const origin = dayNumber(range.start);
  const offset = dayNumber(activity.startDate) - origin;
  const length = dayNumber(activity.endDate) - dayNumber(activity.startDate) + 1;
  return { left: (offset / range.days) * 100, width: (length / range.days) * 100 };
}

/** Marcas del eje: como máximo `max`, repartidas de forma uniforme desde el primer día. */
export function ganttTicks(range: GanttRange, max = 5): { date: string; left: number }[] {
  const step = Math.max(1, Math.ceil(range.days / max));
  const origin = dayNumber(range.start);
  const ticks: { date: string; left: number }[] = [];
  for (let offset = 0; offset < range.days; offset += step) {
    ticks.push({ date: isoDate(origin + offset), left: (offset / range.days) * 100 });
  }
  return ticks;
}
