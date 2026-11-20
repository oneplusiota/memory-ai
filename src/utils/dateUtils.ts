/** YYYY-MM-DD in the device's local time zone (toISOString would give the UTC date). */
export function formatLocalDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function formatLocalTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14:05" today, "Yesterday 14:05", "12 Nov 14:05", or "12 Nov 2025" for other years. */
export function formatEntryTime(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const time = formatLocalTime(d);
  const dayDiff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000,
  );
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `Yesterday ${time}`;
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? `${day} ${time}` : `${day} ${d.getFullYear()}`;
}
