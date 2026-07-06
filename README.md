# TAPE / PLAYTAPE

Two multitrack recorders that share one audio engine. **TAPE** is a
full portastudio for anyone who wants to record ideas fast. **PLAYTAPE** is
the same machine rebuilt for kids (5–15), Montessori-style, and doubles as
a gentle on-ramp into TAPE itself.

No installer bloat, no account, no cloud, no subscription. Each app is a
**single HTML file** — open it in a browser and it works. There's also a
one-click Windows installer if you'd rather have a Start Menu icon than a
browser tab.

![status](https://img.shields.io/badge/status-early--and--evolving-orange)
![license](https://img.shields.io/badge/license-MIT-blue)
![zero dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)

---

## Why this exists

Every kids' music app either locks you into a walled garden, gamifies
practice into a chore (streaks, XP, ads between takes), or is secretly just
a toy that can't make a real recording. And most "simple" DAWs for beginners
are simple by *removing* things, which means the kid eventually has to
throw away everything they learned and start over in real software.

TAPE/PLAYTAPE takes a different bet: build one real audio engine, then put
**two doors** on it. A kid presses one big red button and it just records —
mic, track, and arming handled for them. A hobbyist gets a fast, offline,
no-nonsense 8-track recorder with FX and mixdown. Same engine, same project
file, same "hit record and go." A song made in PLAYTAPE opens in TAPE
without conversion — the training wheels come off without switching bikes.

## What's inside

### TAPE — the full machine
Multitrack recording with sample-accurate latency compensation, non-
destructive EQ/compression/drive/delay/tremolo per track, a drum machine,
a pocket synth, loop + punch-in recording, undo, autosave with crash
recovery, and WAV/MP3 bounce + stems — all running entirely in-browser via
the Web Audio API.

### PLAYTAPE — the same engine, rebuilt for kids
- **The Shelf** — home is a shelf of cassettes (the kid's songs), not a
  file-open dialog. Finished songs get a small foil sticker. That sticker
  is the *entire* gamification system — no points, no streaks, no popups.
- **Three stages, self-chosen, nothing locked** — Play (record & listen,
  giant buttons), Arrange (clips, loops, drum grid), Studio (full mixer,
  FX, export, MIDI learn). A kid picks their own stage; a project never
  loses data when viewed at a simpler one.
- **Built-in instruments** — a 4-voice Keys synth, a drum machine, a pocket
  synth — playable from the mouse, the computer keyboard, *or* a plugged-in
  MIDI keyboard with velocity, out of the box.
- **Neurodivergent-first defaults** — a Calm Mode that kills every
  animation and blink (and honors `prefers-reduced-motion`), an always-on
  loudness ceiling and limiter, large touch targets, and a layout that
  never rearranges itself.
- **Real mechanical-feeling controls** — knobs with knurled rings, click
  detents, and a value arc; keys with actual travel. Designed to feel like
  hardware, not a form.

## Try it

**Fastest path — no install:** download this repo, then just open
`app/index.html` (TAPE) or `playtape/index.html` (PLAYTAPE) in Chrome or
Edge. That's it. (Recording works over `file://`, but if Web MIDI or mic
permissions act up, serve the folder instead: `python -m http.server` from
inside `app/` or `playtape/`.)

**Windows, with Desktop icons:** run `INSTALL.bat`. It finds Python, copies
both apps to `%LOCALAPPDATA%\TAPE`, and drops a TAPE and a PLAYTAPE icon on
your Desktop and Start Menu — each opens in its own app window (no browser
chrome), no black console window, nothing left running when you close it.

Full walkthrough: **[docs/MANUAL.md](docs/MANUAL.md)**. One-page cheat
sheet for a first session: **[docs/QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md)**.

## How it's built

Deliberately low-tech, on purpose:

- **Single HTML file per app** — HTML, CSS, and JS together, no bundler,
  no build step, no `node_modules`. Open it in five years, it still runs.
- **Web Audio API** for the entire engine: recording via `AudioWorklet`
  (falls back to `MediaRecorder` if unsupported), offline rendering via
  `OfflineAudioContext` for fast, UI-non-blocking bounces.
- **Web MIDI API** for hardware keyboards, with a QWERTY fallback so it
  works with zero peripherals.
- **`lame.min.js`** (bundled, LGPL) is the only third-party dependency,
  inlined at build time for MP3 export.
- **Project files** are a JSON manifest + a folder of WAV takes (or a
  single portable `.tape` file on browsers without folder access, like
  phones or Firefox). Human-readable, no proprietary format.
- **The Windows installer** is a `.bat` + a small `pythonw.exe` launcher —
  no Electron, no bundled Chromium, because this machine (and probably
  yours) already has a real browser.

## Project layout

```
app/              TAPE — the full portastudio (single file: index.html)
playtape/         PLAYTAPE — the kids' edition (single file: index.html)
tape_launcher.pyw Local server + app-window launcher for both
INSTALL.bat        Windows installer (Desktop + Start Menu icons)
docs/              User manual, quick reference, contributing notes
```

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** — especially the section on
why there's no build step and what's load-bearing about PLAYTAPE's design
before you change it. Issues and PRs welcome; this is early and evolving.

## License

MIT — see [LICENSE](LICENSE). The bundled MP3 encoder (`lame.min.js`) is
LGPL v3, used unmodified; see the notice at the bottom of the LICENSE file.
