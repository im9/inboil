import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appSrc = path.resolve(fileURLToPath(import.meta.url), '../../src');

export default defineConfig({
  outDir: './dist',
  prefetch: false,
  integrations: [
    starlight({
      title: 'INBOIL',
      logo: {
        src: './public/favicon.svg',
        replacesTitle: false,
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ja: { label: '日本語', lang: 'ja' },
      },
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'docs/getting-started' },
        },
        {
          label: 'Sequencer',
          autogenerate: { directory: 'docs/sequencer' },
        },
        {
          label: 'Sound',
          autogenerate: { directory: 'docs/sound' },
        },
        {
          label: 'Scene',
          autogenerate: { directory: 'docs/scene' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'docs/reference' },
        },
      ],
    }),
    svelte(),
  ],
  vite: {
    resolve: {
      alias: {
        '$app': appSrc,
      },
    },
  },
});
