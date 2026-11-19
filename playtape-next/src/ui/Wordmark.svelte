<!-- The hand-lettered PLAYTAPE wordmark on its blue badge. -->
<script lang="ts">
  import wordmark from '../assets/wordmark.svg?raw';

  let { height = 28 }: { height?: number } = $props();
</script>

<span class="badge" style:--h="{height}px" role="img" aria-label="PLAYTAPE">{@html wordmark}</span>

<style>
  .badge {
    display: inline-flex;
    padding: calc(var(--h) * 0.32) calc(var(--h) * 0.5);
    background: var(--brand);
    border: var(--line-w) solid var(--line);
    border-radius: calc(var(--h) * 0.5);
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
    transform: rotate(-2deg);
  }
  .badge :global(svg) {
    display: block;
    height: var(--h);
    width: auto;
  }
</style>
