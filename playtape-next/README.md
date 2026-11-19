# playtape-next

The PLAYTAPE rebuild: open it, hit one key, you are recording. Songs name and
save themselves into a cassette Library; nothing asks for a folder or a file
name.

It lives on the `rehaul` branch beside the shipping single-file apps
(`../app/index.html`, `../playtape/index.html`), which are untouched.
User manual: [`../docs/PLAYTAPE_NEXT.md`](../docs/PLAYTAPE_NEXT.md).

## Run it

Needs Node.js 22.12 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://127.0.0.1:5183 in Chrome or Edge. Recording needs a secure
page, which `localhost`/`127.0.0.1` is; a phone on your Wi-Fi needs HTTPS.

Other scripts: `npm test` (unit tests), `npm run check` (type check).

## Build it

```bash
npm run build:all
```

That runs both builds; each also has its own script.

| Script | Output | What it is |
|---|---|---|
| `npm run build` | `dist/` | The installable web app: hashed assets, `manifest.webmanifest`, and `sw.js`, a service worker that caches every file so the app opens offline. Host the folder on any HTTPS address (paths are relative, so a sub-folder such as GitHub Pages works). `npm run preview` serves it at http://127.0.0.1:5184. |
| `npm run build:single` | `dist-single/index.html` | Everything in one file, about 700 KB, fonts and icon inlined, no service worker. Open it directly, or let `../INSTALL.bat` install it. |

An update to the web app is downloaded in the background and applied only when
the user presses Reload in the notice, never in the middle of a take.

**Windows icon:** after `npm run build:single`, run `../INSTALL.bat`. It copies
the single file to `%LOCALAPPDATA%\TAPE\playtape-next\` and adds a
**PLAYTAPE Next** shortcut that runs `tape_launcher.pyw next` (own port range
from 8865, own browser profile).

The Library belongs to the address the app is opened from, so the dev server,
the installed icon and a hosted copy each have their own. Move songs between
them with Share → Project and Import.

## What works

- **Library** of cassettes with one-tap **Record new idea**, rename, delete with undo, import of `.tape` and audio files.
- **Capture view**: live waveform while recording, visible count-in, input meter, click with tap tempo, mute/solo, **+ Track**, record onto a chosen track, undo/redo for everything, autosave after every change.
- **Clip editing**: drag to move (also between tracks), drag the edges to trim, split at the playhead, duplicate, delete, with snapping to clip edges, the playhead, the loop, and the grid when the click is on (hold Alt to move freely). On touch: tap a clip to select it, then drag it or its handles; pinch to zoom.
- **Loop and punch-in**: a loop bar on the ruler (drag its ends or the bar). With the loop on, Record rolls in early and keeps only the loop region.
- **Takes**: recording over a clip keeps the earlier pass inside it; switch with the Take arrows.
- **Keys**: five sounds (four synths and the gliding Stylo), played on screen, on the computer keyboard or over MIDI, recorded with the main Record key; the sound of a recorded clip can be changed afterwards.
- **Drums**: a 16-step pattern that plays along while its panel is open and is added to the song as a track.
- **Catch that!** (off by default): keeps the last minute of mic input in memory so you can keep what you just played.
- **Mix view**: channel strips on desktop, expandable rows on a phone. Per track: level, mute, solo, three-band EQ, Tighten (compressor), Reverb, Pan, Trim lows, Shift timing. Master level and reverb room. A song overview strip to jump around.
- **Pedals**: Drive, Cabinet, Echo and Tremolo per track, docked above the transport so playback keeps running while you turn knobs. Never printed into the recording.
- **Share**: MP3 (encoded in a worker), WAV, stems as one zip, or the project as a `.tape` file; uses the system share sheet where the device has one. An exported song gets a sticker on its cassette.
- **Settings**: input device and socket, timing offset with a click-and-listen Calibrate, Catch that!, loudness ceiling, theme, Calm mode. **Tuner** for guitar, bass or voice.
- **Engine**: lookahead master limiter, gapless loop scheduling, persistent track chains with smoothed parameters, deterministic reverb and cabinet impulses, offline mixdown.
- **From the old app**: the Library offers to bring in what the original PLAYTAPE or TAPE left in this browser (the unsaved-session backup and recently opened project folders), or any project folder you pick.
- **App**: installable, works offline, lock-screen play/stop controls, screen kept awake while recording.
- Day and Night themes, Calm mode.

## Not built yet

- MIDI controller-to-knob mapping (MIDI learn); MIDI notes for Keys work.
- Preview-playing a cassette from the Library without opening it.
- Exporting a song as a project *folder* (`project.json` + `media/`). The `.tape` file carries the same data and TAPE opens it.
- End-to-end browser tests. The unit tests cover the model, storage, edit rules, limiter and latency detection; the interface has been tested by hand.

## Not yet checked on real hardware

Built and tested in a desktop browser with a synthetic microphone. Still to be
confirmed on real devices: installing and offline use (the service worker),
microphone latency and input switching on an audio interface, touch gestures on
a phone, the phone share sheet, and a hardware MIDI keyboard.

## Shortcuts

Space play/stop · R or Enter record · L loop · C click · S split · T next take ·
Ctrl+D duplicate · Delete remove clip · Ctrl+Z / Ctrl+Shift+Z undo/redo · Home back to start.
With Keys open, Z–M and Q–I play notes (so use Enter to record) and the up/down arrows change octave.

## Layout

```
src/audio/     engine, graph (track chain), transport, recorder, synth, drums, midi, render, mp3, tuner, latency, dsp, worklets/
src/model/     song types, clip editing rules, undo history, TAPE project.json (v4) conversion
src/storage/   IndexedDB library, .tape files, WAV encode/decode, zip, reading the old app's data
src/ui/        Library, SongView, Timeline, TransportDock, KeysPanel, DrumsPanel, MixView, PedalsPanel, sheets, primitives
src/state.svelte.ts   app state and song actions      src/tools.svelte.ts   export, settings, calibration, old-data import
src/pwa.svelte.ts     install, service worker, media session
vite.config.ts        both build modes; writes sw.js with the list of files to cache
src/vendor/    lamejs 1.2.1 (LGPL), the same MP3 encoder the single-file apps bundle
src/styles/    design tokens and base styles
tests/         unit tests (Vitest)
```

In development, `window.__pt` exposes the app state and engine for inspection in the console.

## The look

The design takes its cues from a 1990s cassette portastudio without imitating one: a putty-grey chassis, black knobs with coloured pointers, olive tape keys in a dark well, an LCD counter, LED meters, and track names written in marker on coloured tape. All of it comes from `src/styles/tokens.css`, which also states the colour rules:

1. The chassis is grey; colour appears only where it means something.
2. Tomato means recording (or "too loud") and nothing else.
3. A track has one colour: its tape label, its clips, its strip cap. A muted track's tape goes grey.
4. A knob's pointer colour says what kind of control it is: orange for tone, pink for loudness, cyan for space and effects, white for position.
5. A lit LED means something is on or running.
6. Brand blue marks what is selected, or the main action.

The shared pieces (`.tape`, `.silk`, `.led`) are in `src/styles/base.css`. Marker lettering is for things a person would label by hand, nothing else.

## Compatibility with TAPE

Songs convert to and from the shared `project.json` version 4 shape
(`src/model/legacy.ts`). The fields TAPE reads on a clip always describe the
take that is playing; extra takes and Keys notes ride along as additional clip
fields that TAPE ignores, and this app's own data sits under the `playtape`
key, as `../CONTRIBUTING.md` asks.
