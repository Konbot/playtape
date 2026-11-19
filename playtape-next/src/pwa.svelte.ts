/* Installable, offline: registers the service worker in the built web app
   (never in development or in the single-file build), offers a reload when a
   new version has been downloaded, and keeps the browser's install prompt
   for the Install key in Settings. Also the lock-screen media controls. */

import { toast } from './lib/toast.svelte';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const pwa = $state({
  /** The browser is offering to install the app. */
  canInstall: false,
  installed: typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches,
  /** Everything needed to run without a connection is cached. */
  offlineReady: false,
});

let deferred: InstallPrompt | null = null;

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    pwa.canInstall = true;
  });
  window.addEventListener('appinstalled', () => { pwa.installed = true; pwa.canInstall = false; deferred = null; });

  if (!import.meta.env.PROD || __SINGLE_FILE__ || !('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.active) pwa.offlineReady = true;
    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      fresh?.addEventListener('statechange', () => {
        if (fresh.state === 'activated') pwa.offlineReady = true;
        if (fresh.state !== 'installed' || !navigator.serviceWorker.controller) return;
        // Never reload on our own: a take might be in progress.
        toast('A new version of PLAYTAPE is ready.', { timeout: 0, action: { label: 'Reload', run: () => fresh.postMessage('skipWaiting') } });
      });
    });
  }).catch(() => { /* offline support is a bonus; the app works without it */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // the very first install also changes controller
    reloading = true;
    location.reload();
  });
}

export async function install(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  pwa.canInstall = false;
}

/* ---------- lock-screen / headset controls ---------- */

export function initMediaSession(h: { toggle: () => void; stop: () => void; rewind: () => void }): void {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const set = (action: MediaSessionAction, fn: () => void) => { try { ms.setActionHandler(action, fn); } catch { /* not supported here */ } };
  set('play', h.toggle);
  set('pause', h.toggle);
  set('stop', h.stop);
  set('previoustrack', h.rewind);
}

export function updateMediaSession(title: string | null, playing: boolean): void {
  const ms = navigator.mediaSession;
  if (!ms || typeof MediaMetadata === 'undefined') return;
  ms.metadata = title ? new MediaMetadata({ title, artist: 'PLAYTAPE' }) : null;
  ms.playbackState = !title ? 'none' : playing ? 'playing' : 'paused';
}
