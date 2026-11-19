import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist-mono';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.DEV) {
  // Dev-only handle for inspecting state from the console (window.__pt). Not in production builds.
  void Promise.all([
    import('./state.svelte'), import('./audio/transport'), import('./audio/engine'), import('./audio/recorder'),
    import('./storage/db'), import('./lib/toast.svelte'), import('./audio/render'), import('./storage/tapefile'), import('./tools.svelte'),
  ]).then(([state, t, e, r, db, toasts, render, tape, tools]) => {
    (window as unknown as { __pt: unknown }).__pt = { ...state, ...tools, transport: t.transport, engine: e.engine, meterLevel: e.meterLevel, recorder: r.recorder, db, toasts: toasts.toasts, renderMix: render.renderMix, buildTapeParts: tape.buildTapeParts };
  });
}
