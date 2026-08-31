// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.fishroom.app',
  server: { port: 2050, host: true },
  vite: {
    server: {
      // LAN preview loop: Vlad reviews from his devices via clarity.local
      allowedHosts: ['clarity.local'],
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
            { label: 'Calibration', link: '/concepts/calibration/' },
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
