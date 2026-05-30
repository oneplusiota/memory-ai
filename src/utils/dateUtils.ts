export function getDailyNotePath(): string {
  return `daily/${getTodayDateString()}.md`;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTimeHeading(): string {
  return new Date().toTimeString().slice(0, 5); // HH:MM
}

export function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function getReadableDailyTitle(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const day = ordinalSuffix(d.getDate());
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday} - ${day} ${month} ${d.getFullYear()}`;
}

export function sanitizeDates(content: string, correctYear: string): string {
  return content.replace(/\b(20\d{2})\b/g, (match) =>
    match === correctYear ? match : correctYear,
  );
}
