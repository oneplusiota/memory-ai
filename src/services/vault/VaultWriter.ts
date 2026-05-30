import { StorageAccessFramework, EncodingType } from 'expo-file-system/legacy';
import { getDailyNotePath, getTodayDateString, getTimeHeading, getISOWeek, getReadableDailyTitle } from '@/utils/dateUtils';
import type { ConversationMessage } from '@/types';

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

export async function saveConversationFile(
  vaultUri: string,
  messages: ConversationMessage[],
  extracted: boolean = false,
  atomsTouched: string[] = [],
): Promise<string> {
  const date = getTodayDateString();
  const time = getTimeHeading();
  const firstUserMsg = messages.find(m => m.role === 'user')?.text ?? '';

  // Build a readable slug from the first user message (first 5 words, sanitized)
  const wordSlug = firstUserMsg
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-');
  const slug = wordSlug ? `${date}-${wordSlug}` : `${date}-${time.replace(':', '')}`;
  const relativePath = `conversations/${slug}.md`;

  const body = messages
    .map((m) => `**${m.role === 'user' ? 'You' : 'AI'}**: ${m.text}`)
    .join('\n\n');

  const preview = firstUserMsg.slice(0, 100).replace(/\n/g, ' ').replace(/"/g, "'");
  const title = firstUserMsg.slice(0, 60) || `Conversation ${date} ${time}`;
  const topics = atomsTouched.map(a => `"[[${a.replace(/^atoms\//, '').replace(/\.md$/, '')}]]"`).join(', ');
  const content = `---\ntitle: "${title.replace(/"/g, "'")}"\ntype: conversation\ndate: ${date}\ntime: ${time}\ntopics: [${topics}]\nextracted: ${extracted}\npreview: "${preview}"\ntags: [conversation]\n---\n\n${body}\n`;

  await writeAtRelativePath(vaultUri, relativePath, content);
  return relativePath;
}

export async function updateConversationMeta(
  vaultUri: string,
  relativePath: string,
  extracted: boolean,
  atomsTouched: string[],
): Promise<void> {
  const fileUri = await resolveFileUri(vaultUri, relativePath);
  if (!fileUri) return;
  const content = await StorageAccessFramework.readAsStringAsync(fileUri);
  const topics = atomsTouched.map(a => `"[[${a.replace(/^atoms\//, '').replace(/\.md$/, '')}]]"`).join(', ');
  const updated = content
    .replace(/^extracted: .+$/m, `extracted: ${extracted}`)
    .replace(/^topics: \[.*\]$/m, `topics: [${topics}]`);
  await StorageAccessFramework.writeAsStringAsync(fileUri, updated, { encoding: EncodingType.UTF8 });
}

export async function listConversationFiles(vaultUri: string): Promise<Array<{
  relativePath: string;
  title: string;
  date: string;
  time: string;
  extracted: boolean;
  preview: string;
}>> {
  const dirEntries = await listDirectory(vaultUri, 'conversations');
  const results = [];
  for (const { uri, name } of dirEntries) {
    if (!name.endsWith('.md')) continue;
    try {
      const content = await StorageAccessFramework.readAsStringAsync(uri);
      const fm = parseConversationFrontmatter(content);
      // Fall back to body extraction for files saved before the preview field was added
      const preview = fm.preview || extractFirstUserMessage(content);
      results.push({ relativePath: `conversations/${name}`, ...fm, preview });
    } catch {
      // skip unreadable files
    }
  }
  return results.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
}

function parseConversationFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { title: '', date: '', time: '', extracted: false, preview: '' };
  const raw = match[1];
  const title = (raw.match(/^title: "?(.+?)"?$/m)?.[1] ?? '').trim();
  const date = (raw.match(/^date: (.+)$/m)?.[1] ?? '').trim();
  const time = (raw.match(/^time: (.+)$/m)?.[1] ?? '').trim();
  const extracted = raw.match(/^extracted: true$/m) !== null;
  const preview = (raw.match(/^preview: "?(.*?)"?\s*$/m)?.[1] ?? '').trim();
  return { title, date, time, extracted, preview };
}

function extractFirstUserMessage(content: string): string {
  // Capture everything after "**You**: " until the next message separator or end
  const match = content.match(/\*\*You\*\*: ([\s\S]+?)(?=\n\n\*\*|\n---|\s*$)/);
  if (!match) return '';
  return match[1].replace(/\n/g, ' ').trim().slice(0, 100);
}

async function listDirectory(vaultUri: string, folder: string): Promise<Array<{ uri: string; name: string }>> {
  try {
    const entries = await StorageAccessFramework.readDirectoryAsync(vaultUri);
    const folderUri = entries.find(
      (e) => decodeURIComponent(e.split('%2F').pop() ?? '') === folder,
    );
    if (!folderUri) return [];
    const files = await StorageAccessFramework.readDirectoryAsync(folderUri);
    return files.map((uri) => ({
      uri,
      name: decodeURIComponent(uri.split('%2F').pop() ?? ''),
    }));
  } catch {
    return [];
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

const LIFE_CONTEXT_PATH = 'context/life-context.md';

export async function readLifeContext(vaultUri: string): Promise<string | null> {
  try {
    const fileUri = await resolveFileUri(vaultUri, LIFE_CONTEXT_PATH);
    if (!fileUri) return null;
    return await StorageAccessFramework.readAsStringAsync(fileUri);
  } catch {
    return null;
  }
}

export async function writeLifeContext(vaultUri: string, content: string): Promise<void> {
  const existingUri = await resolveFileUri(vaultUri, LIFE_CONTEXT_PATH);
  if (existingUri) {
    await StorageAccessFramework.writeAsStringAsync(existingUri, content, { encoding: EncodingType.UTF8 });
  } else {
    await writeAtRelativePath(vaultUri, LIFE_CONTEXT_PATH, content);
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
