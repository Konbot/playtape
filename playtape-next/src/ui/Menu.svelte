<!-- A small popover menu attached to a trigger key. Closes on outside tap, Escape or choosing an item. -->
<script lang="ts" module>
  import type { IconName } from './icons';

  export interface MenuItem {
    label: string;
    icon?: IconName;
    danger?: boolean;
    checked?: boolean;
    run: () => void;
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import Key from './Key.svelte';

  let {
    items,
    label,
    icon = 'more',
    text,
    size = 'md',
    tone = 'plain',
    align = 'end',
    up = false,
  }: {
    items: MenuItem[];
    /** Accessible name of the trigger. */
    label: string;
    icon?: IconName;
    /** Optional visible text on the trigger. */
    text?: string;
    size?: 'sm' | 'md';
    tone?: 'surface' | 'plain';
    align?: 'start' | 'end';
    up?: boolean;
  } = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();

  function onDocPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') { open = false; e.stopPropagation(); }
  }
  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
  }
  /** Nudge the popover back inside the viewport when its trigger sits near an edge. */
  function fit(node: HTMLElement) {
    const r = node.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    if (r.left < pad) dx = pad - r.left;
    else if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;
    if (dx) node.style.transform = `translateX(${dx}px)`;
  }
</script>

<svelte:document onpointerdown={onDocPointer} onkeydown={onKey} />

<div class="menu" bind:this={root}>
  {#if text}
    <Key {icon} {label} {size} {tone} aria-haspopup="menu" aria-expanded={open} onclick={toggle}>{text}</Key>
  {:else}
    <Key {icon} {label} {size} {tone} aria-haspopup="menu" aria-expanded={open} onclick={toggle} />
  {/if}
  {#if open}
    <div class="pop {align}" class:up role="menu" use:fit>
      {#each items as it}
        <button role="menuitem" class:danger={it.danger} onclick={(e) => { e.stopPropagation(); open = false; it.run(); }}>
          {#if it.icon}<Icon name={it.icon} size={18} />{/if}
          <span>{it.label}</span>
          {#if it.checked}<Icon name="check" size={16} />{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    display: inline-flex;
  }
  .pop {
    position: absolute;
    top: calc(100% + 6px);
    z-index: 60;
    min-width: 200px;
    padding: var(--s-1);
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
  }
  .pop.up {
    top: auto;
    bottom: calc(100% + 6px);
  }
  .pop.end {
    right: 0;
  }
  .pop.start {
    left: 0;
  }
  .pop button {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    font-weight: var(--w-bold);
    font-size: var(--t-14);
    text-align: left;
  }
  .pop button span {
    flex: 1;
  }
  .pop button:hover,
  .pop button:focus-visible {
    background: color-mix(in oklch, var(--text) 10%, transparent);
  }
  .pop button.danger {
    color: var(--tomato-text);
  }
</style>
