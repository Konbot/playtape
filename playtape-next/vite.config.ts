import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/* The offline cache. Hand-written rather than a plugin: it is forty lines,
   has no dependencies, and the only thing it needs from the build is the list
   of files. Everything is precached on install, served cache-first, and a new
   build takes over only when the person agrees to reload. */
const SERVICE_WORKER = `
const CACHE = 'playtape-__VERSION__';
const ASSETS = __ASSETS__;
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('playtape-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const index = await cache.match('index.html'); if (index) return index; }
    return fetch(req);
  })());
});
`;

function serviceWorker(): Plugin {
  return {
    name: 'playtape-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js');
      const pub = readdirSync(new URL('./public', import.meta.url));
      const assets = [...new Set(['./', 'index.html', ...built, ...pub])];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: SERVICE_WORKER.replace('__VERSION__', `${pkg.version}-${Date.now().toString(36)}`).replace('__ASSETS__', JSON.stringify(assets)),
      });
    },
  };
}

/* The single-file build has no folder beside it, so the icon is embedded and
   the links to files that will not exist are dropped. */
function selfContainedHead(): Plugin {
  return {
    name: 'playtape-self-contained-head',
    transformIndexHtml(html) {
      const png = readFileSync(new URL('./public/favicon-32.png', import.meta.url)).toString('base64');
      return html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
        .replace(/href="\.\/favicon-32\.png"/, `href="data:image/png;base64,${png}"`);
    },
  };
}

/* `vite build` makes the installable web app in dist/.
   `vite build --mode single` makes one self-contained dist-single/index.html
   that runs by double-click, like the original TAPE and PLAYTAPE. */
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [svelte(), ...(single ? [viteSingleFile(), selfContainedHead()] : [serviceWorker()])],
    define: {
      __SINGLE_FILE__: JSON.stringify(single),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: { port: 5183, host: '127.0.0.1' },
    preview: { port: 5184, host: '127.0.0.1' },
    build: {
      target: 'es2022',
      outDir: single ? 'dist-single' : 'dist',
      copyPublicDir: !single,
      ...(single ? { assetsInlineLimit: 100_000_000 } : {}),
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
