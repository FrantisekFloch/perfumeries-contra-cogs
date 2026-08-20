// Data-source abstraction + ordered startup scanner (Req 1, 10).
// Three adapters: Database, API (both "no updates" in the demo) and Folder (live).
// Folder reads a manifest (no directory listing on static hosts) and fetches
// each inbox file. A `fetcher` is injected so tests can supply a filesystem
// reader and the browser can supply fetch().

import { ScanStatus } from './enums.js';

/** Stub adapter that reports no updates. */
export function makeStubSource(name) {
  return {
    name,
    async scan() { return { name, status: ScanStatus.NO_UPDATES, files: [] }; },
  };
}

/**
 * Folder adapter. `manifest` = { categories: { agreements:[names], ... } }.
 * `fetcher(category, name) -> Promise<string>` returns file text.
 */
export function makeFolderSource(manifest, fetcher) {
  return {
    name: 'Folder',
    async scan() {
      const files = [];
      for (const [category, names] of Object.entries(manifest.categories || {})) {
        for (const name of names) {
          const text = await fetcher(category, name);
          files.push({ category, name, text });
        }
      }
      return { name: 'Folder', status: ScanStatus.FOUND, files };
    },
  };
}

/**
 * Ordered scanner: Database -> API -> Folder. Emits status events via onStatus.
 * On an adapter failure, reports ERROR for that source and continues (Req 1.7).
 * Returns the aggregated files found (from all successful sources).
 */
export async function runScan(sources, { onStatus = () => {} } = {}) {
  const allFiles = [];
  const results = [];
  for (const src of sources) {
    onStatus({ name: src.name, status: ScanStatus.SCANNING });
    try {
      const res = await src.scan();
      results.push(res);
      if (res.files?.length) allFiles.push(...res.files);
      onStatus({ name: src.name, status: res.status, count: res.files?.length ?? 0 });
    } catch (e) {
      results.push({ name: src.name, status: ScanStatus.ERROR, error: e.message, files: [] });
      onStatus({ name: src.name, status: ScanStatus.ERROR, error: e.message });
    }
  }
  return { files: allFiles, results };
}

/** Build the standard demo source set (DB stub, API stub, Folder live). */
export function demoSources(manifest, folderFetcher) {
  return [
    makeStubSource('Database'),
    makeStubSource('API'),
    makeFolderSource(manifest, folderFetcher),
  ];
}
