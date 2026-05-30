import { useCallback, useEffect, useState } from 'react';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

const VAULT_URI_KEY = 'vault_dir_uri';

export function useVault() {
  const [vaultUri, setVaultUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(VAULT_URI_KEY);
      setVaultUri(stored);
      setLoading(false);
    })();
  }, []);

  const pickVault = useCallback(async (): Promise<string | null> => {
    try {
      const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return null;
      const uri = result.directoryUri;
      await SecureStore.setItemAsync(VAULT_URI_KEY, uri);
      setVaultUri(uri);
      return uri;
    } catch (e: unknown) {
      // User dismissed the picker — not an error worth surfacing
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      if (
        msg.includes('cancel') ||
        msg.includes('dismiss') ||
        msg.includes('user denied') ||
        msg.includes('aborted')
      ) {
        return null;
      }
      throw e;
    }
  }, []);

  const clearVault = useCallback(async () => {
    await SecureStore.deleteItemAsync(VAULT_URI_KEY);
    setVaultUri(null);
  }, []);

  return { vaultUri, loading, pickVault, clearVault };
}
