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

There's no test suite (yet — see Issues if you want to add one). What exists
today is manual verification against a running instance:

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
