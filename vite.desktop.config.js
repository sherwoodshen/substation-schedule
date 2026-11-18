import { createHash } from 'node:crypto';
import { defineConfig, mergeConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import webConfig from './vite.config.js';

// The plugin's default launch arguments disable the Chromium sandbox.
const startDesktop = ({ startup }) => startup(['.']);

// The offline renderer is one HTML file. Allow only its generated scripts in production.
const desktopContentPolicy = {
  name: 'desktop-content-policy',
  enforce: 'post',
  apply: 'build',
  generateBundle: {
    order: 'post',
    handler(_options, bundle) {
      const page = bundle['index.html'];
      const hashes = [...String(page.source).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(([, script]) => `'sha256-${createHash('sha256').update(script.replace(/\r\n?/g, '\n')).digest('base64')}'`);
      const policy = [
        "default-src 'none'",
        `script-src ${hashes.join(' ')}`,
        "style-src 'unsafe-inline'",
        "img-src data: blob:",
        "font-src data:",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      page.source = String(page.source).replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
    },
  },
};

export default defineConfig(mergeConfig(webConfig, {
  server: {
    host: '127.0.0.1',
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data: blob:; base-uri 'none'; form-action 'none'",
    },
  },
  build: { outDir: 'dist-desktop' },
  plugins: [
    electron({
      main: {
        entry: 'electron/main.js',
        onstart: startDesktop,
        vite: { build: { outDir: 'dist-electron/main', emptyOutDir: true, lib: { fileName: () => 'index.js' } } },
      },
      preload: {
        input: 'electron/preload.cjs',
        onstart: startDesktop,
        vite: { build: { outDir: 'dist-electron/preload', emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'preload.cjs' } } } },
      },
    }),
    desktopContentPolicy,
  ],
}));
