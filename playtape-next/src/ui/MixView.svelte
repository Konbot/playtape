<!-- Mix view. Desktop: full-height channel strips. Phone: one compact row per
     track that opens to show its knobs. Same controls in both, one knob and
     one fader component, plain words on the labels. -->
<script lang="ts">
  import { app, beginEdit, endEdit, liveEdit, mutate } from '../state.svelte';
  import { setReverb } from '../tools.svelte';
  import { engine, meterLevel } from '../audio/engine';
  import { transport } from '../audio/transport';
  import { onFrame } from '../lib/raf';
  import type { ReverbType, Track, TrackParams } from '../model/types';
  import Fader from './Fader.svelte';
  import Key from './Key.svelte';
  import Knob from './Knob.svelte';
  import Overview from './Overview.svelte';
  import Seg from './Seg.svelte';

  const song = $derived(app.song!);
  let winW = $state(window.innerWidth);
  const narrow = $derived(winW < 700);
  /** Phone: which track's details are open. */
  let open = $state<number | null>(null);

  const meterEls = new Map<number | 'master', HTMLElement>();
  function meter(node: HTMLElement, id: number | 'master') {
    meterEls.set(id, node);
    return { destroy: () => { if (meterEls.get(id) === node) meterEls.delete(id); } };
  }
  $effect(() =>
    onFrame(() => {
      for (const [id, el] of meterEls) {
        const an = id === 'master' ? engine.masterAnalyser : engine.chains.get(id)?.analyser;
        el.style.setProperty('--lvl', (transport.playing ? meterLevel(an) : 0).toFixed(3));
      }
    }),
  );

  const db = (v: number) => (v <= 0.001 ? '-∞' : `${v >= 1 ? '+' : ''}${(20 * Math.log10(v)).toFixed(1)}`);
  const LOWCUTS = [0, 80, 100, 120];
  const ROOMS: { value: ReverbType; label: string }[] = [
    { value: 'room', label: 'Room' }, { value: 'hall', label: 'Hall' }, { value: 'plate', label: 'Plate' }, { value: 'spring', label: 'Spring' },
  ];

  function toggle(t: Track, key: 'mute' | 'solo') {
    mutate(`${t[key] ? 'Un' : ''}${key} ${t.name}`, () => { t[key] = !t[key]; }, { replan: false });
  }
  function set(t: Track, key: keyof TrackParams, v: number) {
    (t as unknown as Record<string, number>)[key] = v;
    liveEdit();
  }
  function cycleLowcut(t: Track) {
    mutate(`Trim lows on ${t.name}`, () => { t.lowcut = LOWCUTS[(LOWCUTS.indexOf(t.lowcut) + 1) % LOWCUTS.length]; }, { replan: false });
  }
  const fxOn = (t: Track) => t.driveOn || t.delayOn || t.tremOn || t.cab !== 'off';
  function togglePedals(t: Track) { app.fxTrack = app.fxTrack === t.id ? null : t.id; }
</script>

<svelte:window bind:innerWidth={winW} />

