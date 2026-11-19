<script lang="ts">
  import { icons, type IconName } from './icons';

  let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<span class="icon" style:--size="{size}px" aria-hidden="true">{@html icons[name]}</span>

<style>
  .icon {
    display: inline-flex;
    width: var(--size);
    height: var(--size);
    flex: none;
  }
  .icon :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
