<!-- A song, drawn as a cassette: its colour, its name on the label and its
     waveform printed along the label's edge. -->
<script lang="ts">
  let {
    name,
    color = 0,
    peaks = [],
    spinning = false,
    blank = false,
    exported = false,
  }: { name: string; color?: number; peaks?: number[]; spinning?: boolean; blank?: boolean; exported?: boolean } = $props();

  /* Scaled to the loudest moment so a quiet song still shows its shape. */
  const top = $derived(Math.max(0.05, ...peaks));
  const bars = $derived(peaks.map((p) => p / top));
</script>

{#snippet reel()}
  <svg class="reel" class:spinning viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="14" />
    <g>
      {#each [0, 60, 120, 180, 240, 300] as a}
        <rect x="15" y="4.5" width="2" height="5.5" rx="1" transform="rotate({a} 16 16)" />
      {/each}
    </g>
    <circle class="hub" cx="16" cy="16" r="3.5" />
  </svg>
{/snippet}

<div class="wrap">
<div class="cassette" class:blank style:--c="var(--tc-{color % 8})" style:--c2="var(--tc-{(color + 3) % 8})">
  <div class="label">
    <span class="stripe"></span>
    <span class="title">{name}</span>
    {#if bars.length}
      <svg class="wave" viewBox="0 0 {bars.length * 4} 16" preserveAspectRatio="none" aria-hidden="true">
        {#each bars as p, i}
          {@const h = Math.max(1.5, p * 15)}
          <rect x={i * 4 + 0.5} y={8 - h / 2} width="3" height={h} rx="1.5" />
        {/each}
      </svg>
    {/if}
  </div>
  <div class="window">
    {@render reel()}
    <span class="tape"></span>
    {@render reel()}
  </div>
  <div class="foot"><i></i><i></i></div>
  {#if exported}<span class="sticker" title="Finished: this song has been exported">✓</span>{/if}
</div>
</div>

<style>
  /* cqw units resolve against an ancestor container, so the cassette sizes itself by this wrapper */
  .wrap {
    width: 100%;
    container-type: inline-size;
  }
  .cassette {
    position: relative;
    width: 100%;
    aspect-ratio: 1.58;
    padding: 5cqw 5cqw 0;
    background: var(--c);
    border: var(--line-w) solid var(--line);
    border-radius: 6cqw;
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--on-track);
  }
  .label {
    position: relative;
    width: 100%;
    flex: 1 1 0;
    min-height: 0;
    padding: 6cqw 5cqw 2cqw;
    background: oklch(0.99 0.008 85);
    border: var(--line-w) solid var(--line);
    border-radius: 3cqw;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .stripe {
    position: absolute;
    inset: 0 0 auto 0;
    height: 3.2cqw;
    background: var(--c2);
    border-bottom: var(--line-w) solid var(--line);
  }
  /* written on the label by hand */
  .title {
    font-family: var(--font-hand);
    font-weight: 400;
    font-size: clamp(12px, 6.4cqw, 22px);
    line-height: 1.15;
    letter-spacing: 0.01em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-wrap: balance;
  }
  .wave {
    width: 100%;
    height: 7cqw;
    fill: var(--on-track);
    opacity: 0.85;
    flex: none;
  }
  .window {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2cqw;
    width: 62%;
    margin: 3.5cqw 0 0;
    padding: 1.6cqw 2.4cqw;
    background: var(--on-track);
    border-radius: 99px;
  }
  .reel {
    width: 11cqw;
    height: 11cqw;
    flex: none;
  }
  .reel circle {
    fill: oklch(0.99 0.008 85);
  }
  .reel g,
  .reel .hub {
    fill: var(--on-track);
  }
  .reel.spinning {
    animation: spin 1.6s linear infinite;
  }
  .tape {
    flex: 1;
    height: 3cqw;
    border-radius: 99px;
    background: color-mix(in oklch, var(--c) 70%, black);
  }
  .foot {
    flex: none;
    display: flex;
    justify-content: space-between;
    width: 44%;
    height: 5.5cqw;
    margin-top: 2.6cqw;
    padding: 0 6cqw;
    border: var(--line-w) solid var(--line);
    border-bottom: 0;
    border-radius: 2.4cqw 2.4cqw 0 0;
    background: color-mix(in oklch, var(--c) 80%, black);
    align-items: center;
  }
  .foot i {
    width: 2.2cqw;
    height: 2.2cqw;
    border-radius: 50%;
    background: var(--on-track);
  }
  /* the only reward in the app: a song that got exported earns a sticker */
  .sticker {
    position: absolute;
    right: 4cqw;
    bottom: 3cqw;
    display: grid;
    place-items: center;
    width: 13cqw;
    height: 13cqw;
    font-size: 7cqw;
    font-weight: 800;
    line-height: 1;
    color: var(--on-track);
    background: var(--tc-4);
    border: var(--line-w) solid var(--line);
    border-radius: 50%;
    transform: rotate(-12deg);
  }
  .blank .label {
    background: transparent;
    border-style: dashed;
  }
  .blank .stripe {
    display: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
