<!-- A segmented choice: one of a few options, all visible. -->
<script lang="ts" generics="T extends string | number">
  let {
    options, value, label, onchange, size = 'md', disabled = false,
  }: {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    onchange: (v: T) => void;
    size?: 'sm' | 'md';
    disabled?: boolean;
  } = $props();
</script>

<div class="seg {size}" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button role="radio" aria-checked={value === o.value} {disabled} onclick={() => { if (value !== o.value) onchange(o.value); }}>{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    max-width: 100%;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    background: var(--surface);
  }
  button {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    font-size: var(--t-14);
    font-weight: var(--w-bold);
    white-space: nowrap;
  }
  .sm button {
    height: 30px;
    padding: 0 8px;
    font-size: var(--t-12);
  }
  button[aria-checked='true'] {
    background: var(--text);
    color: var(--bg);
  }
  button:not([aria-checked='true']):hover:not(:disabled) {
    background: color-mix(in oklch, var(--text) 10%, transparent);
  }
  button:disabled {
    opacity: 0.45;
  }
  @media (pointer: coarse) {
    button {
      height: 40px;
    }
    .sm button {
      height: 36px;
    }
  }
</style>
