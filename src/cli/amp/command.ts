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
const CACHE = join(ROOT, 'data', 'amp');
const ENTRIES = join(ROOT, 'src', 'simulation', 'livestock', 'amp', 'entries');
const SERVER = 'https://www.bio.vu.nl/thb/deb/deblab/add_my_pet/entries_web';
const PAUSE_MS = 1000;
const FETCHED = 'fetched.txt';

const pageName = (entry: string, page: Page): string => `${entry}_${page}.html`;

export const pageUrl = (entry: string, page: Page): string => `${SERVER}/${entry}/${pageName(entry, page)}`;

export const entryFile = (entry: string): string => join(ENTRIES, `${entry}.ts`);

export function readCache(entry: string): { pages: AmpPages; source: AmpSource } {
  const dir = join(CACHE, entry);
  const pages = Object.fromEntries(
    PAGES.map((page) => [page, readFileSync(join(dir, pageName(entry, page)), 'utf8')])
  ) as AmpPages;
  return { pages, source: { url: pageUrl(entry, 'par'), fetched: readFileSync(join(dir, FETCHED), 'utf8').trim() } };
}

function saveCache(entry: string, pages: AmpPages, fetched: string): void {
  const dir = join(CACHE, entry);
  mkdirSync(dir, { recursive: true });
  for (const page of PAGES) writeFileSync(join(dir, pageName(entry, page)), pages[page]);
  writeFileSync(join(dir, FETCHED), `${fetched}\n`);
}

/** A page's text from the bytes served, gunzipped when they arrive still compressed. */
export const pageText = (body: Buffer): string =>
  (body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body).toString('utf8');

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return pageText(Buffer.from(await response.arrayBuffer()));
}

async function fetchPages(entry: string): Promise<AmpPages> {
  const pages: Partial<AmpPages> = {};
  for (const page of PAGES) {
    await pause(PAUSE_MS);
    pages[page] = await fetchPage(pageUrl(entry, page));
  }
  return pages as AmpPages;
}

async function pagesFor(entry: string, offline: boolean): Promise<{ pages: AmpPages; source: AmpSource }> {
  const cached = existsSync(join(CACHE, entry, FETCHED));
  if (!offline) {
    try {
      const pages = await fetchPages(entry);
      const fetched = new Date().toISOString().slice(0, 10);
      saveCache(entry, pages, fetched);
      return { pages, source: { url: pageUrl(entry, 'par'), fetched } };
    } catch (err) {
      if (!cached) throw err;
      process.stderr.write(`${entry}: ${(err as Error).message}; using the pages cached in data/amp\n`);
    }
  }
  if (!cached) throw new Error(`${entry} has no pages cached in data/amp; run without --offline`);
  return readCache(entry);
}

function summary(entry: AmpEntry): string {
  const { s_M } = readEntry(entry.parameters);
  const { Wwi } = entry.zeroVariate;
  const fit = entryFitsItsData(entry)
    ? 'fits its data'
    : `misses its data${Wwi ? `: Ww_i ${Wwi.predicted} g predicted against ${Wwi.observed} g observed` : ''}`;
  return `${entry.entry}: ${entry.parameters.model}, s_M ${Number(s_M.toPrecision(6))}, ${fit}`;
}

/**
 * `npm run amp -- <Entry>... [--offline]`: fetch, cache, parse and transcribe Add-my-Pet entries, one request at a
 * time. Loads no roster, so an entry the roster imports can always be regenerated.
 */
export async function ampCommand(argv: string[]): Promise<void> {
  const unknown = argv.filter((arg) => arg.startsWith('--') && arg !== '--offline');
  if (unknown.length > 0) throw new Error(`Unknown flag ${unknown.join(', ')} for "amp". Valid: --offline.`);
  const offline = argv.includes('--offline');
  const entries = argv.filter((arg) => !arg.startsWith('--'));
  if (entries.length === 0) throw new Error('amp needs at least one entry, e.g. "npm run amp -- Poecilia_reticulata".');
  for (const entry of entries) {
    if (!/^[A-Z][a-z]+(_[a-z]+)+$/.test(entry)) throw new Error(`"${entry}" is not an entry name like Genus_species.`);
  }
  mkdirSync(ENTRIES, { recursive: true });
  for (const entry of entries) {
    const { pages, source } = await pagesFor(entry, offline);
    const parsed = toEntry(entry, pages, source);
    writeFileSync(entryFile(entry), renderEntry(parsed));
    process.stdout.write(`${summary(parsed)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ampCommand(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
}
