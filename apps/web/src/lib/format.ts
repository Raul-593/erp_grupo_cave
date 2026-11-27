/** Formato de presentación en español de Ecuador. Fechas operativas en America/Guayaquil. */

const TIME_ZONE = 'America/Guayaquil';

const dateFormatter = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFormatter = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});

/** Fecha operativa "AAAA-MM-DD" (sin hora): se formatea en UTC para no desplazar el día. */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  if (start && end && start !== end) return `${formatDate(start)} – ${formatDate(end)}`;
  return formatDate(start ?? end);
}

export function formatDateTime(value: Date): string {
  return dateTimeFormatter.format(value);
}

/** Importe exacto (texto decimal) con su moneda, sin pasar por coma flotante. */
export function formatAmount(amount: string | null, currency: string | null): string {
  if (amount === null) return '—';
  const [int = '0', frac = ''] = amount.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cents = frac.replace(/0+$/, '').length > 0 ? `,${frac.padEnd(2, '0')}` : '';
  const symbol = currency === 'USD' || currency === null ? '$' : `${currency} `;
  return `${symbol}${grouped}${cents}`;
}

/** Día y mes de una fecha operativa: «14 nov». */
export function formatDayMonth(value: string | null): string {
  return formatDate(value).replace(/\s+(de\s+)?\d{4}$/, '');
}

/** Cantidad exacta (texto decimal) sin ceros sobrantes y con separadores es-EC: «1200.0000» → «1.200». */
export function formatQuantity(value: string | null): string {
  if (value === null) return '—';
  const [int = '0', frac = ''] = value.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = frac.replace(/0+$/, '');
  return decimals ? `${grouped},${decimals}` : grouped;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('es-EC', { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-EC', { maximumFractionDigits: 1 })} MB`;
}
