// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { fileURLToPath, URL } from 'node:url';
import { toEntry, type AmpPages, type Transcription } from '../amp/parse.js';
import { renderEntry } from '../amp/render.js';
import { entryFile, pageText, readCache } from '../amp/command.js';
import type { AmpEntry } from '../../simulation/livestock/amp.js';

const transcribe = (entry: string, edit: (pages: AmpPages) => Partial<AmpPages> = () => ({})): Transcription => {
  const { pages, source } = readCache(entry);
  return toEntry(entry, { ...pages, ...edit(pages) }, source);
};

const parse = (entry: string): AmpEntry => transcribe(entry).entry;

const CACHED = readdirSync(fileURLToPath(new URL('../../../data/amp/', import.meta.url)));

describe('an entry parsed from its cached pages', () => {
  it('reads a std entry: version, primaries, shape, chemistry, implied traits, zero-variate data and sources', () => {
    const guppy = parse('Poecilia_reticulata');
    expect(guppy).toMatchObject({
      entry: 'Poecilia_reticulata',
      url: 'https://www.bio.vu.nl/thb/deb/deblab/add_my_pet/entries_web/Poecilia_reticulata/Poecilia_reticulata_par.html',
      version: '2017/01/02',
      authors: ['Bas Kooijman'],
      fetched: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      complete: 2.7,
      mre: 0.071,
      typicalTemperatureC: 26,
      parameters: {
        model: 'std',
        T_A: 6000,
        p_Am: 83.5735,
        F_m: 6.5,
        kap_P: 0.1,
        v: 0.0095537,
        kap: 0.50853,
        p_M: 59.0125,
        p_T: 0,
        E_Hb: 5.145,
        E_Hp: 81.03,
        h_a: 6.65e-7,
        s_G: -0.61078,
        del_M: 0.126,
        mu_V: 500_000,
        mu_E: 550_000,
        d_V: 0.2,
        d_E: 0.2,
        w_V: 23.9,
        w_E: 23.9,
        E_0: 18.7481,
      },
      implied: { a_b: 24.8344, a_p: 98.8018, Ww_b: 0.00266369, Ww_i: 1.08347 },
    });
    expect(guppy.parameters).not.toHaveProperty('E_Hj');
    expect(guppy.implied).not.toHaveProperty('s_M');
    expect(guppy.zeroVariate.tp).toEqual({
      observed: 74,
      predicted: 73.97,
      unit: 'd',
      description: 'time since birth at puberty',
      reference: 'Wiki',
      temperatureC: 26,
    });
    expect(guppy.zeroVariate.Ri?.temperatureC).toBe(27);
    expect(guppy.zeroVariate.Li).not.toHaveProperty('temperatureC');
    expect(guppy.bibliography).toHaveLength(5);
    expect(guppy.bibliography[2]).toContain('Troncoso, W., Sánchez, S., and Perdomo, L. (2008)');
  });

  it('reads an abj entry’s maturity at metamorphosis and acceleration', () => {
    const betta = parse('Betta_splendens');
    expect(betta.authors).toEqual(['Bas Kooijman', 'Starrlight Augustine']);
    expect(betta.parameters).toMatchObject({ model: 'abj', E_Hb: 0.0006436, E_Hj: 0.1929, E_Hp: 21.57, del_M: 0.59636 });
    expect(betta.implied.s_M).toBe(6.53949);
    expect(betta.zeroVariate.am).toMatchObject({ observed: 3650, predicted: 3647, reference: 'guess' });
    expect(betta.zeroVariate.Wwi).toMatchObject({ observed: 4.7, predicted: 147.5 });
  });

  it('reads every cached entry that gives a shape coefficient, and refuses the one that does not', () => {
    for (const entry of CACHED.filter((name) => name !== 'Danio_rerio')) {
      expect(['std', 'abj']).toContain(parse(entry).parameters.model);
    }
    expect(() => parse('Danio_rerio')).toThrow(/del_M/);
  });

  it('names the entry it refuses: an unread model, a primary in another unit, a budget the engine cannot run', () => {
    const guppy = (edit: (par: string) => string) => (): Transcription =>
      transcribe('Poecilia_reticulata', ({ par }) => ({ par: edit(par) }));
    expect(guppy((par) => par.replace('&nbsp;std &nbsp;', '&nbsp;stx &nbsp;'))).toThrow(/^Poecilia_reticulata: .*stx/);
    expect(guppy((par) => par.replace('<TD>J/d.cm^2</TD>', '<TD>kJ/d.cm^2</TD>'))).toThrow(
      /^Poecilia_reticulata: .*kJ\/d\.cm\^2/
    );
    expect(guppy((par) => par.replace(/(<TD>p_T<\/TD> <TD>)0/, '$11'))).toThrow(/^Poecilia_reticulata: .*p_T/);
  });

  it('refuses a row short of its cells by name, not with a TypeError', () => {
    const short = (): Transcription =>
      transcribe('Poecilia_reticulata', ({ par }) => ({
        par: par.replace(/(<TD>v<\/TD> <TD>[^<]*<\/TD>).*<\/TR>/, '$1</TR>'),
      }));
    expect(short).toThrow(/^Poecilia_reticulata: .*v row .*2 cells, not 3/);
    expect(short).not.toThrow(TypeError);
  });

  it('reads only the rows the engine uses: a row it skips may say anything, F_m and κ_P may be missing', () => {
    const { entry } = transcribe('Poecilia_reticulata', ({ par, stat }) => ({
      par: par.replace(/<TR[^>]*> <TD>(F_m|kap_P)<\/TD>.*<\/TR>/g, ''),
      stat: stat.replace(/(<TD>J_Ci<\/TD> <TD>)[^<]*/, '$1not a number'),
    }));
    expect(entry.parameters).not.toHaveProperty('F_m');
    expect(entry.parameters).not.toHaveProperty('kap_P');
    expect(entry.implied).toEqual(parse('Poecilia_reticulata').implied);
  });

  it('requires an abj entry’s acceleration', () => {
    const unaccelerated = (): Transcription =>
      transcribe('Betta_splendens', ({ stat }) => ({ stat: stat.replace(/<TR[^>]*> <TD>s_M<\/TD>.*<\/TR>/, '') }));
    expect(unaccelerated).toThrow(/^Betta_splendens: the stat page lists no s_M/);
  });

  it('warns of temperature tolerance bounds the engine leaves out', () => {
    expect(transcribe('Poecilia_reticulata').warnings).toEqual([]);
    const bounded = transcribe('Poecilia_reticulata', ({ par }) => ({
      par: par.replace(
        '<TD>T_ref</TD>',
        '<TD>T_L</TD> <TD>290</TD> <TD>K</TD><TD>lower boundary</TD></TR><TR> <TD>T_ref</TD>'
      ),
    }));
    expect(bounded.warnings).toEqual([expect.stringMatching(/^Poecilia_reticulata: lists T_L/)]);
  });

  it('decodes a page served still gzipped, and passes a plain one through', () => {
    const html = '<TD>p_Am</TD> <TD>83.5735</TD>';
    expect(pageText(gzipSync(html))).toBe(html);
    expect(pageText(Buffer.from(html))).toBe(html);
  });
});

describe('the transcribed entries', () => {
  const generated = readdirSync(fileURLToPath(new URL('../../simulation/livestock/amp/entries/', import.meta.url))).map(
    (file) => file.replace(/\.ts$/, '')
  );

  it.each(generated)('%s is exactly what its cached pages render to', (entry) => {
    expect(readFileSync(entryFile(entry), 'utf8')).toBe(renderEntry(parse(entry)));
  });
});
