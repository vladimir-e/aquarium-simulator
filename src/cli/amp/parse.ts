import { readEntry, type AmpEntry, type AmpParameters, type ZeroVariate } from '../../simulation/livestock/amp.js';

export const PAGES = ['par', 'stat', 'res', 'bib', 'cit'] as const;

export type Page = (typeof PAGES)[number];

export type AmpPages = Record<Page, string>;

export interface AmpSource {
  url: string;
  fetched: string;
}

export interface Transcription {
  entry: AmpEntry;
  warnings: string[];
}

interface Cell {
  text: string;
  html: string;
  header: boolean;
}

interface Table {
  heading: string;
  rows: Cell[][];
}

type Rows = Readonly<Record<string, Cell[]>>;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  deg: '°',
  aacute: 'á',
  Aacute: 'Á',
  eacute: 'é',
  Eacute: 'É',
  egrave: 'è',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Ouml: 'Ö',
  Uuml: 'Ü',
  ntilde: 'ñ',
  ccedil: 'ç',
  aelig: 'æ',
  oslash: 'ø',
  Oslash: 'Ø',
  aring: 'å',
  szlig: 'ß',
};

const decode = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name] ?? whole;
    return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  });

const INLINE = /<\/?(?:a|b|i|em|strong|font|span|sub|sup)\b[^>]*>/gi;

const textOf = (html: string): string =>
  decode(html.replace(INLINE, '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const number = (text: string, what: string): number => {
  const value = Number(text);
  if (text === '' || !Number.isFinite(value)) throw new Error(`${what} reads "${text}", not a number`);
  return value;
};

function tables(html: string): Table[] {
  const found: Table[] = [];
  const pattern = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>|<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let heading = '';
  for (const [, title, body] of html.matchAll(pattern)) {
    if (title !== undefined) {
      heading = textOf(title);
      continue;
    }
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) =>
      [...row.matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map(([, kind, cell]) => ({
        text: textOf(cell),
        html: cell,
        header: kind.toLowerCase() === 'h',
      }))
    );
    found.push({ heading, rows });
  }
  return found;
}

const caption = ({ rows: [first] }: Table): string => (first?.length === 1 && first[0].header ? first[0].text : '');

const captioned =
  (start: string) =>
  (found: Table): boolean =>
    caption(found).startsWith(start);

function table(all: Table[], matches: (table: Table) => boolean, name: string, page: Page): Table {
  const hit = all.find(matches);
  if (!hit) throw new Error(`the ${page} page has no ${name} table`);
  return hit;
}

const dataRows = ({ rows }: Table): Cell[][] => rows.filter((row) => row.length > 0 && !row[0].header);

function cells(row: Cell[], count: number, what: string): Cell[] {
  if (row.length < count) {
    throw new Error(`${what} reads "${row.map(({ text }) => text).join(' | ')}": ${row.length} cells, not ${count}`);
  }
  return row;
}

const symbolRows = (found: Table): Rows => Object.fromEntries(dataRows(found).map((row) => [row[0].text, row]));

function modelOf(html: string): string {
  const match = /Model:\s*(\w+)/.exec(textOf(html));
  if (!match) throw new Error('the par page names no model');
  return match[1];
}

const PRIMARY_UNITS = {
  T_A: 'K',
  p_Am: 'J/d.cm^2',
  kap_X: '-',
  v: 'cm/d',
  kap: '-',
  kap_R: '-',
  p_M: 'J/d.cm^3',
  p_T: 'J/d.cm^2',
  k_J: '1/d',
  E_G: 'J/cm^3',
  E_Hb: 'J',
  E_Hp: 'J',
  h_a: '1/d^2',
  s_G: '-',
} as const;

const OPTIONAL_PRIMARY_UNITS = { F_m: 'l/d.cm^2', kap_P: '-' } as const;

const IMPLIED_UNITS = { E_0: 'J', a_b: 'd', a_p: 'd', Ww_b: 'g', Ww_i: 'g' } as const;

function read(rows: Rows, symbol: string, unit: string, page: Page): number {
  const row = rows[symbol];
  if (!row) throw new Error(`the ${page} page lists no ${symbol}`);
  const [, value, given] = cells(row, 3, `the ${page} page's ${symbol} row`);
  if (given.text !== unit) throw new Error(`the ${page} page gives ${symbol} in ${given.text}, not ${unit}`);
  return number(value.text, `${page} ${symbol}`);
}

function readAll<K extends string>(rows: Rows, units: Record<K, string>, page: Page): Record<K, number> {
  return Object.fromEntries(
    Object.entries<string>(units).map(([symbol, unit]) => [symbol, read(rows, symbol, unit, page)])
  ) as Record<K, number>;
}

function readListed<K extends string>(rows: Rows, units: Record<K, string>, page: Page): Partial<Record<K, number>> {
  const listed = Object.entries<string>(units).filter(([symbol]) => symbol in rows);
  return readAll(rows, Object.fromEntries(listed), page) as Partial<Record<K, number>>;
}

const MOLAR_MASS = { Carbon: 12, Hydrogen: 1, Oxygen: 16, Nitrogen: 14 } as const;

