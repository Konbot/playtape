<!-- Settings: what you record with, how loud it may get, how it looks.
     (Input and "Enable input" used to sit in the main header.) -->
<script lang="ts">
  import { app, setCalm, setCatch, setTheme, type Theme } from '../state.svelte';
  import { install, pwa } from '../pwa.svelte';
  import { calibrate, closeSheet, openSheet, setCeiling, setChannel, setInput, setOffset, turnMicOn } from '../tools.svelte';
  import { recorder } from '../audio/recorder';
  import { onFrame } from '../lib/raf';
  import Fader from './Fader.svelte';
  import Key from './Key.svelte';
  import Seg from './Seg.svelte';
  import Sheet from './Sheet.svelte';
  import Switch from './Switch.svelte';

  const micOn = $derived(app.mic === 'ready' || app.mic === 'recording');
  const version = __APP_VERSION__;
  const single = __SINGLE_FILE__;
  let levelEl: HTMLElement | undefined = $state();
  let shown = 0;

  $effect(() =>
    onFrame(() => {
      // The dock meter is covered by this sheet, so it takes over reading the level.
      shown = Math.max(recorder.level, shown * 0.9);
      recorder.level = 0;
      if (levelEl) levelEl.style.transform = `scaleX(${Math.min(1, Math.sqrt(shown)).toFixed(3)})`;
    }),
  );
</script>

<Sheet title="Settings" onclose={closeSheet}>
  <section>
    <h3>Recording</h3>
    {#if !micOn}
      <div class="row">
        <div class="txt"><b>Microphone</b><span>It turns on the first time you record. Turn it on now to choose an input.</span></div>
        <Key size="sm" tone="blue" icon="microphone" onclick={() => void turnMicOn()} disabled={app.mic === 'starting'}>Turn on</Key>
      </div>
    {:else}
      <label class="row stack">
        <span class="txt"><b>Input</b></span>
        <select value={app.inputId} onchange={(e) => void setInput(e.currentTarget.value)} disabled={app.recording || app.calibrating}>
          <option value="">System default</option>
          {#each app.inputs as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
        </select>
        <span class="lvl" title="Input level"><i bind:this={levelEl}></i></span>
      </label>
      <div class="row stack">
        <div class="txt"><b>Which socket</b><span>An audio interface shows up as one input with two sockets.</span></div>
        <Seg label="Input socket" value={app.channel} onchange={setChannel} options={[{ value: 2, label: 'Both' }, { value: 0, label: 'Input 1' }, { value: 1, label: 'Input 2' }]} />
      </div>
    {/if}
    <div class="row">
      <div class="txt">
        <b>Timing offset</b>
        <span>{app.offsetMeasured ? 'Set for this input.' : 'An estimate.'} Takes are shifted earlier by this much so they line up with what you heard.</span>
      </div>
      <input class="num mono" type="number" min="-200" max="500" step="1" value={app.offsetMs} aria-label="Timing offset in milliseconds" onchange={(e) => setOffset(parseInt(e.currentTarget.value, 10))} />
      <span class="unit">ms</span>
    </div>
    <div class="row">
      <div class="txt"><b>Measure it</b><span>Plays eight clicks and listens for them. Speakers on, or hold a headphone to the mic.</span></div>
      <Key size="sm" onclick={() => void calibrate()} disabled={app.calibrating || app.recording}>{app.calibrating ? 'Listening…' : 'Calibrate'}</Key>
    </div>
    <div class="row">
      <div class="txt"><b>Catch that!</b><span>Keeps the last minute of mic input in memory (nowhere else), so you can keep what you just played.</span></div>
      <Switch on={app.catchOn} label="Catch that!" onchange={(v) => void setCatch(v)} />
    </div>
  </section>

  <section>
    <h3>Sound</h3>
    <div class="row stack">
      <div class="txt"><b>Loudness ceiling <span class="mono val">{Math.round(app.ceiling * 100)}%</span></b><span>The limiter is always on. Lower this and nothing can get louder than it, ever.</span></div>
      <Fader label="Loudness ceiling" value={app.ceiling} min={0.2} max={1} step={0.05} reset={1} oninput={setCeiling} />
    </div>
    <div class="row">
      <div class="txt"><b>Tuner</b><span>For a guitar, a bass, or your voice.</span></div>
      <Key size="sm" onclick={() => openSheet('tuner')}>Open</Key>
    </div>
  </section>

  <section>
    <h3>Look</h3>
    <div class="row stack">
      <div class="txt"><b>Theme</b></div>
      <Seg label="Theme" value={app.theme} onchange={(v: Theme) => setTheme(v)} options={[{ value: 'paper', label: 'Paper' }, { value: 'night', label: 'Night' }, { value: 'auto', label: 'Match device' }]} />
    </div>
    <div class="row">
      <div class="txt"><b>Calm mode</b><span>No motion, no pulsing, no knob clicks.</span></div>
      <Switch on={app.calm} label="Calm mode" onchange={setCalm} />
    </div>
  </section>

  <section>
    <h3>App</h3>
    {#if pwa.canInstall}
      <div class="row">
        <div class="txt"><b>Install PLAYTAPE</b><span>Puts it on your home screen or desktop and opens it without the browser bars.</span></div>
        <Key size="sm" tone="blue" onclick={() => void install()}>Install</Key>
      </div>
    {/if}
    <div class="row">
      <div class="txt">
        <b>Version {version}</b>
        <span>
          {pwa.installed ? 'Installed. ' : ''}{single ? 'Single-file build. ' : pwa.offlineReady ? 'Works offline. ' : ''}Your songs are kept in this browser, on this device. Use Share to keep copies elsewhere.
        </span>
      </div>
    </div>
  </section>
</Sheet>

<style>
  section + section {
    margin-top: var(--s-5);
  }
  h3 {
    font-size: var(--t-12);
    font-weight: var(--w-black);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-2);
    margin-bottom: var(--s-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) 0;
    border-top: var(--line-w) solid color-mix(in oklch, var(--line) 14%, transparent);
  }
  .row.stack {
    flex-wrap: wrap;
  }
  .row.stack > :global(:not(.txt):not(.lvl)) {
    flex: 1 1 100%;
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .txt b {
    font-weight: var(--w-bold);
  }
  .txt span {
    font-size: var(--t-12);
    color: var(--text-2);
  }
  .txt .val {
    font-size: var(--t-12);
    font-weight: 600;
  }
  select,
  .num {
    height: 40px;
    padding: 0 10px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    background: var(--surface);
    font-weight: var(--w-bold);
    min-width: 0;
  }
  .num {
    width: 76px;
    text-align: center;
  }
  .unit {
    font-size: var(--t-12);
    color: var(--text-2);
    margin-left: calc(var(--s-2) * -1);
  }
  .lvl {
    position: relative;
    flex: 1 1 100%;
    height: 8px;
    border-radius: 4px;
    background: color-mix(in oklch, var(--text) 14%, transparent);
    overflow: hidden;
  }
  .lvl i {
    position: absolute;
    inset: 0;
    background: var(--text);
    transform-origin: left;
    transform: scaleX(0);
  }
</style>
