<!-- A fader on a native range input, so it is keyboard and screen-reader
     operable for free. Horizontal by default, vertical for channel strips.
     One undo step per drag. -->
<script lang="ts">
  let {
    value,
    min = 0,
    max = 1,
    step = 0.01,
    label,
    vertical = false,
    onstart,
    oninput,
    onend,
    reset,
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    vertical?: boolean;
    onstart?: () => void;
    oninput: (v: number) => void;
    onend?: () => void;
    /** Double-click returns to this value. */
    reset?: number;
  } = $props();

  let active = false;
  const pct = $derived(((value - min) / (max - min)) * 100);

  function begin() { if (!active) { active = true; onstart?.(); } }
  function end() { if (active) { active = false; onend?.(); } }
</script>

<input
  class="fader"
  class:vertical
  type="range"
  {min}
  {max}
  {step}
  {value}
  aria-label={label}
  aria-orientation={vertical ? 'vertical' : undefined}
  style:--p="{pct}%"
  onpointerdown={begin}
  onkeydown={(e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) begin(); }}
  oninput={(e) => { begin(); oninput(parseFloat(e.currentTarget.value)); }}
  onchange={end}
  onblur={end}
  ondblclick={() => { if (reset !== undefined) { onstart?.(); oninput(reset); onend?.(); } }}
/>

<style>
  .fader {
    --dir: 90deg;
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 44px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    touch-action: pan-y;
  }
  .fader.vertical {
    --dir: 0deg;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 44px;
    height: 100%;
    min-height: 80px;
    touch-action: pan-x;
  }
  .fader::-webkit-slider-runnable-track {
    height: 12px;
    border: var(--line-w) solid var(--line);
    border-radius: 99px;
    background: linear-gradient(var(--dir), var(--c, var(--blue)) var(--p), var(--surface) var(--p));
  }
  .fader.vertical::-webkit-slider-runnable-track {
    width: 12px;
    height: auto;
  }
  .fader::-moz-range-track {
    height: 8px;
    border: var(--line-w) solid var(--line);
    border-radius: 99px;
    background: linear-gradient(var(--dir), var(--c, var(--blue)) var(--p), var(--surface) var(--p));
  }
  .fader.vertical::-moz-range-track {
    width: 8px;
    height: 100%;
  }
  .fader::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 26px;
    height: 26px;
    margin-top: -9px;
    border-radius: 50%;
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    box-shadow: 2px 2px 0 var(--shadow);
  }
  .fader.vertical::-webkit-slider-thumb {
    margin-top: 0;
    margin-right: -9px;
    width: 30px;
    height: 20px;
    border-radius: 7px;
  }
  .fader::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    box-shadow: 2px 2px 0 var(--shadow);
  }
  .fader.vertical::-moz-range-thumb {
    width: 26px;
    height: 16px;
    border-radius: 7px;
  }
  .fader:active::-webkit-slider-thumb {
    box-shadow: 0 0 0 var(--shadow);
    transform: translate(2px, 2px);
  }
</style>