/** Chemical potential, density and molar mass of structure and reserve, molar masses from the organics' indices. */
function chemistry(all: Table[]): Pick<AmpParameters, 'd_V' | 'd_E' | 'mu_V' | 'mu_E' | 'w_V' | 'w_E'> {
  const constants = table(all, captioned('Chemical parameters'), 'chemical parameters', 'par');
  const column = (label: string, index: 2 | 3): number => {
    const row = dataRows(constants).find(([first]) => first.text.startsWith(label));
    if (!row) throw new Error(`the par page lists no ${label}`);
    return number(cells(row, index + 1, `the par page's ${label} row`)[index].text, label);
  };
  const indices = table(
    all,
    (t) => t.rows.some((row) => row[0]?.text === 'Chemical indices for organics'),
    'chemical indices',
    'par'
  );
  const organics = indices.rows
    .slice(1, 1 + Object.keys(MOLAR_MASS).length)
    .map((row) => cells(row, 5, "a row of the par page's organics"));
  const molarMass = (offset: 1 | 2): number => {
    const grams = organics.reduce((sum, row) => {
      const element = row[row.length - 5].text as keyof typeof MOLAR_MASS;
      if (!(element in MOLAR_MASS)) throw new Error(`the par page's organics list ${element}`);
      return sum + MOLAR_MASS[element] * number(row[row.length - 4 + offset].text, element);
    }, 0);
    return Number(grams.toPrecision(12));
  };
  return {
    mu_V: column('Chemical potentials', 2),
    mu_E: column('Chemical potentials', 3),
    d_V: column('Specific density for dry weight', 2),
    d_E: column('Specific density for dry weight', 3),
    w_V: molarMass(1),
    w_E: molarMass(2),
  };
}

function zeroVariate(all: Table[]): Record<string, ZeroVariate> {
  const found = table(all, (t) => t.heading === 'Zero-variate data', 'zero-variate data', 'res');
  return Object.fromEntries(
    dataRows(found).map((row) => {
      const [data, observed, predicted, , unit, description, reference] = cells(row, 7, 'a zero-variate row');
      const temperature = /Temperature:\s*([-\d.]+)\s*C/.exec(data.html);
      const datum: ZeroVariate = {
        observed: number(observed.text, `${data.text} observed`),
        predicted: number(predicted.text, `${data.text} predicted`),
        unit: unit.text,
        description: description.text,
        reference: reference.text,
      };
      return [data.text, temperature ? { ...datum, temperatureC: Number(temperature[1]) } : datum];
    })
  );
}

function scalar(html: string, label: string): number {
  const match = new RegExp(`${label}\\s*=\\s*([-\\d.eE+]+)`).exec(textOf(html));
  if (!match) throw new Error(`the res page states no ${label}`);
  return number(match[1], label);
}

function cite(cit: string): Pick<AmpEntry, 'version' | 'authors'> {
  const match = /^(.+?)\. \d{4}\. AmP .+, version (\S+)\.$/.exec(textOf(cit));
  if (!match) throw new Error('the cit page names no authors and version');
  return { version: match[2], authors: match[1].split(', ') };
}

const bibliography = (bib: string): string[] =>
  [...bib.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(([, item]) => textOf(item));

const TEMPERATURE_BOUNDS = ['T_L', 'T_H'];

function transcribe(entry: string, pages: AmpPages, { url, fetched }: AmpSource): Transcription {
  const par = tables(pages.par);
  const primary = symbolRows(table(par, captioned('Primary parameters'), 'primary parameters', 'par'));
  const specific = symbolRows(table(par, captioned('Parameters specific'), 'entry-specific parameters', 'par'));
  const temperature = symbolRows(table(par, captioned('Temperature parameters'), 'temperature parameters', 'par'));
  if (read(temperature, 'T_ref', 'K', 'par') !== 293.15) throw new Error('the par page is not stated at T_ref 20 °C');
  const bounds = TEMPERATURE_BOUNDS.filter((symbol) => symbol in temperature || symbol in primary);

  const model = modelOf(pages.par);
  const stages =
    model === 'std'
      ? ({ model } as const)
      : model === 'abj'
        ? ({ model, E_Hj: read(primary, 'E_Hj', 'J', 'par') } as const)
        : undefined;
  if (!stages) throw new Error(`the par page's model is ${model}; the engine reads std and abj`);

  const stat = tables(pages.stat);
  const statTable = table(stat, captioned('Implied properties at typical temperature'), 'implied properties', 'stat');
  const typical = /typical temperature \(([-\d.]+) deg\. C\)/.exec(caption(statTable));
  if (!typical) throw new Error('the stat page states no typical temperature');
  const implied = symbolRows(statTable);
  const { E_0, ...traits } = readAll(implied, IMPLIED_UNITS, 'stat');
  const acceleration = stages.model === 'abj' ? { s_M: read(implied, 's_M', '-', 'stat') } : {};

  const transcribed: AmpEntry = {
    entry,
    url,
    ...cite(pages.cit),
    fetched,
    complete: scalar(pages.res, 'COMPLETE'),
    mre: scalar(pages.res, 'MRE'),
    typicalTemperatureC: Number(typical[1]),
    parameters: {
      ...stages,
      ...readAll(primary, PRIMARY_UNITS, 'par'),
      ...readListed(primary, OPTIONAL_PRIMARY_UNITS, 'par'),
      del_M: read(specific, 'del_M', '-', 'par'),
      ...chemistry(par),
      E_0,
    },
    implied: { ...traits, ...acceleration },
    zeroVariate: zeroVariate(tables(pages.res)),
    bibliography: bibliography(pages.bib),
  };
  readEntry(transcribed.parameters);
  const warnings = bounds.map(
    (symbol) => `${entry}: lists ${symbol}; the engine scales its rates by T_A alone, with no tolerance bounds`
  );
  return { entry: transcribed, warnings };
}

/** An entry from its five pages, every value as AmP states it, refused where the engine cannot read it. */
export function toEntry(entry: string, pages: AmpPages, source: AmpSource): Transcription {
  try {
    return transcribe(entry, pages, source);
  } catch (err) {
    throw new Error(`${entry}: ${(err as Error).message}`, { cause: err });
  }
}
