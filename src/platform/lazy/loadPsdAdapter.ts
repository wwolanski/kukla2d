import type { readPsd } from "ag-psd";

interface PsdAdapter {
  readPsd: typeof readPsd;
}

let cachedAdapter: PsdAdapter | null = null;

export async function loadPsdAdapter(): Promise<PsdAdapter> {
  if (cachedAdapter) return cachedAdapter;
  const { readPsd: readPsdFile } = await import("ag-psd");
  cachedAdapter = { readPsd: readPsdFile };
  return cachedAdapter;
}
