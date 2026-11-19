<!-- An on/off switch. -->
<script lang="ts">
  let { on, label, onchange, disabled = false }: { on: boolean; label: string; onchange: (v: boolean) => void; disabled?: boolean } = $props();
</script>

<button class="switch" class:on role="switch" aria-checked={on} aria-label={label} {disabled} onclick={() => onchange(!on)}>
  <span class="nub"></span>
</button>

<style>
  .switch {
    position: relative;
    flex: none;
    width: 52px;
    height: 30px;
    padding: 0;
    border: var(--line-w) solid var(--line);
    border-radius: 99px;
    background: var(--surface);
    transition: background-color 0.15s;
  }
  .switch.on {
    background: var(--c, var(--blue));
  }
  .nub {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    transition: transform 0.25s var(--spring);
  }
  .switch.on .nub {
    transform: translateX(22px);
  }
  .switch:disabled {
    opacity: 0.45;
  }
</style>
