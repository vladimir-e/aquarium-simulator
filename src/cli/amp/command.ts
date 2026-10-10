import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { entryFitsItsData, readEntry, type AmpEntry } from '../../simulation/livestock/amp.js';
import { PAGES, toEntry, type AmpPages, type AmpSource, type Page } from './parse.js';
import { renderEntry } from './render.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SERVER = 'https://www.bio.vu.nl/thb/deb/deblab/add_my_pet/entries_web';
const PAUSE_MS = 1000;
const FETCHED = 'fetched.txt';

/** Where the command reads pages from and writes what it makes: the page cache, the entry modules, the server. */
export interface AmpWorkspace {
  cache: string;
  modules: string;
  download: (url: string) => Promise<string>;
}

/** A page's text from the bytes served, gunzipped when they arrive still compressed. */
export const pageText = (body: Buffer): string =>
  (body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body).toString('utf8');

async function download(url: string): Promise<string> {
  await pause(PAUSE_MS);
  const response = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return pageText(Buffer.from(await response.arrayBuffer()));
}

export const REPOSITORY: AmpWorkspace = {
  cache: join(ROOT, 'data', 'amp'),
  modules: join(ROOT, 'src', 'simulation', 'livestock', 'amp', 'entries'),
  download,
};

const pageName = (entry: string, page: Page): string => `${entry}_${page}.html`;

const pageUrl = (entry: string, page: Page): string => `${SERVER}/${entry}/${pageName(entry, page)}`;

export const entryFile = (entry: string, modules = REPOSITORY.modules): string => join(modules, `${entry}.ts`);

export function readCache(entry: string, cache = REPOSITORY.cache): { pages: AmpPages; source: AmpSource } {
  const dir = join(cache, entry);
  const pages = Object.fromEntries(
    PAGES.map((page) => [page, readFileSync(join(dir, pageName(entry, page)), 'utf8')])
  ) as AmpPages;
  return { pages, source: { url: pageUrl(entry, 'par'), fetched: readFileSync(join(dir, FETCHED), 'utf8').trim() } };
}

function saveCache(entry: string, pages: AmpPages, fetched: string, cache: string): void {
  const dir = join(cache, entry);
  mkdirSync(dir, { recursive: true });
  for (const page of PAGES) writeFileSync(join(dir, pageName(entry, page)), pages[page]);
  writeFileSync(join(dir, FETCHED), `${fetched}\n`);
}

async function downloadPages(entry: string, workspace: AmpWorkspace): Promise<AmpPages> {
  const pages: Partial<AmpPages> = {};
  for (const page of PAGES) pages[page] = await workspace.download(pageUrl(entry, page));
  return pages as AmpPages;
}

interface Pages {
  pages: AmpPages;
  source: AmpSource;
  fresh: boolean;
}

async function pagesFor(entry: string, offline: boolean, workspace: AmpWorkspace): Promise<Pages> {
  const cached = existsSync(join(workspace.cache, entry, FETCHED));
  if (!offline) {
    try {
      const pages = await downloadPages(entry, workspace);
      const fetched = new Date().toISOString().slice(0, 10);
      return { pages, source: { url: pageUrl(entry, 'par'), fetched }, fresh: true };
    } catch (err) {
      const failure = `${entry}: ${(err as Error).message}`;
      if (!cached) throw new Error(`${failure}; no pages are cached to fall back on`, { cause: err });
      process.stderr.write(`${failure}; using its cached pages\n`);
    }
  }
  if (!cached) throw new Error(`${entry} has no cached pages; run without --offline`);
  return { ...readCache(entry, workspace.cache), fresh: false };
}

function summary(entry: AmpEntry): string {
  const { s_M } = readEntry(entry.parameters);
  const { Wwi } = entry.zeroVariate;
  const fit = entryFitsItsData(entry)
    ? 'fits its data'
    : `misses its data${Wwi ? `: Ww_i ${Wwi.predicted} g predicted against ${Wwi.observed} g observed` : ''}`;
  return `${entry.entry} ${entry.version}: ${entry.parameters.model}, s_M ${Number(s_M.toPrecision(6))}, ${fit}`;
}

/**
 * `npm run amp -- <Entry>... [--offline]`: fetch, parse and transcribe Add-my-Pet entries, one request at a time,
 * caching the pages of each the engine can read. Loads no roster, so an entry the roster imports can always be
 * regenerated.
 */
export async function ampCommand(argv: string[], workspace: AmpWorkspace = REPOSITORY): Promise<void> {
  const unknown = argv.filter((arg) => arg.startsWith('--') && arg !== '--offline');
  if (unknown.length > 0) throw new Error(`Unknown flag ${unknown.join(', ')} for "amp". Valid: --offline.`);
  const offline = argv.includes('--offline');
  const entries = argv.filter((arg) => !arg.startsWith('--'));
  if (entries.length === 0) throw new Error('amp needs at least one entry, e.g. "npm run amp -- Poecilia_reticulata".');
  for (const entry of entries) {
    if (!/^[A-Z][a-z]+(_[a-z]+)+$/.test(entry)) throw new Error(`"${entry}" is not an entry name like Genus_species.`);
  }
  for (const entry of entries) {
    const { pages, source, fresh } = await pagesFor(entry, offline, workspace);
    const { entry: transcribed, warnings } = toEntry(entry, pages, source);
    if (fresh) saveCache(entry, pages, source.fetched, workspace.cache);
    mkdirSync(workspace.modules, { recursive: true });
    writeFileSync(entryFile(entry, workspace.modules), renderEntry(transcribed));
    for (const warning of warnings) process.stderr.write(`${warning}\n`);
    process.stdout.write(`${summary(transcribed)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ampCommand(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
}
