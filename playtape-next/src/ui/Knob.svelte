<!-- The one knob of the app. Drag up and down; it clicks through 24 detents,
     sticks lightly at its default, and double-click returns it there (the feel
     of the old knobEl). A real slider to assistive tech: arrow keys work. -->
<script lang="ts">
  import { engine } from '../audio/engine';
  import { app } from '../state.svelte';

  let {
    value, min, max, def, label, unit = '', size = 44,
    onstart, oninput, onend,
  }: {
    value: number;
    min: number;
    max: number;
    def: number;
    label: string;
    /** How the value reads, e.g. " dB". Use `format` semantics via aria only. */
    unit?: string;
    size?: number;
    onstart?: () => void;
    oninput: (v: number) => void;
    onend?: () => void;
  } = $props();

  const DETENTS = 24;
  const frac = $derived((value - min) / (max - min));
  const text = $derived(`${Math.abs(max - min) > 4 ? value.toFixed(1) : Math.round(value * 100) + (unit ? '' : '%')}${unit}`);

  let dragging = false;
  let sy = 0;
  let sv = 0;
  let lastDet = -1;

  function apply(v: number) {
    if (Math.abs(v - def) < (max - min) * 0.02) v = def; // magnetic default
    v = Math.max(min, Math.min(max, v));
    const det = Math.round(((v - min) / (max - min)) * DETENTS);
    if (det !== lastDet) { lastDet = det; if (!app.calm) engine.tick(); }
    oninput(v);
  }

  function down(e: PointerEvent) {
    if (e.button > 0) return;
    dragging = true;
    sy = e.clientY;
    sv = value;
    lastDet = Math.round(frac * DETENTS);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
    onstart?.();
  }
  function move(e: PointerEvent) {
    if (dragging) apply(sv - ((e.clientY - sy) / 160) * (max - min));
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    onend?.();
  }
  function nudge(dir: number) {
    onstart?.();
    apply(value + (dir * (max - min)) / DETENTS);
    onend?.();
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); nudge(1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); nudge(-1); }
    else if (e.key === 'Home') { e.preventDefault(); onstart?.(); oninput(min); onend?.(); }
    else if (e.key === 'End') { e.preventDefault(); onstart?.(); oninput(max); onend?.(); }
  }
  function reset() {
    onstart?.();
    oninput(def);
    onend?.();
    if (!app.calm) engine.tick();
  }
</script>

<div class="knobwrap">
  <div
    class="knob"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={text}
    title="{label}: {text} (double-click to reset)"
    style:--size="{size}px"
    style:--fill="{frac * 270}deg"
    style:--ang="{-135 + frac * 270}deg"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    ondblclick={reset}
    onkeydown={key}
  >
    <span class="cap"></span>
  </div>
  <span class="lbl">{label}</span>
</div>

<style>
  .knobwrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }
  .knob {
    position: relative;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    /* value arc: starts bottom-left, sweeps 270° */
    background: conic-gradient(from -135deg, var(--c, var(--blue)) 0 var(--fill), color-mix(in oklch, var(--text) 16%, transparent) var(--fill) 270deg, transparent 270deg);
    cursor: ns-resize;
    touch-action: none;
    flex: none;
  }
  .cap {
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    box-shadow: 2px 2px 0 var(--shadow);
    transform: rotate(var(--ang));
  }
  .cap::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 50%;
    width: 3px;
    height: 34%;
    margin-left: -1.5px;
    border-radius: 2px;
    background: var(--text);
  }
  .knob:active .cap {
    box-shadow: 0 0 0 var(--shadow);
  }
  .lbl {
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    color: var(--text-2);
    white-space: nowrap;
  }
</style>
