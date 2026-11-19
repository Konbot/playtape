# Contributing to TAPE / PLAYTAPE

Thanks for even opening this file. Here's what's useful to know before you dig in.

## The shape of the project

This is deliberately **not** a bundler-and-framework project. Each app —
`app/index.html` (TAPE) and `playtape/index.html` (PLAYTAPE) — is a single
self-contained HTML file: markup, CSS and JavaScript in one place, no build
step, no `npm install`. Open it in a browser and it runs. That constraint is
intentional:

- Anyone can read the entire app top to bottom in an editor.
- There is nothing to compile, bundle, or go stale — clone it in five years
  and it still runs.
- It keeps the barrier to a first contribution as low as "know HTML/CSS/JS."

The one exception is `lame.min.js` (a third-party MP3 encoder), which is
inlined into each file at build time via a small Python splice script rather
than `<script src>`, to keep the "one file, no server needed" property intact
even for the MP3 path.

**PLAYTAPE is a fork of TAPE's audio engine**, not a from-scratch app. The
recording, mixing, rendering, and project-file code is shared logic copied
into both files; the UI, design system, stage system, and kid-facing
instruments are what differ. If you fix an engine bug (say, in the WAV
encoder or the offline render graph), check whether the same bug exists in
the other file — it probably does, and both should stay bug-for-bug
compatible so a PLAYTAPE project keeps opening cleanly in TAPE.

## PLAYTAPE Next is the exception

`playtape-next/` is a rebuild of PLAYTAPE and it does have a build step:
Vite, Svelte 5 and TypeScript, with the engine, model, storage and UI as
separate modules. The single-file property is kept as a build target
(`npm run build:single` writes one self-contained `dist-single/index.html`),
not as a way of writing the source.

Working on it:

```
cd playtape-next
npm install
npm run dev      # http://127.0.0.1:5183
npm test         # unit tests (Vitest)
npm run check    # type check
npm run build:all
```

What carries over unchanged from the rest of this file:

- **Project compatibility.** `src/model/legacy.ts` converts to and from the
  shared `project.json` v4 shape, and a round-trip test guards it. The fields
  TAPE reads on a clip always describe the take that is playing; anything new
  rides along as data TAPE ignores, or under the `playtape` key.
- **Calm mode kills everything.** Motion is switched off by `data-calm` on
  the root element and by `prefers-reduced-motion`. A new animation must obey
  both.
- **The ceiling and the limiter cannot be bypassed.** The limiter is an
  AudioWorklet (`src/audio/worklets/limiter.worklet.js`) used by live playback
  and by the offline render alike.
- **No gamification.** The sticker on an exported song's cassette is still
  the whole reward system.

What is different:

- There are no stages. Capture and Mix are two views of the same song.
- Engine code is not copy-shared with TAPE any more, so an engine fix here
  does not need mirroring, and a fix in `app/index.html` does not arrive here
  by itself.
- Every action that creates something (a song, a track) has a visible **+**
  control. Do not hide creation behind a gesture or a menu alone.
- Test through the real controls, as below. In development `window.__pt`
  exposes the app state and engine for inspection; do not import the state
  module a second time from the console, that creates a duplicate instance.

## Before you change UI code

Both apps share one hard rule: **project files must stay compatible in both
directions.** A song made in PLAYTAPE has to open in TAPE untouched, and vice
versa. If you add a field to the project JSON, put it under a namespaced key
(see how PLAYTAPE stores its stage/keys state under a `playtape: {}` key) so
the other app can safely ignore it instead of choking on it.

## Design principles that are load-bearing, not decoration

If you're touching PLAYTAPE specifically, these aren't style preferences —
they're the actual point of the app:

- **Montessori, not gamified.** No points, streaks, badges, or popups. The
  cassette "sticker" on a finished mixdown is the entire reward system by
  design. If your PR adds a progress bar or a congratulations modal, it's
  probably going the wrong direction.
- **Nothing is locked.** The three stages (Play / Arrange / Studio) are a
  self-chosen filter on the UI, not a progression gate. Every project file
  can be opened at any stage.
- **Calm mode must actually kill everything.** If you add an animation,
  pulse, or attention-grabbing effect anywhere, it needs to be silenced by
  `body.calm` and by `prefers-reduced-motion`. This is tested, not optional.
- **The loudness ceiling and master limiter are always on.** Don't add a
  code path that can bypass them.

## Testing changes

TAPE and PLAYTAPE have no test suite (PLAYTAPE Next has unit tests for its
model, storage and limiter; run `npm test` there). For the two single-file
apps, what exists today is manual verification against a running instance:

1. Open the file directly in Chrome or Edge, or serve it with
   `python -m http.server` from its folder (recommended — some features,
   like Web MIDI, want a proper origin).
2. Exercise the change with the actual UI control, not just by calling the
   underlying JS function from the console. (A past bug hid for days because
   testing called `openDrums()` directly instead of clicking the drum
   button — the button itself was silently broken.)
3. For engine changes (recording, rendering, export), a synthetic sine-wave
   buffer through `registerBuffer()` is enough to verify non-silence and
   correct duration without needing a real microphone.

## Reporting bugs

Open an issue with: which app (TAPE or PLAYTAPE), your browser, and the
exact steps — "I clicked X, expected Y, got Z." If it's audio-related,
mention your input device and whether you're on the worklet recording path
or the MediaRecorder fallback (the status bar says "fallback mode" if so).

## License

MIT (see `LICENSE`). By contributing, you agree your contribution is
provided under the same license.
