import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, Plugin} from 'vite';

function entryResolverPlugin(): Plugin {
  return {
    name: 'entry-resolver-fallback',
    enforce: 'pre',
    resolveId(source) {
      if (
        source === '/src/main.tsx' ||
        source === './src/main.tsx' ||
        source === 'src/main.tsx' ||
        source.endsWith('/src/main.tsx') ||
        source === '/main.tsx' ||
        source === './main.tsx' ||
        source === 'main.tsx' ||
        source.endsWith('/main.tsx')
      ) {
        const srcMain = path.resolve(import.meta.dirname, 'src', 'main.tsx');
        if (fs.existsSync(srcMain)) {
          return srcMain;
        }
        const rootMain = path.resolve(import.meta.dirname, 'main.tsx');
        if (fs.existsSync(rootMain)) {
          return rootMain;
        }
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [entryResolverPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
