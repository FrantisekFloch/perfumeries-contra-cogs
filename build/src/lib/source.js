// Data-source abstraction + ordered startup scanner.
// Three adapters (Database, API, Folder). In the demo, Database/API return
// "no updates"; Folder reads the manifest and ingests bundled files. The whole
// app depends only on the DataSource interface, so real DB/API adapters can be
// added later without touching the rest of the app.

import { ScanStatus } from './enums.js';

// A DataSource is: { id, scan(): Promise<ScanResult> }
// ScanResult: { id, status: ScanStatus, message, files: FileRecord[] }
// FileRecord: { name, category, path, content }

const NO_UPDATES_MSG = 'No new updates found';

/** Demo stub source that always reports no updates. */
export function createStubSource(id, label) {
  return {
    id,
    label,
    async scan() {
      return { id, status: ScanStatus.NO_UPDATES, message: NO_UPDATES_MSG, files: [] };
    },
  };
}

export const createDatabaseSource = () => createStubSource('database', 'Database');
export const createApiSource = () => createStubSource('api', 'API');

/** Default reader: use an injected offline reader if present (single-file HTML), else fetch. */
async function fetchText(url) {
  if (typeof globalThis !== 'undefined' && typeof globalThis.__PERFUMERIES_READ_TEXT__ === 'function') {
    return globalThis.__PERFUMERIES_READ_TEXT__(url);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Folder source. Reads `${baseUrl}manifest.json`, then each listed inbox file.
 * `readText(path)` is injectable so tests can read from disk and the browser can fetch.
 */
export function createFolderSource({ baseUrl = './data/', readText = fetchText } = {}) {
  return {
    id: 'folder',
    label: 'Folder',
    async scan() {
      const manifestRaw = await readText(`${baseUrl}manifest.json`);
      const manifest = JSON.parse(manifestRaw);
      const inbox = manifest.inbox || {};
      const files = [];
      for (const category of Object.keys(inbox)) {
        for (const name of inbox[category]) {
          const path = `${baseUrl}inbox/${category}/${name}`;
          const content = await readText(path);
          files.push({ name, category, path, content });
        }
      }
      return {
        id: 'folder',
        status: files.length > 0 ? ScanStatus.FOUND : ScanStatus.NO_UPDATES,
        message: files.length > 0 ? `${files.length} file(s) found` : NO_UPDATES_MSG,
        files,
      };
    },
  };
}

/**
 * Scans sources in a fixed order, emitting status via onStatus(id, status, message).
 * On an adapter failure, reports Error for that source and continues (Req 1.7).
 * Returns { results, files } aggregated across sources.
 */
export class SourceScanner {
  constructor(sources, { onStatus = () => {} } = {}) {
    this.sources = sources;
    this.onStatus = onStatus;
  }

  async scanAll() {
    const results = [];
    const files = [];
    for (const source of this.sources) {
      this.onStatus(source.id, ScanStatus.SCANNING, `Scanning ${source.label ?? source.id}…`);
      try {
        const result = await source.scan();
        this.onStatus(source.id, result.status, result.message);
        results.push(result);
        if (result.files && result.files.length) files.push(...result.files);
      } catch (err) {
        const message = `Scan failed: ${err.message}`;
        this.onStatus(source.id, ScanStatus.ERROR, message);
        results.push({ id: source.id, status: ScanStatus.ERROR, message, files: [] });
      }
    }
    return { results, files };
  }
}

/** Default demo source order: Database → API → Folder. */
export function defaultSources(folderOptions) {
  return [createDatabaseSource(), createApiSource(), createFolderSource(folderOptions)];
}
