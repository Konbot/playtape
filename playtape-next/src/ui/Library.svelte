<!-- Home: one giant Record key, then every song as a cassette. No file menu,
     no save dialog, no folder picker. -->
<script lang="ts">
  import { app, deleteSong, fmtDuration, importFiles, newEmptySong, openSong, recordNewIdea, renameSongInLibrary } from '../state.svelte';
  import type { SongMeta } from '../model/types';
  import Cassette from './Cassette.svelte';
  import Icon from './Icon.svelte';
  import Key from './Key.svelte';
  import Menu from './Menu.svelte';
  import { canPickFolders, dismissOld, importOldFolder, importOldRecent, importOldSnapshot, openSheet } from '../tools.svelte';
  import Wordmark from './Wordmark.svelte';

  let fileInput: HTMLInputElement | undefined = $state();
  let renaming = $state<string | null>(null);
  let winW = $state(window.innerWidth);
  const folders = canPickFolders();
  const day = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  function when(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  function commitRename(m: SongMeta, e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    renaming = null;
    void renameSongInLibrary(m, v);
  }

  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<svelte:window bind:innerWidth={winW} />

<main class="library">
  <section class="stage">
    <header>
      <Wordmark height={30} />
      <div class="tools">
        <Key icon="plus" label="New empty song (start with Keys or Drums)" onclick={() => void newEmptySong()} disabled={app.busy}><span class="wide">New</span></Key>
        {#if folders}
          <Menu
            icon="upload"
            tone="surface"
            label="Import"
            text={winW >= 520 ? 'Import' : undefined}
            items={[
              { label: 'A .tape or audio file', icon: 'upload', run: () => fileInput?.click() },
              { label: 'A TAPE or PLAYTAPE project folder', icon: 'stack', run: () => void importOldFolder() },
            ]}
          />
        {:else}
          <Key icon="upload" label="Import a .tape or audio file" onclick={() => fileInput?.click()}><span class="wide">Import</span></Key>
        {/if}
        <Key icon="gear" label="Settings" onclick={() => openSheet('settings')} />
      </div>
    </header>

    <button class="rec" onclick={() => void recordNewIdea()} disabled={app.busy}>
      <span class="dot"><Icon name="microphone" size={34} /></span>
      <span class="words">
        <b>Record new idea</b>
        <small>One tap. It names and saves itself.</small>
      </span>
      <kbd class="mono">R</kbd>
    </button>
  </section>

  {#if app.old.snapshot != null || app.old.recents.length}
    <section class="old" aria-label="From the old app on this device">
      <h2>From the old app on this device</h2>
      <ul>
        {#if app.old.snapshot != null}
          <li>
            <div class="txt"><b>Unsaved session</b><span>Backed up {day(app.old.snapshot)}</span></div>
            <Key size="sm" tone="blue" onclick={() => void importOldSnapshot()} disabled={app.busy}>Import</Key>
            <Key size="sm" tone="plain" icon="close" label="Do not offer the unsaved session again" onclick={() => dismissOld('snapshot')} />
          </li>
        {/if}
        {#each app.old.recents as r (r.name)}
          <li>
            <div class="txt"><b>{r.name}</b><span>Project folder · last opened {day(r.when)}</span></div>
            <Key size="sm" tone="blue" onclick={() => void importOldRecent(r.name)} disabled={app.busy}>Import</Key>
            <Key size="sm" tone="plain" icon="close" label="Do not offer {r.name} again" onclick={() => dismissOld('folder', r.name)} />
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="shelf" aria-label="Your tapes">
    {#if app.library.length}
      <h2>Your tapes <span class="count mono">{app.library.length}</span></h2>
      <div class="grid">
        {#each app.library as m (m.id)}
          <article class="card">
            <button class="open" onclick={() => void openSong(m.id)} aria-label="Open {m.name}" disabled={app.busy}>
              <Cassette name={m.name} color={m.color} peaks={m.peaks} exported={!!m.exported} />
            </button>
            <div class="meta">
              <div class="txt">
                {#if renaming === m.id}
                  <input
                    class="rename"
                    value={m.name}
                    aria-label="Song name"
                    use:focusSelect
                    onblur={(e) => commitRename(m, e)}
                    onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') renaming = null; }}
                  />
                {:else}
                  <div class="name">{m.name}</div>
                {/if}
                <div class="sub mono">{fmtDuration(m.duration)} · {m.trackCount} {m.trackCount === 1 ? 'track' : 'tracks'} · {when(m.modified)}</div>
              </div>
              <Menu
                label="More for {m.name}"
                size="sm"
                items={[
                  { label: 'Rename', icon: 'pencil', run: () => (renaming = m.id) },
                  { label: 'Delete', icon: 'trash', danger: true, run: () => deleteSong(m) },
                ]}
              />
            </div>
          </article>
        {/each}
      </div>
    {:else if app.libraryReady}
      <div class="empty">
        <div class="blank"><Cassette name="Your first idea goes here" blank color={4} /></div>
        <p><b>No tapes yet.</b> Hum it, strum it, clap it. Hit the red key and it is kept.</p>
      </div>
    {/if}
  </section>

  <input bind:this={fileInput} type="file" accept="audio/*,.tape" multiple hidden onchange={(e) => { const el = e.currentTarget; if (el.files?.length) void importFiles(el.files); el.value = ''; }} />
</main>

<style>
  .library {
    height: 100%;
    overflow-y: auto;
    padding-bottom: calc(var(--s-7) + env(safe-area-inset-bottom));
  }
  .stage {
    background: var(--bg-sunk);
    border-bottom: var(--line-w) solid var(--line);
    box-shadow: 0 1px 0 var(--groove-l);
    padding: calc(var(--s-4) + env(safe-area-inset-top)) var(--s-4) var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
    align-items: center;
  }
  header {
    width: 100%;
    max-width: 1080px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .tools {
    display: flex;
    gap: var(--s-2);
  }
  .rec {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    width: min(560px, 100%);
    padding: var(--s-4) var(--s-5) var(--s-4) var(--s-4);
    text-align: left;
    background: var(--tomato);
    color: var(--on-tomato);
    border: 3px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: 6px 6px 0 var(--shadow);
    transition: transform 0.3s var(--spring), box-shadow 0.3s var(--spring);
  }
  @media (hover: hover) {
    .rec:hover:not(:disabled) {
      transform: translate(-2px, -2px) rotate(-0.6deg);
      box-shadow: 8px 8px 0 var(--shadow);
    }
  }
  .rec:active:not(:disabled) {
    transform: translate(6px, 6px);
    box-shadow: 0 0 0 var(--shadow);
    transition-duration: 0.05s;
  }
  .dot {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    flex: none;
    border-radius: 50%;
    background: oklch(0.99 0.008 85);
    color: var(--tomato);
    border: 3px solid var(--line);
  }
  .words {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .words b {
    font-size: var(--t-28);
    font-weight: var(--w-black);
    line-height: 1.05;
    letter-spacing: -0.02em;
  }
  .words small {
    font-size: var(--t-14);
    font-weight: var(--w-bold);
    opacity: 0.95;
  }
  kbd {
    display: none;
    padding: 4px 9px;
    font-size: var(--t-14);
    font-weight: 700;
    border: var(--line-w) solid currentColor;
    border-radius: 8px;
  }
  @media (hover: hover) and (min-width: 700px) {
    kbd {
      display: block;
    }
  }
  .old {
    max-width: 1112px;
    margin: 0 auto;
    padding: var(--s-5) var(--s-4) 0;
  }
  .old ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: var(--s-2);
  }
  .old li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3);
    background: var(--surface);
    border: var(--line-w) dashed var(--line);
    border-radius: var(--r-md);
  }
  .old .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .old .txt b {
    font-weight: var(--w-bold);
    font-size: var(--t-14);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .old .txt span {
    font-size: var(--t-12);
    color: var(--text-2);
  }
  .shelf {
    max-width: 1112px;
    margin: 0 auto;
    padding: var(--s-5) var(--s-4) 0;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--t-20);
    font-weight: var(--w-black);
    margin-bottom: var(--s-4);
  }
  .count {
    font-size: var(--t-12);
    font-weight: 700;
    padding: 2px 8px;
    border: var(--line-w) solid var(--line);
    border-radius: 99px;
    background: var(--surface);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 232px), 1fr));
    gap: var(--s-5) var(--s-4);
  }
  @media (max-width: 520px) {
    .grid {
      grid-template-columns: 1fr 1fr;
      gap: var(--s-4) var(--s-3);
    }
  }
  .card {
    min-width: 0;
  }
  .open {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    border-radius: 6%;
    transition: transform 0.3s var(--spring);
  }
  @media (hover: hover) {
    .open:hover:not(:disabled) {
      transform: translateY(-4px) rotate(-1deg);
    }
  }
  .open:active:not(:disabled) {
    transform: translate(2px, 2px);
    transition-duration: 0.05s;
  }
  .meta {
    display: flex;
    align-items: flex-start;
    gap: var(--s-1);
    margin-top: var(--s-3);
  }
  .txt {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: var(--w-bold);
    font-size: var(--t-14);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: var(--t-12);
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rename {
    width: 100%;
    font-weight: var(--w-bold);
    font-size: var(--t-14);
    padding: 2px 6px;
    margin: -4px -8px;
    border: var(--line-w) solid var(--blue);
    border-radius: 8px;
    background: var(--surface);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-6) 0;
    text-align: center;
    color: var(--text-2);
    max-width: 360px;
    margin: 0 auto;
  }
  .empty b {
    color: var(--text);
  }
  .blank {
    width: 220px;
    opacity: 0.55;
  }
  @media (max-width: 520px) {
    .sub {
      white-space: normal;
    }
    .wide {
      display: none;
    }
    .words b {
      font-size: 1.5rem;
    }
    .dot {
      width: 60px;
      height: 60px;
    }
  }
</style>
