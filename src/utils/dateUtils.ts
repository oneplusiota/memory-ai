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
