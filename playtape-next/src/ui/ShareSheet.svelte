<!-- One place to get the song out: a mix to send to someone, stems for a
     proper mix elsewhere, or the whole project. Replaces Bounce, Export stems
     and the format dropdown. -->
<script lang="ts">
  import { app, fmtDuration } from '../state.svelte';
  import { canShareFiles, closeSheet, exportMix, exportProject, exportStems, type Delivery } from '../tools.svelte';
  import { audible, songDuration } from '../model/types';
  import Icon from './Icon.svelte';
  import Key from './Key.svelte';
  import Sheet from './Sheet.svelte';

  const song = $derived(app.song!);
  const share = canShareFiles();
  const dur = $derived(songDuration(song));
  const muted = $derived(song.tracks.filter((t) => t.clips.length && !audible(song, t)).length);
  const busy = $derived(!!app.exporting);

  const rows: { id: string; title: string; note: string; run: (how: Delivery) => void }[] = [
    { id: 'mp3', title: 'MP3', note: 'Small. Best for sending the idea to someone.', run: (h) => void exportMix('mp3', h) },
    { id: 'wav', title: 'WAV', note: 'Full quality mix.', run: (h) => void exportMix('wav', h) },
    { id: 'stems', title: 'Stems', note: 'Each track as its own WAV, in one zip, for mixing elsewhere.', run: (h) => void exportStems(h) },
    { id: 'tape', title: 'Project file', note: 'Everything in one .tape file. Opens here and in TAPE.', run: (h) => void exportProject(h) },
  ];
</script>

<Sheet title="Share" onclose={closeSheet}>
  <p class="about">
    <b>{song.name}</b> · <span class="mono">{fmtDuration(dur)}</span>
    {#if muted}<br /><span class="warn"><Icon name="warning" size={14} /> {muted} muted {muted === 1 ? 'track is' : 'tracks are'} left out of the mix.</span>{/if}
  </p>

  <ul>
    {#each rows as r (r.id)}
      <li>
        <div class="txt"><b>{r.title}</b><span>{r.note}</span></div>
        {#if share}<Key size="sm" tone="blue" onclick={() => r.run('share')} disabled={busy} label="Share {r.title}">Share</Key>{/if}
        <Key size="sm" tone={share ? 'surface' : 'blue'} onclick={() => r.run('save')} disabled={busy} label="Save {r.title}">Save</Key>
      </li>
    {/each}
  </ul>

  {#if app.exporting}
    <div class="progress" role="status" aria-live="polite">
      <span>{app.exporting.label}</span>
      <div class="bar"><i style:width="{Math.round(app.exporting.progress * 100)}%"></i></div>
    </div>
  {/if}
</Sheet>

<style>
  .about {
    font-size: var(--t-14);
    margin-bottom: var(--s-3);
  }
  .warn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-2);
    font-size: var(--t-12);
    font-weight: var(--w-bold);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3);
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .txt b {
    font-weight: var(--w-black);
  }
  .txt span {
    font-size: var(--t-12);
    color: var(--text-2);
  }
  .progress {
    margin-top: var(--s-4);
    font-size: var(--t-14);
    font-weight: var(--w-bold);
  }
  .bar {
    height: 14px;
    margin-top: 6px;
    border: var(--line-w) solid var(--line);
    border-radius: 99px;
    background: var(--surface);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--blue);
    transition: width 0.15s linear;
  }
</style>
