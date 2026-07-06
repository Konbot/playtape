# The TAPE / PLAYTAPE Manual

This covers both apps. If a section is PLAYTAPE-only or TAPE-only, it says
so; everything else applies equally, since they share one engine.

## Contents

- [Installing](#installing)
- [First launch](#first-launch)
- [PLAYTAPE: the Shelf](#playtape-the-shelf)
- [PLAYTAPE: the three stages](#playtape-the-three-stages)
- [Recording](#recording)
- [Editing clips](#editing-clips) (Arrange/Studio stage, or TAPE)
- [Loop and punch-in recording](#loop-and-punch-in-recording)
- [Instruments](#instruments)
- [MIDI and the keyboard](#midi-and-the-keyboard)
- [Mixing and effects](#mixing-and-effects) (Studio stage, or TAPE)
- [Exporting your song](#exporting-your-song)
- [Saving and projects](#saving-and-projects)
- [Calm mode and accessibility](#calm-mode-and-accessibility)
- [Graduating from PLAYTAPE to TAPE](#graduating-from-playtape-to-tape)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Installing

**Option A — no install, just open it.** Download or clone the repo, then
double-click `app/index.html` (TAPE) or `playtape/index.html` (PLAYTAPE).
Chrome or Edge, opened directly, works fine for recording and playback. If
Web MIDI or the microphone permission prompt seems to misbehave, serve the
folder instead of opening the file directly:

```
cd app          (or playtape)
python -m http.server 8080
```
then visit `http://localhost:8080` in your browser.

**Option B — Windows, with real Desktop icons.** Run `INSTALL.bat`. It:
1. Finds a working Python (asks you to install one, with a link, if not).
2. Copies both apps into `%LOCALAPPDATA%\TAPE`.
3. Creates a **TAPE** and a **PLAYTAPE** icon on your Desktop and in the
   Start Menu, each with its own icon.

Clicking either icon starts a tiny local server (just to serve the app's
own files — nothing leaves your machine) and opens the app in its own
window, with no browser address bar or tabs. Closing the window stops the
server. Nothing is left running in the background.

Re-running `INSTALL.bat` later updates both apps in place; your saved
songs are never stored inside the install folder, so updating never
touches your music.

## First launch

**PLAYTAPE** opens on the **Shelf** — a row of cassettes, one per song you've
made, plus a blank one to start something new.

**TAPE** opens straight into an empty project and is ready to record.

Either way: press the big red **●** with nothing set up first. A track is
created and armed automatically — you don't need to add a track, pick an
input, or arm anything by hand for your first recording.

## PLAYTAPE: the Shelf

Home is a shelf, not a file browser. Each cassette is one song. Click a
cassette to open it; click the blank one to start fresh. A cassette with a
small gold sticker on its corner has a finished mixdown — that sticker is
the *only* reward mechanic in the whole app, on purpose (see
[CONTRIBUTING.md](../CONTRIBUTING.md) if you're curious why).

Get back to the shelf any time with the **Shelf** button, top right.

## PLAYTAPE: the three stages

Open the **Workshop** (gear icon, top right) to pick a stage. Nothing is
ever locked — pick whichever fits what you feel like doing today, and
switch any time, on any song:

| Stage | What you get | Good for |
|---|---|---|
| **Play** | Giant record/play/stop, four track stripes each with one volume knob and a record-arm light, one big "oops" undo key. No timeline to break. | First-time recording, very young kids, "just capture the idea" |
| **Arrange** | Timeline with draggable/trimmable clips, a 16-step drum grid, loop + punch-in, a metronome, three macro knobs per track (Loud / Tone / Echo). | Building a song out of parts, looping an idea |
| **Studio** | Full mixer strips, guitar-pedal-style FX (drive, cabinet, delay, tremolo), stems export, latency calibration, MIDI CC learn. | Everything TAPE can do, in PLAYTAPE's skin |

A song built at Studio stage still opens fine if you switch back to Play —
you'll just see it more simply. Nothing about the underlying song is ever
removed by changing stages.

## Recording

Press **●**. If nothing is armed, PLAYTAPE/TAPE creates a track and arms it
for you. Recording starts immediately (or after a count-in, if you've
turned that on). Press **●** again (or **Stop**) to finish — your take
appears as a clip on the armed track right away.

First time recording, your browser will ask for microphone permission —
allow it once and it's remembered.

If you have more than one microphone, pick it from the **input device**
dropdown before recording (Studio/TAPE) — Play stage always uses whatever
mic was last selected.

**Latency:** the app auto-estimates your system's round-trip audio delay
and compensates for it so recordings line up with what's already playing.
For a precise number, use **Calibrate** (Studio/TAPE) — it plays a few
clicks through your speakers, listens for them through the mic, and
measures the real delay.

## Editing clips

(Arrange/Studio stage, or in TAPE.)

- **Click** a clip to select it.
- **Drag its body** to move it; **drag its edges** to trim the start/end.
- **Repeat** duplicates it right after itself — handy for looping a part.
- **Copy / Paste** — paste lands at the playhead, on the selected clip's
  track.
- **Split at playhead** cuts a clip in two at the current playhead
  position. To remove a section from the middle of a take: split at the
  start of the bad bit, split again at the end, select the middle piece,
  Delete.
- **Ctrl+Z** undoes the last change (clip edits, knob turns, track
  changes — everything).

## Loop and punch-in recording

Drag across the ruler to draw a loop region (it highlights in orange).
**LOOP** (or the `L` key) turns it on and off. With loop on, playback
cycles that region continuously — handy for practicing a section or
building a groove.

Press **●** with a loop region active and PLAYTAPE/TAPE **punches in**: it
rolls in slightly before the loop starts (so you're not recording cold),
but only the material *inside* the loop lands on the track. Redo one bar,
one verse, one drum fill — without touching anything before or after it.

## Instruments

All instruments are reachable from the header icons and work identically
in both apps unless noted:

- **Drum machine** — a 16-step grid, five voices (kick, snare, closed hat,
  open hat, clap). **Preview** auditions the pattern; **LIVE** plays it
  alongside the transport so you can record over it; **Print to track**
  renders it to a real audio clip (and mutes LIVE so it doesn't double up).
- **Keys** *(PLAYTAPE)* — a small polyphonic synth with four sounds (Felt
  Piano, Organ, Dream Synth, Fat Bass). Play it with the mouse, the
  computer keyboard, or a MIDI keyboard (see below). Arm **REC**, press
  play, and whatever you play is captured with real timing — **Print to
  track** bakes it into an audio clip.
- **Pocket Synth** *(stylophone-style, both apps)* — a monophonic glide
  synth; slide across the pads for a real stylophone-style glissando.
  Same record/print workflow as Keys.
- **Tuner** — shows the nearest note and how many cents sharp/flat your
  input is, for tuning an instrument before you record it.

## MIDI and the keyboard

Plug in any class-compliant USB MIDI keyboard and it just works with
Keys — no drivers, no setup screen. Velocity is captured. If you don't
have a MIDI keyboard, the **computer keyboard** plays Keys too:

```
Z X C V B N M     = white keys (one octave)
S D   G H J       = the black keys between them
Q W E R T Y U I   = the next octave up
↑ / ↓ arrows      = shift the whole keyboard up/down an octave
```

In the Keys drawer, an optional checkbox routes MIDI notes 36–51 to the
drum voices instead, for playing beats from a MIDI pad controller.

**MIDI learn** (Studio stage): touch an on-screen knob, then move a knob
or fader on your MIDI controller, and they're linked from then on.

## Mixing and effects

(Studio stage, or TAPE.) Each track strip has: 3-band EQ, a low-cut
switch, a compressor ("squeeze"), a reverb send, pan, and a volume fader
with a live LED meter. The **FX** button opens that track's pedalboard —
overdrive, a speaker-cabinet simulator, delay, and tremolo — all
non-destructive: they're applied on playback and on export, never
permanently printed into the recording, so you can always change your
mind.

The master strip always runs through a limiter, so nothing can suddenly
clip or blast — this is on unconditionally, not a setting.

## Exporting your song

**Bounce** renders your whole song to a single WAV or MP3 file (pick the
format next to the Bounce button). **Export stems** renders each track to
its own clean WAV, useful for finishing a mix elsewhere. Both show live
progress for longer songs, and both include the drum machine and Keys/
pocket-synth parts if their **LIVE** is switched on.

If your project is saved as a folder, exports are written straight into
that folder (stems go in a `stems/` subfolder). If it isn't saved yet,
they download instead — the status bar always says which happened.

## Saving and projects

**Save** (`Ctrl+S`) writes your project as a folder: `project.json` plus a
`media/` folder of your takes as plain WAV files — nothing proprietary,
nothing that requires this app to read later. **Open** and **Recent**
bring a saved project back.

On browsers without folder access (phones, Firefox, Safari), Save instead
downloads a single portable `.tape` file — drag it back into the app, or
use Open, to resume.

**Autosave:** a saved project quietly re-saves itself every 45 seconds.
An unsaved session is backed up inside the browser itself; if the app
closes unexpectedly, it offers to restore that backup next time you open
it.

## Calm mode and accessibility

*(PLAYTAPE, in the Workshop drawer.)* **Calm mode** turns off every
animation, pulse, and blinking light in the app — the record light stops
pulsing, meters stop glowing, everything just changes state instantly and
quietly instead. It also respects your operating system's "reduce motion"
setting automatically, with or without calm mode switched on.

The **loudness limit** slider caps how loud the app can ever get, on top
of the master limiter that's always active — nothing can suddenly become
painfully loud, by design, not as an afterthought.

## Graduating from PLAYTAPE to TAPE

Any PLAYTAPE project folder opens directly in TAPE — use TAPE's **Open**
button and pick the project folder. Every track, clip, knob setting, loop
region, and drum pattern carries over exactly. There's no conversion step
because there's nothing to convert: they're the same file format. This is
the whole point of building both apps on one engine — the "kids' version"
isn't a toy you eventually replace, it's the same instrument with a
simpler face.

## Troubleshooting

**The app looks broken, damaged, or a button seems to do nothing.**
Reload the page (or re-run `INSTALL.bat` if using the desktop app) — this
fixes almost everything, since nothing is installed beyond static files.

**"Could not access input" / no sound is recorded.** Click **Enable
input** and allow the microphone permission when your browser asks. Check
the right device is selected in the input dropdown if you have more than
one microphone.

**Recording feels out of time with the beat / other tracks.** Try
**Calibrate** (Studio stage / TAPE) with your speakers on — it measures
your system's actual round-trip latency and sets the offset for you.

**Bounce/export seems stuck.** Longer songs take a few seconds; the
status bar shows a live percentage. If it ever shows "Bounce failed:
[reason]" instead of hanging, that reason is the actual problem — please
report it as an issue with that exact message.

**Web MIDI keyboard isn't detected.** Web MIDI needs Chrome or Edge (not
Firefox or Safari) and, if you're opening the file directly rather than
through a local server, sometimes needs that local-server setup instead
— see [Installing](#installing), Option A's note about serving the folder.

## FAQ

**Does anything I record leave my computer?** No. There's no account, no
cloud, no analytics, no network calls beyond loading the page itself.
Everything — recording, mixing, rendering, saving — happens locally in
the browser.

**Can I use this offline?** Yes, entirely. Once the page has loaded once
it needs no network connection at all.

**Why is PLAYTAPE not "gamified"?** It has *some* playful elements (the
cassette shelf, the sticker on a finished song) but deliberately no
points, streaks, levels, or notifications. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for the reasoning if you're curious
or want to discuss it.

**Can I use my own MIDI keyboard / controller?** Any class-compliant USB
MIDI device should work with zero setup in Chrome or Edge — plug it in,
open the Keys drawer, and play.

**Is this really a full DAW, or a toy?** TAPE and Studio-stage PLAYTAPE
have real multitrack recording, non-destructive EQ/compression/drive/
delay/tremolo, loop/punch-in, undo, and WAV/MP3/stems export — it's meant
to be genuinely useful for capturing and finishing real ideas, not just a
demo.
