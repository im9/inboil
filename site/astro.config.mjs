import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  outDir: './dist',
  integrations: [
    starlight({
      title: 'inboil',
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'docs/getting-started' },
        },
      ],
    }),
  ],
});
