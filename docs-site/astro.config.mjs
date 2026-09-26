// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';

const identifierBreak = /(?<=[a-z\d])(?=[A-Z])|(?<=[_/])(?=\w)|(?<=\.)(?=[A-Za-z])/;

/** A word whose case carries its meaning — a lower-case letter before a capital: pH, mg/L, dGH. */
const caseSensitive = /(\S*[a-zµ]\S*?[A-Z]\S*)/;

/** @param {string} value */
const text = (value) => ({ type: 'text', value });

/** @param {string} value */
const asWritten = (value) => ({
  type: 'element',
  tagName: 'span',
  properties: { className: ['as-written'] },
  children: [text(value)],
});

/** @param {any} node @param {'td' | 'th' | null} cell @param {boolean} inCode */
function tidyCells(node, cell, inCode) {
  if (!node.children) return;
  node.children = node.children.flatMap((/** @type {any} */ child) => {
    if (child.type !== 'text' || cell === null) {
      const entered = child.tagName === 'td' || child.tagName === 'th' ? child.tagName : cell;
      tidyCells(child, entered, inCode || child.tagName === 'code');
      return [child];
    }
    if (cell === 'th') {
      if (inCode) return [child];
      return child.value
        .split(caseSensitive)
        .filter((/** @type {string} */ part) => part !== '')
        .map((/** @type {string} */ part) => (caseSensitive.test(part) ? asWritten(part) : text(part)));
    }
    if (!inCode) return [text(child.value.replace(/(\d)–(?=\d)/g, '$1–\u2060'))];
    return child.value
      .split(identifierBreak)
      .flatMap((/** @type {string} */ part, /** @type {number} */ i) =>
        i === 0 ? [text(part)] : [{ type: 'element', tagName: 'wbr', properties: {}, children: [] }, text(part)]
      );
  });
}

const tableCells = () => (/** @type {any} */ tree) => tidyCells(tree, null, false);

export default defineConfig({
  site: 'https://docs.fishroom.app',
  server: { port: 2050, host: true },
  markdown: {
    processor: unified({ rehypePlugins: [tableCells] }),
  },
  vite: {
    server: {
      allowedHosts: ['.local'],
    },
  },
  integrations: [
    starlight({
      title: 'Aquarium Simulator',
      description:
        'An open-source aquarium ecosystem simulation engine — water chemistry, nitrogen cycle, plants, algae, livestock and equipment.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/vladimir-e/aquarium-simulator',
        },
      ],
      customCss: [
        '@fontsource-variable/hanken-grotesk',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-mono/500.css',
        './src/styles/theme.css',
      ],
      expressiveCode: {
        defaultProps: { wrap: true, hangingIndent: 2 },
      },
      editLink: {
        baseUrl: 'https://github.com/vladimir-e/aquarium-simulator/edit/main/docs-site/',
      },
      sidebar: [
        { label: 'Overview', link: '/' },
        {
          label: 'Concepts',
          items: [
            { label: 'Rates into stocks', link: '/concepts/rates-into-stocks/' },
            { label: 'The tick', link: '/concepts/the-tick/' },
            { label: 'Vitality', link: '/concepts/vitality/' },
            { label: 'Verification', link: '/concepts/verification/' },
          ],
        },
        {
          label: 'Subsystems',
          items: [
            { label: 'Environment', link: '/subsystems/environment/' },
            { label: 'Equipment', link: '/subsystems/equipment/' },
            { label: 'Water & gases', link: '/subsystems/water-and-gases/' },
            { label: 'Nitrogen cycle', link: '/subsystems/nitrogen-cycle/' },
            { label: 'Light', link: '/subsystems/light/' },
            { label: 'Plants', link: '/subsystems/plants/' },
            { label: 'Algae', link: '/subsystems/algae/' },
            { label: 'Livestock', link: '/subsystems/livestock/' },
            { label: 'Actions', link: '/subsystems/actions/' },
            { label: 'Alerts & logging', link: '/subsystems/alerts-and-logging/' },
            { label: 'State & persistence', link: '/subsystems/state-and-persistence/' },
          ],
        },
        {
          label: 'UI',
          items: [{ label: 'The dashboard', link: '/ui/' }],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Tunables', link: '/reference/tunables/' },
            { label: 'Presets', link: '/reference/presets/' },
            { label: 'Public API', link: '/reference/public-api/' },
          ],
        },
      ],
    }),
  ],
});
