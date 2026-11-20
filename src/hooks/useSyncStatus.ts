import { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus } from '@/services/sync/SyncManager';
import type { SyncStatus } from '@/services/sync/SyncManager';

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  useEffect(() => {
    setStatus(getSyncStatus());
    return subscribeSyncStatus(setStatus);
  }, []);
  return status;
}
