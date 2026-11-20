import { formatLocalDate } from '@/utils/dateUtils';

describe('formatLocalDate', () => {
  it('uses local calendar fields, not the UTC date', () => {
    // 01:30 local on the 20th — in any zone ahead of UTC the UTC date is still the 19th
    expect(formatLocalDate(new Date(2026, 10, 20, 1, 30))).toBe('2026-11-20');
  });

  it('zero-pads month and day', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });
});
