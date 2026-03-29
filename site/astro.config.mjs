import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appSrc = path.resolve(fileURLToPath(import.meta.url), '../../src');

export default defineConfig({
  site: process.env.SITE || 'https://inboil.app',
  outDir: './dist',
  prefetch: false,
  integrations: [
    sitemap(),
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
          tag: 'meta',
          attrs: { name: 'app-url', content: process.env.PUBLIC_APP_URL || 'https://app.inboil.app' },
        },
        {
          tag: 'script',
          content: `document.addEventListener('DOMContentLoaded',()=>{
  const a=document.querySelector('a.site-title');if(a)a.href='/';
  if(location.pathname.startsWith('/ja/'))document.cookie='lang=en;path=/;max-age=0';
  else if(location.pathname.startsWith('/docs/'))document.cookie='lang=en;path=/;max-age=31536000';
  const sel=document.querySelector('starlight-lang-select select');
  if(sel)sel.addEventListener('change',e=>{
    const v=e.currentTarget.value;
    if(v.startsWith('/docs/')){e.stopImmediatePropagation();window.location.href=v+'?lang=en'}
  },true);
  const hdr=document.querySelector('header.header .sl-flex');
  if(hdr){
    const home=document.createElement('a');
    home.href='/';
    home.textContent='← Home';
    home.className='home-link';
    hdr.appendChild(home);
    const lnk=document.createElement('a');
    lnk.href=location.hostname==='localhost'?'http://localhost:5173':(document.head.querySelector('meta[name=app-url]')?.content||'https://app.inboil.app');
    lnk.textContent='Open App';
    lnk.className='app-link';
    lnk.target='_blank';
    lnk.rel='noopener';
    hdr.appendChild(lnk);
  }
});`,
        },
        {
          tag: 'style',
          content: `.app-link{margin-left:auto;margin-right:1rem;padding:0.25rem 0.7rem;border:1px solid rgba(237,232,220,0.18);border-radius:4px;color:rgba(237,232,220,0.6);font-family:var(--sl-font);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:all 0.2s}.app-link:hover{background:rgba(237,232,220,0.06);border-color:rgba(237,232,220,0.35);color:rgba(237,232,220,0.95)}`,
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
            { slug: 'docs/scene/modifiers' },
            { slug: 'docs/scene/sweep' },
            { slug: 'docs/scene/playback' },
            {
              label: 'Generators',
              autogenerate: { directory: 'docs/scene/generators' },
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
