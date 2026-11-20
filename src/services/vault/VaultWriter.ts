import { StorageAccessFramework, EncodingType } from 'expo-file-system/legacy';
import { getDailyNotePath, getTodayDateString, getISOWeek, getReadableDailyTitle } from '@/utils/dateUtils';

export async function appendToDailyNote(vaultUri: string, entry: string): Promise<string> {
  const relativePath = getDailyNotePath();
  const existingUri = await resolveFileUri(vaultUri, relativePath);
  const trimmedEntry = entry.trim();

  if (existingUri) {
    const existing = await StorageAccessFramework.readAsStringAsync(existingUri);
    const updated = insertIntoLogSection(existing, trimmedEntry);
    await StorageAccessFramework.writeAsStringAsync(existingUri, updated, {
      encoding: EncodingType.UTF8,
    });
  } else {
    const date = getTodayDateString();
    const week = getISOWeek(new Date());
    const title = getReadableDailyTitle();
    const content = `---\ntitle: "${title}"\ntype: daily\ndate: ${date}\nweek: "${week}"\ntags: [daily]\n---\n\n# ${title}\n\n## Log\n\n${trimmedEntry}\n`;
    await writeAtRelativePath(vaultUri, relativePath, content);
  }
  return relativePath;
}

function insertIntoLogSection(existing: string, entry: string): string {
  const logMatch = existing.match(/^## Log$/m);
  if (logMatch && logMatch.index !== undefined) {
    // Find the start of the next ## section after ## Log
    const afterLogStart = logMatch.index + '## Log'.length;
    const afterLog = existing.slice(afterLogStart);
    const nextSectionMatch = afterLog.match(/\n(?=## )/);
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      const insertAt = afterLogStart + nextSectionMatch.index;
      return existing.slice(0, insertAt) + '\n\n' + entry + existing.slice(insertAt);
    }
    // No subsequent ## section — append at end
    return existing.trimEnd() + '\n\n' + entry + '\n';
  }
  // No ## Log section found — append one
  return existing.trimEnd() + '\n\n## Log\n\n' + entry + '\n';
}

export async function appendToNote(
  vaultUri: string,
  relativePath: string,
  contentToAppend: string,
): Promise<void> {
  const fileUri = await resolveFileUri(vaultUri, relativePath);
  const existing = fileUri ? await StorageAccessFramework.readAsStringAsync(fileUri) : '';
  const updated = existing.trimEnd() + '\n\n' + contentToAppend.trim() + '\n';
  if (fileUri) {
    await StorageAccessFramework.writeAsStringAsync(fileUri, updated, {
      encoding: EncodingType.UTF8,
    });
  } else {
    await writeAtRelativePath(vaultUri, relativePath, updated);
  }
}

export async function createNote(
  vaultUri: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await writeAtRelativePath(vaultUri, relativePath, content);
}

export async function readNote(vaultUri: string, relativePath: string): Promise<string | null> {
  try {
    const fileUri = await resolveFileUri(vaultUri, relativePath);
    if (!fileUri) return null;
    return await StorageAccessFramework.readAsStringAsync(fileUri);
  } catch {
    return null;
  }
}

async function writeAtRelativePath(
  vaultUri: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const parts = relativePath.split('/');
  const fileName = parts.pop()!;
  let dirUri = vaultUri;
  for (const part of parts) {
    dirUri = await ensureSubdirectory(dirUri, part);
  }
  const fileUri = await StorageAccessFramework.createFileAsync(dirUri, fileName, 'text/markdown');
  await StorageAccessFramework.writeAsStringAsync(fileUri, content, {
    encoding: EncodingType.UTF8,
  });
}

async function ensureSubdirectory(parentUri: string, name: string): Promise<string> {
  const entries = await StorageAccessFramework.readDirectoryAsync(parentUri);
  for (const uri of entries) {
    const entryName = decodeURIComponent(uri.split('%2F').pop() ?? uri.split('/').pop() ?? '');
    if (entryName === name) return uri;
  }
  return await StorageAccessFramework.makeDirectoryAsync(parentUri, name);
}

async function resolveFileUri(vaultUri: string, relativePath: string): Promise<string | null> {
  const parts = relativePath.split('/');
  let currentUri = vaultUri;
  for (const part of parts) {
    const entries = await StorageAccessFramework.readDirectoryAsync(currentUri);
    const match = entries.find(
      (e) => decodeURIComponent(e.split('%2F').pop() ?? e.split('/').pop() ?? '') === part,
    );
    if (!match) return null;
    currentUri = match;
  }
  return currentUri;
}