{#snippet k(t: Track, key: keyof TrackParams, label: string, min: number, max: number, def: number, unit: string, size: number, fn: 'tone' | 'level' | 'fx' | 'pos')}
  <Knob
    {label} {min} {max} {def} {unit} {size} {fn}
    value={t[key] as number}
    onstart={() => beginEdit(`${label} on ${t.name}`)}
    oninput={(v) => set(t, key, v)}
    onend={() => endEdit(false)}
  />
{/snippet}

{#snippet knobs(t: Track, size: number)}
  <!-- pointer colours: orange shapes the tone, pink is loudness, cyan is space, white is position -->
  <div class="knobs">
    {@render k(t, 'eqHi', 'High', -12, 12, 0, ' dB', size, 'tone')}
    {@render k(t, 'eqMid', 'Mid', -12, 12, 0, ' dB', size, 'tone')}
    {@render k(t, 'eqLo', 'Low', -12, 12, 0, ' dB', size, 'tone')}
  </div>
  <div class="knobs">
    {@render k(t, 'squeeze', 'Tighten', 0, 1, 0, '', size, 'level')}
    {@render k(t, 'verb', 'Reverb', 0, 1, 0, '', size, 'fx')}
    {@render k(t, 'pan', 'Pan', -1, 1, 0, '', size, 'pos')}
  </div>
{/snippet}

{#snippet extras(t: Track)}
  <button class="chip" class:on={t.lowcut > 0} onclick={() => cycleLowcut(t)} title="Cuts rumble below this frequency. Click to step through Off, 80, 100, 120 Hz.">
    Trim lows <b class="mono">{t.lowcut ? `${t.lowcut} Hz` : 'Off'}</b>
  </button>
  <button class="chip" class:on={app.fxTrack === t.id} aria-pressed={app.fxTrack === t.id} onclick={() => togglePedals(t)}>
    Pedals <span class="led" class:lit={fxOn(t)} style:--led="var(--led-amber)" title={fxOn(t) ? 'A pedal is on' : 'All pedals are off'}></span>
  </button>
{/snippet}

<div class="mix" class:narrow>
  <Overview />

  {#if !song.tracks.length}
    <p class="empty"><b>Nothing to mix yet.</b><br />Record something in Capture first.</p>
  {:else if narrow}
    <div class="rows">
      {#each song.tracks as t, i (t.id)}
        <section class="card" style:--c="var(--tc-{t.color % 8})" class:muted={t.mute}>
          <div class="who">
            <span class="num mono">{i + 1}</span>
            <span class="namebox"><span class="tape name" style:--tilt="{i % 2 ? 0.8 : -1}deg">{t.name}</span></span>
            <span class="val mono">{db(t.vol)} dB</span>
            <Key size="sm" tone="plain" icon={open === t.id ? 'minus' : 'faders'} label={open === t.id ? `Hide controls for ${t.name}` : `Show controls for ${t.name}`} onclick={() => (open = open === t.id ? null : t.id)} />
          </div>
          <div class="ctl">
            <Key size="sm" label="Mute {t.name}" pressed={t.mute} onclick={() => toggle(t, 'mute')}>M</Key>
            <Key size="sm" label="Solo {t.name}" pressed={t.solo} onclick={() => toggle(t, 'solo')}>S</Key>
            <div class="fade">
              <Fader label="{t.name} level" value={t.vol} max={1.4} reset={1} onstart={() => beginEdit(`Level of ${t.name}`)} oninput={(v) => set(t, 'vol', v)} onend={() => endEdit(false)} />
              <div class="hmeter" use:meter={t.id}><i></i></div>
            </div>
          </div>
          {#if open === t.id}
            <div class="more">
              {@render knobs(t, 48)}
              <div class="chips">{@render extras(t)}</div>
              <label class="shift">
                <span>Shift timing <b class="mono">{Math.round(t.nudge * 1000)} ms</b></span>
                <Fader label="Shift timing of {t.name}" value={t.nudge} min={-0.2} max={0.2} step={0.005} reset={0} onstart={() => beginEdit(`Shift timing of ${t.name}`)} oninput={(v) => { t.nudge = v; }} onend={() => endEdit(true)} />
              </label>
            </div>
          {/if}
        </section>
      {/each}

      <section class="card master">
        <div class="who">
          <span class="num mono">M</span>
          <span class="name">Master</span>
          <span class="val mono">{db(song.masterVol)} dB</span>
        </div>
        <div class="ctl">
          <div class="fade">
            <Fader label="Master level" value={song.masterVol} max={1.3} reset={0.9} onstart={() => beginEdit('Master level')} oninput={(v) => { song.masterVol = v; liveEdit(); }} onend={() => endEdit(false)} />
            <div class="hmeter" use:meter={'master'}><i></i></div>
          </div>
        </div>
        <div class="room"><span>Reverb room</span><Seg size="sm" label="Reverb room" options={ROOMS} value={song.reverbType} onchange={setReverb} /></div>
        <p class="note"><span class="led lit"></span>The limiter is always on: nothing leaves louder than the ceiling.</p>
      </section>
    </div>
  {:else}
    <div class="strips">
      {#each song.tracks as t, i (t.id)}
        <section class="strip" style:--c="var(--tc-{t.color % 8})" class:muted={t.mute}>
          <div class="who">
            <span class="num mono">{i + 1}</span>
            <span class="namebox"><span class="tape name" title={t.name} style:--tilt="{i % 2 ? 0.8 : -1}deg">{t.name}</span></span>
          </div>
          <div class="ms">
            <Key size="sm" label="Mute {t.name}" pressed={t.mute} onclick={() => toggle(t, 'mute')}>M</Key>
            <Key size="sm" label="Solo {t.name}" pressed={t.solo} onclick={() => toggle(t, 'solo')}>S</Key>
          </div>
          {@render knobs(t, 44)}
          <div class="chips">{@render extras(t)}</div>
          <div class="fz" style:--unity="{(1 / 1.4) * 100}%">
            <div class="vmeter" use:meter={t.id}><i></i></div>
            <Fader vertical label="{t.name} level" value={t.vol} max={1.4} reset={1} onstart={() => beginEdit(`Level of ${t.name}`)} oninput={(v) => set(t, 'vol', v)} onend={() => endEdit(false)} />
          </div>
          <span class="val mono">{db(t.vol)} dB</span>
        </section>
      {/each}

      <section class="strip master">
        <div class="who">
          <span class="num mono">M</span>
          <span class="name">Master</span>
        </div>
        <div class="room"><span>Reverb room</span><Seg size="sm" label="Reverb room" options={ROOMS} value={song.reverbType} onchange={setReverb} /></div>
        <p class="note silk"><span class="led lit"></span>Limiter always on</p>
        <div class="fz" style:--unity="{(0.9 / 1.3) * 100}%">
          <div class="vmeter" use:meter={'master'}><i></i></div>
          <Fader vertical label="Master level" value={song.masterVol} max={1.3} reset={0.9} onstart={() => beginEdit('Master level')} oninput={(v) => { song.masterVol = v; liveEdit(); }} onend={() => endEdit(false)} />
        </div>
        <span class="val mono">{db(song.masterVol)} dB</span>
      </section>
    </div>
  {/if}
</div>

<style>
  .mix {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    background: var(--bg-sunk);
  }
  .empty {
    margin: var(--s-7) auto;
    text-align: center;
    color: var(--text-2);
  }
  .empty b {
    font-size: var(--t-20);
    font-weight: var(--w-black);
    color: var(--text);
  }

  /* ---- shared bits ---- */
  .who {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
  }
  /* the channel number, printed on the panel */
  .num {
    flex: none;
    min-width: 1ch;
    font-size: var(--t-20);
    font-weight: 700;
    line-height: 1;
    color: var(--text);
  }
  /* the track's name on a strip of tape in the track's colour */
  .namebox {
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .name {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .master .name {
    flex: 1;
    font-weight: var(--w-black);
    font-size: var(--t-14);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .val {
    font-size: var(--t-12);
    color: var(--text-2);
    white-space: nowrap;
  }
  /* a muted track's tape loses its colour: grey means silent */
  .muted .name {
    filter: grayscale(1);
  }
  .knobs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--s-2) 2px;
    justify-items: center;
  }
  /* an engraved groove between the tone knobs and the rest */
  .knobs + .knobs {
    padding-top: var(--s-3);
    border-top: 1px solid var(--groove-d);
    box-shadow: inset 0 1px 0 var(--groove-l);
  }
  .chips {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    background: var(--bg);
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    white-space: nowrap;
  }
  .chip:hover {
    background: color-mix(in oklch, var(--bg), var(--blue) 12%);
  }
  .chip.on {
    background: var(--text);
    color: var(--bg);
  }
  .chip b {
    font-weight: 700;
  }
  /* Mute goes dark, Solo gets the spotlight. */
  .mix :global(.key[aria-label^='Mute'].on) {
    --fill: var(--text);
    --ink: var(--bg);
  }
  .mix :global(.key[aria-label^='Solo'].on) {
    --fill: var(--tc-4);
    --ink: var(--on-track);
  }
  .room :global(.seg button) {
    padding: 0 4px;
  }
  .room {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    color: var(--text-2);
  }
  .note {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: var(--t-12);
    color: var(--text-2);
  }
  .note .led {
    align-self: flex-start;
    margin-top: 3px;
  }
  .note.silk .led {
    align-self: center;
    margin-top: 0;
  }

  /* ---- desktop strips ---- */
  /* The channel strips sit side by side as one console panel. */
  .strips {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 0;
    overflow: auto;
    padding: 0 4px 6px 0;
  }
  .strip {
    flex: none;
    width: 190px;
    min-height: 452px;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-3);
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    border-top: 8px solid var(--c, var(--text));
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
    /* an ink line under the coloured cap */
    background-image: linear-gradient(var(--line), var(--line));
    background-size: 100% 2px;
    background-repeat: no-repeat;
  }
  .strip + .strip {
    margin-left: calc(-1 * var(--line-w));
  }
  .strip:first-child {
    border-radius: var(--r-md) 0 0 var(--r-md);
  }
  .strip:nth-last-child(2) {
    border-radius: 0 var(--r-md) var(--r-md) 0;
  }
  .strip:first-child:nth-last-child(2) {
    border-radius: var(--r-md);
  }
  .strip.master {
    width: 216px;
    margin-left: auto;
    position: sticky;
    right: 0;
    border-radius: var(--r-md);
  }
  .strip .who {
    min-height: 30px;
  }
  .ms {
    display: flex;
    gap: 6px;
  }
  .ms :global(.key) {
    flex: 1;
  }
  /* level is pink wherever it appears */
  .fz,
  .fade {
    --c: var(--fn-level);
  }
  .shift {
    --c: var(--fn-pos);
  }
  .fz {
    flex: 1;
    min-height: 120px;
    display: flex;
    justify-content: center;
    gap: var(--s-2);
  }
  /* the scale printed beside the fader, with a longer mark at 0 dB */
  .fz::after {
    content: '';
    width: 9px;
    margin-block: 10px;
    border-top: 1px solid var(--text-2);
    background:
      linear-gradient(to top, transparent calc(var(--unity) - 1px), var(--text) calc(var(--unity) - 1px) calc(var(--unity) + 1px), transparent calc(var(--unity) + 1px)),
      repeating-linear-gradient(to top, var(--text-2) 0 1px, transparent 1px 10%) left / 5px 100% no-repeat;
  }
  .strip > .val {
    text-align: center;
  }
  /* LED meters: green is fine, amber is hot, tomato is too loud */
  .vmeter {
    position: relative;
    width: 9px;
    margin-block: 10px;
    border-radius: 2px;
    background: var(--knob);
    overflow: hidden;
  }
  .vmeter i {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, var(--led-green) 0 70%, var(--led-amber) 70% 90%, var(--tomato) 90%);
    -webkit-mask: repeating-linear-gradient(to top, #000 0 4px, transparent 4px 6px);
    mask: repeating-linear-gradient(to top, #000 0 4px, transparent 4px 6px);
    clip-path: inset(calc((1 - var(--lvl, 0)) * 100%) 0 0 0);
  }

  /* ---- phone rows ---- */
  .rows {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: 0 4px 6px 0;
  }
  .card {
    padding: var(--s-2) var(--s-3) var(--s-3);
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    border-left: 8px solid var(--c, var(--text));
    border-radius: var(--r-md);
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .fade {
    position: relative;
    flex: 1;
    min-width: 0;
    padding-left: var(--s-2);
  }
  .hmeter {
    position: absolute;
    left: var(--s-2);
    right: 0;
    bottom: 1px;
    height: 5px;
    border-radius: 2px;
    background: var(--knob);
    overflow: hidden;
  }
  .hmeter i {
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, var(--led-green) 0 70%, var(--led-amber) 70% 90%, var(--tomato) 90%);
    -webkit-mask: repeating-linear-gradient(to right, #000 0 4px, transparent 4px 6px);
    mask: repeating-linear-gradient(to right, #000 0 4px, transparent 4px 6px);
    clip-path: inset(0 calc((1 - var(--lvl, 0)) * 100%) 0 0);
  }
  .more {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    margin-top: var(--s-3);
    padding-top: var(--s-3);
    border-top: var(--line-w) dashed color-mix(in oklch, var(--line) 35%, transparent);
  }
  .more .chips {
    flex-direction: row;
  }
  .more .chip {
    flex: 1;
    height: 40px;
  }
  .shift {
    display: flex;
    flex-direction: column;
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    color: var(--text-2);
  }
  .card .room {
    margin-top: var(--s-2);
  }
  .card .note {
    margin-top: var(--s-2);
  }
  .mix.narrow {
    padding: var(--s-3);
  }
</style>
