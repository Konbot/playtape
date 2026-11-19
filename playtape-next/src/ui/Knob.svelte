<!-- The one knob of the app: a black cap with a coloured pointer, in a ring of
     tick marks that light up to show the value. The pointer colour says what
     kind of control it is (see --fn-* in tokens.css). Drag up and down; it
     clicks through 24 detents, sticks lightly at its default, and double-click
     returns it there. A real slider to assistive tech: arrow keys work. -->
<script lang="ts">
  import { engine } from '../audio/engine';
  import { app } from '../state.svelte';

  let {
    value, min, max, def, label, unit = '', size = 44, fn = 'plain',
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
    /** What kind of control this is; picks the pointer colour. */
    fn?: 'tone' | 'level' | 'fx' | 'pos' | 'plain';
    onstart?: () => void;
    oninput: (v: number) => void;
    onend?: () => void;
  } = $props();

  const DETENTS = 24;
  const frac = $derived((value - min) / (max - min));
  /* A knob that goes both ways (EQ, pan) lights its ticks from the middle. */
  const fracDef = $derived(min < 0 && max > 0 ? (def - min) / (max - min) : 0);
  const lit0 = $derived(Math.min(frac, fracDef) * 270);
  const lit1 = $derived(Math.max(frac, fracDef) * 270);
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
    class="knob {fn}"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={text}
    title="{label}: {text} (double-click to reset)"
    style:--size="{size}px"
    style:--lit0="{lit0}deg"
    style:--lit1="{lit1}deg"
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
    --c: var(--fn-pos);
    position: relative;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--knob);
    border: var(--line-w) solid var(--line);
    box-shadow: 2px 2px 0 var(--shadow);
    cursor: ns-resize;
    touch-action: none;
    flex: none;
  }
  .knob.tone { --c: var(--fn-tone); }
  .knob.level { --c: var(--fn-level); }
  .knob.fx { --c: var(--fn-fx); }
  .knob.pos { --c: var(--fn-pos); }
  /* the tick ring: 13 marks over 270 degrees, lit in the pointer colour up to the value */
  .knob::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 50%;
    background: conic-gradient(from -135deg, var(--knob-tick) 0 var(--lit0), var(--c) var(--lit0) var(--lit1), var(--knob-tick) var(--lit1) 270deg, transparent 270deg);
    -webkit-mask: repeating-conic-gradient(from -137deg, #000 0 4deg, transparent 4deg 22.5deg), radial-gradient(closest-side, transparent 72%, #000 73%);
    mask: repeating-conic-gradient(from -137deg, #000 0 4deg, transparent 4deg 22.5deg), radial-gradient(closest-side, transparent 72%, #000 73%);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
  }
  .cap {
    position: absolute;
    inset: 17%;
    border-radius: 50%;
    background: var(--knob-cap);
    border: 1.5px solid oklch(0 0 0 / 0.55);
    transform: rotate(var(--ang));
  }
  /* the pointer */
  .cap::after {
    content: '';
    position: absolute;
    top: -1px;
    left: 50%;
    width: 4px;
    height: 56%;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--c);
  }
  .knob:active {
    box-shadow: 0 0 0 var(--shadow);
    transform: translate(2px, 2px);
  }
  .lbl {
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    letter-spacing: 0.01em;
    text-transform: uppercase;
    color: var(--text-2);
    white-space: nowrap;
  }
</style>
