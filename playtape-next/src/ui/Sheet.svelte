<!-- A modal sheet: slides up from the bottom on phones, a centred card on
     larger screens. Escape or a tap outside closes it; focus stays inside
     while it is open and goes back to where it was afterwards. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { dur } from '../lib/motion';
  import Key from './Key.svelte';

  let { title, onclose, children, wide = false }: { title: string; onclose: () => void; children: Snippet; wide?: boolean } = $props();

  let sheet: HTMLElement | undefined = $state();

  $effect(() => {
    const before = document.activeElement as HTMLElement | null;
    sheet?.focus();
    return () => before?.focus?.();
  });

  // On the window, not the sheet: Escape must work even when focus has
  // wandered off (for instance after a button inside was clicked and blurred).
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); return; }
    if (e.key !== 'Tab' || !sheet) return;
    if (!sheet.contains(document.activeElement)) { e.preventDefault(); sheet.focus(); return; }
    const items = [...sheet.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled') && el.offsetParent);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

<svelte:window onkeydown={key} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" transition:fade={{ duration: dur(120) }} onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="sheet" class:wide role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={sheet} transition:fly={{ y: 24, duration: dur(180) }}>
    <header>
      <h2>{title}</h2>
      <Key icon="close" tone="plain" label="Close" onclick={onclose} />
    </header>
    <div class="body">{@render children()}</div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: var(--s-4);
    background: color-mix(in oklch, var(--line) 45%, transparent);
  }
  .sheet {
    width: min(520px, 100%);
    max-height: min(88dvh, 760px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: 6px 6px 0 var(--shadow);
    outline: none;
  }
  .sheet.wide {
    width: min(680px, 100%);
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-3) var(--s-3) var(--s-2) var(--s-5);
  }
  h2 {
    font-size: var(--t-20);
    font-weight: var(--w-black);
  }
  .body {
    overflow-y: auto;
    padding: 0 var(--s-5) var(--s-5);
  }
  @media (max-width: 699px) {
    .scrim {
      place-items: end center;
      padding: 0;
    }
    .sheet {
      width: 100%;
      max-height: 88dvh;
      border-radius: var(--r-lg) var(--r-lg) 0 0;
      border-bottom: 0;
      box-shadow: none;
      padding-bottom: env(safe-area-inset-bottom);
    }
    header {
      padding-left: var(--s-4);
    }
    .body {
      padding: 0 var(--s-4) var(--s-5);
    }
  }
</style>
