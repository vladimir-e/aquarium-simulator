// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { ampCommand, entryFile, REPOSITORY, type AmpWorkspace } from '../amp/command.js';

const GUPPY = 'Poecilia_reticulata';

const unreachable = (): Promise<string> => Promise.reject(new Error('the network is down'));

const servedFromCache = (url: string): Promise<string> =>
  readFile(join(REPOSITORY.cache, basename(dirname(url)), basename(url)), 'utf8');

const notFound = (url: string): Promise<string> => Promise.reject(new Error(`${url} answered 404`));

describe('ampCommand', () => {
  let root: string;
  let stderr: string[];

  const workspace = (download: AmpWorkspace['download'], cached: string[] = []): AmpWorkspace => {
    const cache = join(root, 'cache');
    for (const entry of cached) cpSync(join(REPOSITORY.cache, entry), join(cache, entry), { recursive: true });
    return { cache, modules: join(root, 'entries'), download };
  };

  const landed = (ws: AmpWorkspace, entry: string): { module: boolean; cache: boolean } => ({
    module: existsSync(entryFile(entry, ws.modules)),
    cache: existsSync(join(ws.cache, entry)),
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'amp-'));
    stderr = [];
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockImplementation((text) => stderr.push(String(text)) > 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses a flag it does not know, and a name that is not Genus_species, before asking for a page', async () => {
    const download = vi.fn(servedFromCache);
    const ws = workspace(download);
    await expect(ampCommand([GUPPY, '--online'], ws)).rejects.toThrow(/Unknown flag --online/);
    await expect(ampCommand(['guppy'], ws)).rejects.toThrow(/"guppy" is not an entry name/);
    expect(download).not.toHaveBeenCalled();
    expect(existsSync(ws.modules)).toBe(false);
  });

  it('refuses an entry the server does not know and nothing caches, writing nothing', async () => {
    const ws = workspace(notFound);
    await expect(ampCommand(['Poecilia_imaginaria'], ws)).rejects.toThrow(/^Poecilia_imaginaria: .*404/);
    expect(landed(ws, 'Poecilia_imaginaria')).toEqual({ module: false, cache: false });
  });

  it('refuses to run offline on an entry with no cached pages', async () => {
    const download = vi.fn(servedFromCache);
    const ws = workspace(download);
    await expect(ampCommand([GUPPY, '--offline'], ws)).rejects.toThrow(/no cached pages/);
    expect(download).not.toHaveBeenCalled();
    expect(landed(ws, GUPPY).module).toBe(false);
  });

  it('falls back to the cached pages when the server cannot be reached', async () => {
    const ws = workspace(unreachable, [GUPPY]);
    await ampCommand([GUPPY], ws);
    expect(stderr.join('')).toMatch(/the network is down; using its cached pages/);
    expect(readFileSync(entryFile(GUPPY, ws.modules), 'utf8')).toBe(readFileSync(entryFile(GUPPY), 'utf8'));
  });

  it('caches the pages it fetched, dated today, beside the module they render to', async () => {
    const ws = workspace(servedFromCache);
    await ampCommand([GUPPY], ws);
    const today = new Date().toISOString().slice(0, 10);
    expect(readFileSync(join(ws.cache, GUPPY, 'fetched.txt'), 'utf8')).toBe(`${today}\n`);
    expect(readFileSync(entryFile(GUPPY, ws.modules), 'utf8')).toBe(
      readFileSync(entryFile(GUPPY), 'utf8').replace(/fetched: '[^']*'/, `fetched: '${today}'`)
    );
  });

  it('lands neither the module nor the cache of an entry the engine cannot read', async () => {
    const ws = workspace(servedFromCache);
    await expect(ampCommand(['Danio_rerio'], ws)).rejects.toThrow(/^Danio_rerio: .*del_M/);
    expect(landed(ws, 'Danio_rerio')).toEqual({ module: false, cache: false });
  });
});
