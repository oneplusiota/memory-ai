import { formatEntryTime, formatLocalDate } from '@/utils/dateUtils';

describe('formatLocalDate', () => {
  it('uses local calendar fields, not the UTC date', () => {
    // 01:30 local on the 20th — in any zone ahead of UTC the UTC date is still the 19th
    expect(formatLocalDate(new Date(2026, 10, 20, 1, 30))).toBe('2026-11-20');
  });

  it('zero-pads month and day', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });
});

describe('formatEntryTime', () => {
  const now = new Date(2026, 10, 20, 15, 0).getTime();

  it('shows only the time for today', () => {
    expect(formatEntryTime(new Date(2026, 10, 20, 9, 5).getTime(), now)).toBe('09:05');
  });

  it('labels yesterday', () => {
    expect(formatEntryTime(new Date(2026, 10, 19, 23, 59).getTime(), now)).toBe('Yesterday 23:59');
  });

  it('shows day and month earlier this year', () => {
    expect(formatEntryTime(new Date(2026, 2, 3, 8, 0).getTime(), now)).toBe('3 Mar 08:00');
  });

  it('adds the year for other years', () => {
    expect(formatEntryTime(new Date(2025, 11, 31, 8, 0).getTime(), now)).toBe('31 Dec 2025');
  });
});
