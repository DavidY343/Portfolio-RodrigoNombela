// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://portfolio-rodrigo-nombela.vercel.app',
  // Removed base for Vercel deployment (standard root deployment)
  vite: {
    plugins: [tailwindcss()]
  }
});