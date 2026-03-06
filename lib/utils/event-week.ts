/**
 * Event Week Utilities
 * 活动周配置工具函数
 *
 * All date/time math uses America/New_York via Intl and
 * correctly handles EST ↔ EDT transitions.
 */

import { getNYOffset, getNYDateString, APP_TIMEZONE } from '../../packages/shared/src/timezone';

/**
 * Calculate the validity window for a specific day — timezone-aware.
 *
 * Returns ISO strings with the correct NY offset for the given date,
 * automatically handling DST boundaries.
 */
export function calculateDayValidityWindow(
  weekStartDate: Date,
  dow: number,
  startTime: string,
  endTime: string,
  endNextDay: boolean,
  _timezone: string = 'America/New_York'
): { validStartAt: Date; validEndAt: Date } {
  const targetDate = new Date(weekStartDate);
  targetDate.setDate(targetDate.getDate() + dow);
  const targetDateStr = getNYDateString(targetDate);

  const startIso = `${targetDateStr}T${startTime.length === 5 ? startTime + ':00' : startTime}${getNYOffset(targetDate)}`;
  const validStartAt = new Date(startIso);

  let endDateObj = new Date(targetDate);
  if (endNextDay) {
    endDateObj.setDate(endDateObj.getDate() + 1);
  }
  const endDateStr = getNYDateString(endDateObj);
  const endIso = `${endDateStr}T${endTime.length === 5 ? endTime + ':00' : endTime}${getNYOffset(endDateObj)}`;
  const validEndAt = new Date(endIso);

  return { validStartAt, validEndAt };
}

/**
 * Calculate week_start_date (Monday 00:00) in NY timezone.
 */
export function calculateWeekStartDate(
  forDate: Date,
  _timezone: string = 'America/New_York'
): Date {
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(forDate);

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

  const mondayStr = getNYDateString(d);
  const offset = getNYOffset(d);
  return new Date(`${mondayStr}T00:00:00${offset}`);
}

/**
 * 格式化星期几名称
 */
export function getDayName(dow: number): string {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return names[dow] || 'Unknown';
}

/**
 * 格式化星期几短名称
 */
export function getDayShortName(dow: number): string {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return names[dow] || 'Unknown';
}
