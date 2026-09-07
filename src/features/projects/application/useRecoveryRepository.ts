import { useCallback, useMemo } from "react";

import { readRecovery, writeRecovery, clearRecovery } from "@/io/projectDb";

import type { RecoveryRecord } from "@/io/projectDb.types.js";

interface RecoveryRepository {
  read: () => Promise<RecoveryRecord | null>;
  write: (record: RecoveryRecord) => Promise<void>;
  clear: () => Promise<void>;
}

export function useRecoveryRepository(): RecoveryRepository {
  const read = useCallback(async (): Promise<RecoveryRecord | null> => {
    try {
      return await readRecovery();
    } catch (error) {
      console.error("[Recovery] Failed to read recovery:", error);
      return null;
    }
  }, []);

  const write = useCallback(async (record: RecoveryRecord): Promise<void> => {
    await writeRecovery(record);
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    await clearRecovery();
  }, []);

  return useMemo(() => ({ read, write, clear }), [read, write, clear]);
}
