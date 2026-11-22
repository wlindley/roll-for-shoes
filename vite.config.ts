import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

function pwaServiceWorkerPlugin(): Plugin {
  return {
    name: 'rfs-pwa-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const bundleFiles = Object.keys(bundle).filter((file) => file !== 'sw.js' && !file.endsWith('.map')).sort();
      let hash = 0x811c9dc5;
      const hashText = (text: string) => {
        for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
      };
      for (const file of bundleFiles) {
        const entry = bundle[file];
        if (!entry) continue;
        hashText(`${file}:`);
        if (entry.type === 'chunk') hashText(entry.code);
        else if (typeof entry.source === 'string') hashText(entry.source);
        else for (const byte of entry.source) hash = Math.imul(hash ^ byte, 0x01000193);
      }
      const version = (hash >>> 0).toString(16).padStart(8, '0');
      const bundleAssetUrls = bundleFiles.map((file) => `./${file}`);
      const precacheUrls = [...new Set([
        './', './index.html', './manifest.webmanifest',
        './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
        ...bundleAssetUrls,
      ])];
      const source = [
        `const CACHE_NAME = 'rfs-pwa-${version}';`,
        `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`,
        `self.addEventListener('install', (event) => {`,
        `  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));`,
        `});`,
        `self.addEventListener('activate', (event) => {`,
        `  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('rfs-pwa-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));`,
        `});`,
        `self.addEventListener('fetch', (event) => {`,
        `  const { request } = event;`,
        `  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;`,
        `  if (request.mode === 'navigate') {`,
        `    event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || (await caches.match(new URL('./index.html', self.location).href)) || (await caches.match(new URL('./', self.location).href)) || Response.error()));`,
        `    return;`,
        `  }`,
        `  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));`,
        `});`,
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pwaServiceWorkerPlugin()],
  test: {
    include: ['src/**/*.test.ts'],
    poolOptions: { forks: { execArgv: ['--localstorage-file=node_modules/.vitest-localstorage'] } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/ui/**'],
    },
  },
});
