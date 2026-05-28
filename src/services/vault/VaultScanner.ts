import { StorageAccessFramework, getInfoAsync } from 'expo-file-system/legacy';

export type ScannedFile = {
  uri: string;
  relativePath: string;
};

export async function scanVaultForMarkdown(vaultUri: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  await scanDir(vaultUri, '', results);
  return results;
}

async function scanDir(
  dirUri: string,
  relativePrefix: string,
  results: ScannedFile[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    return;
  }

  for (const uri of entries) {
    const name = decodeURIComponent(uri.split('%2F').pop() ?? uri.split('/').pop() ?? '');
    if (name.startsWith('.')) continue;

    const relativePath = relativePrefix ? `${relativePrefix}/${name}` : name;

    try {
      const info = await getInfoAsync(uri);
      if (info.isDirectory) {
        await scanDir(uri, relativePath, results);
      } else if (name.endsWith('.md')) {
        results.push({ uri, relativePath });
      }
    } catch {
      // skip unreadable entries
    }
  }
}
