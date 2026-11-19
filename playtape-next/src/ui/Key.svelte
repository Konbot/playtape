<!-- The one button of the app: a flat sticker key that travels when pressed. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  type Props = HTMLButtonAttributes & {
    icon?: IconName;
    /** Accessible name; required when there is no visible text. */
    label?: string;
    tone?: 'surface' | 'blue' | 'ink' | 'tomato' | 'plain';
    size?: 'sm' | 'md' | 'lg';
    /** Toggle state (sets aria-pressed and the "on" look). */
    pressed?: boolean;
    round?: boolean;
    children?: Snippet;
  };

  let { icon, label, tone = 'surface', size = 'md', pressed, round = false, children, class: klass = '', ...rest }: Props = $props();
  const iconSize = $derived(size === 'lg' ? 28 : size === 'sm' ? 18 : 22);
</script>

<button
  type="button"
  class="key {tone} {size} {klass}"
  class:round
  class:icon-only={!children}
  class:on={pressed}
  aria-label={label}
  aria-pressed={pressed}
  title={children ? undefined : label}
  {...rest}
>
  {#if icon}<Icon name={icon} size={iconSize} />{/if}
  {#if children}<span class="text">{@render children()}</span>{/if}
</button>

<style>
  .key {
    --h: 44px;
    --fill: var(--surface);
    --ink: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
    min-width: var(--h);
    height: var(--h);
    padding: 0 var(--s-4);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    background: var(--fill);
    color: var(--ink);
    font-weight: var(--w-bold);
    font-size: var(--t-16);
    line-height: 1;
    white-space: nowrap;
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
    transition: transform 0.28s var(--spring), box-shadow 0.28s var(--spring), background-color 0.12s;
    user-select: none;
    -webkit-user-select: none;
    flex: none;
  }
  .key.icon-only {
    padding: 0;
    width: var(--h);
  }
  .key.round {
    border-radius: var(--r-full);
  }
  .key.sm {
    --h: 36px;
    font-size: var(--t-14);
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
  }
  /* fingers need more than a mouse does */
  @media (pointer: coarse) {
    .key.sm {
      --h: 40px;
    }
  }
  .key.lg {
    --h: 56px;
    font-size: var(--t-20);
    padding: 0 var(--s-5);
  }
  .key.blue {
    --fill: var(--blue);
    --ink: var(--on-blue);
  }
  .key.ink {
    --fill: var(--text);
    --ink: var(--bg);
  }
  .key.tomato {
    --fill: var(--tomato);
    --ink: var(--on-tomato);
  }
  .key.plain {
    --fill: transparent;
    border-color: transparent;
    box-shadow: none;
  }
  .key.on {
    --fill: var(--blue);
    --ink: var(--on-blue);
  }
  @media (hover: hover) {
    .key:hover:not(:disabled) {
      transform: translate(-1px, -1px);
      box-shadow: calc(var(--lift) + 1px) calc(var(--lift) + 1px) 0 var(--shadow);
    }
    .key.plain:hover:not(:disabled) {
      transform: none;
      box-shadow: none;
      background: color-mix(in oklch, var(--text) 10%, transparent);
    }
  }
  .key:active:not(:disabled) {
    transform: translate(var(--lift), var(--lift));
    box-shadow: 0 0 0 var(--shadow);
    transition-duration: 0.04s;
  }
  .key.plain:active:not(:disabled) {
    transform: scale(0.94);
  }
  .key:disabled {
    opacity: 0.38;
    cursor: default;
  }
</style>
