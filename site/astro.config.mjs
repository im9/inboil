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
      head: [
        {
          tag: 'script',
          content: `document.addEventListener('DOMContentLoaded',()=>{
  const a=document.querySelector('a.site-title');if(a)a.href='/docs/';
  if(location.pathname.startsWith('/ja/'))document.cookie='lang=en;path=/;max-age=0';
  else if(location.pathname.startsWith('/docs/'))document.cookie='lang=en;path=/;max-age=31536000';
});`,
        },
      ],
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
          items: [
            { slug: 'docs/scene/nodes' },
            { slug: 'docs/scene/decorators' },
            { slug: 'docs/scene/playback' },
            {
              label: 'Function Nodes',
              autogenerate: { directory: 'docs/scene/function' },
            },
          ],
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
