<script lang="ts">
  import { fly } from 'svelte/transition';
  import { dismiss, toasts } from '../lib/toast.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast {t.kind}" transition:fly={{ y: 16, duration: 180 }}>
      {#if t.kind === 'error'}<Icon name="warning" size={20} />{:else if t.kind === 'ok'}<Icon name="check" size={20} />{/if}
      <span class="msg">{t.message}</span>
      {#if t.action}
        <button class="act" onclick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
      {/if}
      <button class="x" aria-label="Dismiss" onclick={() => dismiss(t.id)}><Icon name="close" size={16} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(var(--dock-h, 0px) + var(--s-4) + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    width: min(520px, calc(100vw - 2 * var(--s-4)));
    z-index: 90;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4);
    background: var(--text);
    color: var(--bg);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
    font-size: var(--t-14);
    font-weight: var(--w-bold);
  }
  .toast.error {
    background: var(--tomato);
    color: var(--on-tomato);
  }
  .msg {
    flex: 1;
    min-width: 0;
  }
  .act {
    flex: none;
    height: 36px;
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
    border: var(--line-w) solid currentColor;
    background: transparent;
    font-weight: var(--w-black);
  }
  .x {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    opacity: 0.8;
  }
  .x:hover,
  .act:hover {
    background: color-mix(in oklch, currentColor 18%, transparent);
  }
</style>
