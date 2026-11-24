import type { CalendarDate } from '../types/plan';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isValidCalendarDate(value: string): value is CalendarDate {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function toUtcEpochDay(dateStr: CalendarDate): number {
  const match = DATE_RE.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromUtcEpochDay(epochDay: number): CalendarDate {
  const utc = new Date(epochDay * MS_PER_DAY);
  const year = String(utc.getUTCFullYear()).padStart(4, '0');
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function addCalendarDays(dateStr: CalendarDate, days: number): CalendarDate {
  return fromUtcEpochDay(toUtcEpochDay(dateStr) + days);
}

export function getDayOfWeek(dateStr: CalendarDate): number {
  const utc = new Date(toUtcEpochDay(dateStr) * MS_PER_DAY);
  return utc.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
}

export function isWeekend(dateStr: CalendarDate): boolean {
  const dow = getDayOfWeek(dateStr);
  return dow === 0 || dow === 6;
}

export function resolveEffectiveStart(requestedStart: CalendarDate): {
  effectiveStart: CalendarDate;
  rolledOverFromWeekend: boolean;
} {
  const dow = getDayOfWeek(requestedStart);
  if (dow === 6) {
    return {
      effectiveStart: addCalendarDays(requestedStart, 2),
      rolledOverFromWeekend: true,
    };
  }
  if (dow === 0) {
    return {
      effectiveStart: addCalendarDays(requestedStart, 1),
      rolledOverFromWeekend: true,
    };
  }
  return {
    effectiveStart: requestedStart,
    rolledOverFromWeekend: false,
  };
}

/**
 * Advances from a weekday by `workingDayOffset` working days (Mon–Fri).
 * Offset 0 returns `startWeekday` itself.
 */
export function addWorkingDays(startWeekday: CalendarDate, workingDayOffset: number): CalendarDate {
  if (workingDayOffset < 0) {
    throw new Error('workingDayOffset must be non-negative');
  }
  let epoch = toUtcEpochDay(startWeekday);
  let remaining = workingDayOffset;
  while (remaining > 0) {
    epoch += 1;
    const dow = new Date(epoch * MS_PER_DAY).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining -= 1;
    }
  }
  return fromUtcEpochDay(epoch);
}

/**
 * Counts Mon–Fri working days strictly after `fromExclusive` up to and including `toInclusive`.
 */
export function countWorkingDaysAfter(fromExclusive: CalendarDate, toInclusive: CalendarDate): number {
  const startEpoch = toUtcEpochDay(fromExclusive);
  const endEpoch = toUtcEpochDay(toInclusive);
  if (endEpoch <= startEpoch) return 0;
  let count = 0;
  for (let epoch = startEpoch + 1; epoch <= endEpoch; epoch += 1) {
    const dow = new Date(epoch * MS_PER_DAY).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      count += 1;
    }
  }
  return count;
}

export function listCalendarDatesInclusive(start: CalendarDate, end: CalendarDate): CalendarDate[] {
  const startEpoch = toUtcEpochDay(start);
  const endEpoch = toUtcEpochDay(end);
  const dates: CalendarDate[] = [];
  for (let epoch = startEpoch; epoch <= endEpoch; epoch += 1) {
    dates.push(fromUtcEpochDay(epoch));
  }
  return dates;
}

export function getLocalTodayDateString(now: Date = new Date()): CalendarDate {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const displayDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const weekdayShortFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  timeZone: 'UTC',
});

export function formatDisplayDate(dateStr: CalendarDate): string {
  if (!isValidCalendarDate(dateStr)) return dateStr;
  return displayDateFormatter.format(new Date(toUtcEpochDay(dateStr) * MS_PER_DAY));
}

export function formatShortDate(dateStr: CalendarDate): string {
  if (!isValidCalendarDate(dateStr)) return dateStr;
  return shortDateFormatter.format(new Date(toUtcEpochDay(dateStr) * MS_PER_DAY));
}

export function formatWeekdayShort(dateStr: CalendarDate): string {
  if (!isValidCalendarDate(dateStr)) return '';
  return weekdayShortFormatter.format(new Date(toUtcEpochDay(dateStr) * MS_PER_DAY));
}
