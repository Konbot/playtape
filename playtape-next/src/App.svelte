<script lang="ts">
  import { onMount } from 'svelte';
  import { QWERTY } from './audio/synth';
  import {
    app, applySettings, deleteSelectedClip, duplicateSelected, importFiles, keyDown, keyUp, recordNewIdea, redo, refreshLibrary,
    rewind, saveNow, setClick, shiftOctave, splitSelected, stepTake, toggleLoop, toggleRecord, togglePlay, undo,
  } from './state.svelte';
  import { initMediaSession, initPwa, updateMediaSession } from './pwa.svelte';
  import { checkOldData } from './tools.svelte';
  import Library from './ui/Library.svelte';
  import SongView from './ui/SongView.svelte';
  import SettingsSheet from './ui/SettingsSheet.svelte';
  import ShareSheet from './ui/ShareSheet.svelte';
  import Toasts from './ui/Toasts.svelte';
  import TunerSheet from './ui/TunerSheet.svelte';

  onMount(() => {
    applySettings();
    void refreshLibrary();
    void checkOldData();
    initPwa();
    initMediaSession({ toggle: () => void togglePlay(), stop: () => { if (app.playing) void togglePlay(); }, rewind });
  });

  $effect(() => updateMediaSession(app.route === 'song' ? (app.song?.name ?? null) : null, app.playing));

  function typing(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    // Sliders and checkboxes are inputs too, but Space must still play while one has focus.
    return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type);
  }

  /** Computer keys currently held as notes (so key-up releases the right pitch after an octave change). */
  const heldKeys = new Map<string, number>();

  function onKeydown(e: KeyboardEvent) {
    if (app.sheet) return; // a sheet is modal: it handles its own keys (Escape closes it)
    if (typing(e) || e.altKey) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (app.route === 'library') {
      if (k === 'r' && !mod) { e.preventDefault(); void recordNewIdea(); }
      return;
    }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) void togglePlay(); return; }
    if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); if (!e.repeat) toggleRecord(); return; }
    // With Keys open the letter rows are a piano; transport stays on Space and Enter.
    if (app.source === 'keys') {
      const n = QWERTY[k];
      if (n != null) {
        e.preventDefault();
        if (!e.repeat && !heldKeys.has(k)) { const pitch = app.keysBase + n; heldKeys.set(k, pitch); void keyDown(pitch); }
        return;
      }
      if (e.key === 'ArrowUp') { e.preventDefault(); shiftOctave(1); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); shiftOctave(-1); return; }
    }
    if (e.repeat) return;
    if (k === 'r') { e.preventDefault(); toggleRecord(); }
    else if (k === 'c') { e.preventDefault(); setClick(!app.click); }
    else if (k === 'l') { e.preventDefault(); toggleLoop(); }
    else if (k === 's' && app.selected) { e.preventDefault(); splitSelected(); }
    else if (k === 't' && app.selected) { e.preventDefault(); stepTake(1); }
    else if (e.key === 'Home') { e.preventDefault(); rewind(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && app.selected) { e.preventDefault(); deleteSelectedClip(); }
    else if (e.key === 'Escape' && app.selected) { app.selected = null; }
  }

  function onKeyup(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    const pitch = heldKeys.get(k);
    if (pitch != null) { heldKeys.delete(k); keyUp(pitch); }
    // Space on a focused button would also "click" it on key-up; the transport owns Space.
    if (e.code === 'Space' && app.route === 'song' && !typing(e)) e.preventDefault();
  }

  function releaseAll() {
    for (const p of heldKeys.values()) keyUp(p);
    heldKeys.clear();
  }

  /* A button clicked with the mouse or a finger must not keep keyboard focus,
     or the next Enter (record) or Space would press it again. Buttons reached
     with Tab keep focus, so keyboard-only use is unchanged. */
  function onClickCapture(e: MouseEvent) {
    if (e.detail === 0) return; // keyboard activation
    queueMicrotask(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLButtonElement)) return;
      const dialog = el.closest<HTMLElement>('[role="dialog"]');
      el.blur();
      dialog?.focus(); // inside a sheet, focus stays in the sheet
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files.length) void importFiles(e.dataTransfer.files);
  }
</script>

<svelte:window
  onkeydown={onKeydown}
  onkeyup={onKeyup}
  onblur={releaseAll}
  onclickcapture={onClickCapture}
  ondragover={(e) => e.preventDefault()}
  ondrop={onDrop}
  onpagehide={() => void saveNow()}
/>
<svelte:document onvisibilitychange={() => { if (document.visibilityState === 'hidden') void saveNow(); }} />

{#if app.route === 'song' && app.song}
  <SongView />
{:else}
  <Library />
{/if}

{#if app.sheet === 'settings'}
  <SettingsSheet />
{:else if app.sheet === 'tuner'}
  <TunerSheet />
{:else if app.sheet === 'share' && app.song}
  <ShareSheet />
{/if}

<Toasts />
