/**
 * Shared Timezone Utilities — Global New York Time (ET)
 *
 * All business logic and display uses America/New_York (ET).
 * The IANA timezone database automatically handles:
 *   - EST (UTC-5) during standard time
 *   - EDT (UTC-4) during daylight saving time
 *
 * No manual offset calculation needed — Intl handles DST transitions.
 */

export const APP_TIMEZONE = 'America/New_York' as const;
export const APP_LOCALE = 'en-US' as const;

/**
 * Get the current UTC offset string for America/New_York at a given instant.
 * Returns '-05:00' during EST or '-04:00' during EDT.
 */
export function getNYOffset(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(date);

  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  if (!offsetPart) return '-05:00';

  const match = offsetPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '-05:00';

  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = (match[3] || '00').padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/**
 * Get a date string (YYYY-MM-DD) in New York timezone.
 * Avoids the common bug where UTC midnight ≠ NY midnight.
 */
export function getNYDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
  }).format(date);
}

/**
 * Get start-of-day in NY timezone as a TIMESTAMPTZ-compatible ISO string.
 * e.g. "2026-03-01T00:00:00-05:00"
 */
export function getNYStartOfDay(date: Date = new Date()): string {
  const dateStr = getNYDateString(date);
  const offset = getNYOffset(date);
  return `${dateStr}T00:00:00${offset}`;
}

/**
 * Get start-of-week (Monday 00:00) in NY timezone as an ISO string.
 */
export function getNYStartOfWeek(date: Date = new Date()): string {
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const yearPart = nyParts.find(p => p.type === 'year')?.value || '2026';
  const monthPart = nyParts.find(p => p.type === 'month')?.value || '01';
  const dayPart = nyParts.find(p => p.type === 'day')?.value || '01';
  const weekdayPart = nyParts.find(p => p.type === 'weekday')?.value || 'Mon';

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dayMap[weekdayPart] ?? 1;
  const mondayOffset = dow === 0 ? 6 : dow - 1;

  const d = new Date(`${yearPart}-${monthPart}-${dayPart}T12:00:00`);
  d.setDate(d.getDate() - mondayOffset);
  const mondayStr = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(d);
  const offset = getNYOffset(d);
  return `${mondayStr}T00:00:00${offset}`;
}

/**
 * Get start-of-month in NY timezone as an ISO string.
 */
export function getNYStartOfMonth(date: Date = new Date()): string {
  const nyParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
  }).format(date);
  const [y, m] = nyParts.split('-');
  const firstDayStr = `${y}-${m}-01`;
  const firstDay = new Date(`${firstDayStr}T12:00:00`);
  const offset = getNYOffset(firstDay);
  return `${firstDayStr}T00:00:00${offset}`;
}

/**
 * Format a Date or ISO string for display — date only.
 */
export function formatNYDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options,
  });
}

/**
 * Format a Date or ISO string for display — time only.
 */
export function formatNYTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options,
  });
}

/**
 * Format a Date or ISO string for display — date + time.
 */
export function formatNYDateTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options,
  });
}

/**
 * Build a timezone-aware ISO string for a date + time in New York.
 * Correctly resolves EST vs EDT for the given date.
 *
 * @param dateStr YYYY-MM-DD
 * @param timeStr HH:MM or HH:MM:SS
 */
export function buildNYIsoString(dateStr: string, timeStr: string): string {
  const timePart = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const probeDate = new Date(`${dateStr}T${timePart}Z`);
  const offset = getNYOffset(probeDate);
  return `${dateStr}T${timePart}${offset}`;
}
