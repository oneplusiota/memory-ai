export function getRawLogPath(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHmmss
  return `journal/${date}/${time}.md`;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateHeading(): string {
  return new Date().toISOString().slice(0, 10);
}
