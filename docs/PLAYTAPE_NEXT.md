# PLAYTAPE Next: the manual

PLAYTAPE Next is the rebuild of PLAYTAPE that lives in `playtape-next/`. It is
made for one job: catching a musical idea before it is gone, then growing it
into a demo. Open it, press one key, you are recording. Songs name and save
themselves.

It runs next to the original PLAYTAPE and TAPE and does not replace them yet.
Songs move between all three (see [Moving songs](#moving-songs-between-apps)).

## Contents

- [Getting it running](#getting-it-running)
- [The Library](#the-library)
- [Recording](#recording)
- [Editing](#editing)
- [Loop, punch-in and takes](#loop-punch-in-and-takes)
- [Keys and Drums](#keys-and-drums)
- [Catch that!](#catch-that)
- [Mix and pedals](#mix-and-pedals)
- [Share](#share)
- [Settings and the tuner](#settings-and-the-tuner)
- [Where your songs live](#where-your-songs-live)
- [Moving songs between apps](#moving-songs-between-apps)
- [Shortcuts](#shortcuts)
- [Troubleshooting](#troubleshooting)

---

## Getting it running

Unlike the other two apps, PLAYTAPE Next is built from source. You need
[Node.js](https://nodejs.org) 22.12 or newer, once, to build it.

```
cd playtape-next
npm install
npm run build:all
```

That produces two things:

- `playtape-next/dist-single/index.html`: the whole app in **one file**, about
  700 KB. Open it in Chrome or Edge, copy it to a USB stick, or let the
  Windows installer pick it up.
- `playtape-next/dist/`: the **installable web app**. Put this folder on any
  HTTPS host and a phone or computer can install it and use it offline.

**Windows, with a Desktop icon.** Build first, then run `INSTALL.bat` in the
repo root. When it finds `playtape-next\dist-single\index.html` it adds a
**PLAYTAPE Next** icon beside TAPE and PLAYTAPE. If the build is not there the
installer behaves exactly as before.

**While developing:** `npm run dev`, then open http://127.0.0.1:5183.

Recording needs a secure page. `localhost`, `127.0.0.1`, a file opened directly
in Chrome or Edge, and any `https://` address all count. A plain `http://`
address on your Wi-Fi does not, so a phone needs the HTTPS-hosted version.

## The Library

Home is a wall of cassettes, one per song.

- **Record new idea** makes a song called something like
  "Idea · Wed 18 Nov 14:32" and starts recording immediately.
- **+ New** opens an empty song without recording.
- **Import** brings in a `.tape` file or audio files (WAV, MP3 and whatever
  else your browser can decode).
- The menu on a cassette renames or deletes it. Delete shows an Undo.
- A cassette gets a sticker once the song has been exported. That is the only
  reward in the app, on purpose.

If the old PLAYTAPE or TAPE saved anything in this same browser, a banner
titled **From the old app on this device** offers to bring it in: the unsaved
session backup, recently opened project folders, or any project folder you
pick.

## Recording

The big round key in the dock at the bottom is Record. Press it (or `R`, or
`Enter`) and you are recording onto a new track. Press again to stop.

- The first time, the browser asks for the microphone. After that the mic stays
  ready while a song is open, so Record starts without delay, and the input
  meter shows your level before you record.
- While recording, the screen takes on the record colour and the waveform draws
  as you play.
- With the click on, a 4-3-2-1 count-in is shown before recording starts. The
  tempo box has tap tempo.
- To record onto an existing track, press the small record key in that
  track's header first ("Record onto this track"). Press it again to go back
  to a new track per take. **+ Track** under the last lane adds an empty one.
- On a phone the screen is kept awake during a take.

### Hearing yourself (Monitor)

The **Monitor** key in the dock (or `M`) plays your input back to you while
you play, for a guitar, bass or keyboard plugged into an audio interface. Its
light is on while it is on. Wear headphones: with a microphone and speakers
it feeds back.

- The monitor takes the shortest road through the app: it skips the limiter's
  5 ms lookahead and opens the input with a shorter buffer where the browser
  allows it. What you hear is still held under the loudness ceiling.
- There is always some delay, because sound has to travel into the computer
  and out again. Settings shows roughly how much on your device. A wired
  interface is usually fine; Bluetooth headphones are always too slow for
  playing along.
- If your interface has its own "direct monitor" switch or knob, that has no
  delay at all. Use it and leave Monitor off, or you will hear yourself twice.
- **Monitor level** in Settings sets how loud you are next to the song. It
  never changes what is recorded.

Nothing needs saving. Each take is written to storage the moment it ends, and
every other change is saved a moment after you make it.

## Editing

Select a clip and an action bar appears with Split, Duplicate, Loop this and
Delete.

- Drag a clip to move it, also to another track. Drag its edges to trim.
- Clips snap to other clips, the playhead, the loop, and the grid when the
  click is on. Hold `Alt` to move freely.
- On touch: tap a clip to select it, then drag it or its handles. Pinch to
  zoom.
- Undo and Redo cover everything, including deleting a track and changing a
  drum pattern.

## Loop, punch-in and takes

- Turn **Loop** on and a bar appears on the ruler. Drag its ends or the whole
  bar. Playback repeats it without a gap.
- With the loop on, Record rolls in a little before the loop and keeps only
  what you played inside it. That is punch-in.
- Recording over an existing clip does not stack audio on top of it. The
  earlier pass stays inside the clip as a **take**; the arrows on the clip (or
  `T`) switch between takes.

## Keys and Drums

The source switch beside the transport chooses what Record records: **Mic**,
**Keys** or **Drums**. The panel docks above the transport; it is not a
pop-up, so play, record and the shortcuts keep working.

- **Keys**: five sounds, four synths and the gliding Stylo. Play on screen, on
  the computer keyboard (`Z`–`M` and `Q`–`I`, arrows change octave), or on a
  MIDI keyboard. Record with the same Record key. The notes are kept, so the
  sound of a recorded clip can be changed afterwards.
- **Drums**: a 16-step grid for kick, snare, closed hat, open hat and clap
  that plays along while the panel is open. **Add to song** turns it into a track.

## Catch that!

Off by default; switch it on in Settings. While it is on and the mic is ready,
the app keeps the last minute of what the mic heard, in memory only. If you
play something good without recording, press **Catch** and the last 30 seconds
become a clip. Nothing is stored unless you press it.

## Mix and pedals

**Mix** (the switch at the top of a song) shows a channel strip per track on a
computer and one row per track on a phone; tap a row to open it.

Per track: level, mute, solo, three-band EQ, Tighten (a compressor), Reverb,
Pan, Trim lows, and Shift timing. The master has its own level and the reverb
room size.

**Pedals** (Drive, Cabinet, Echo, Tremolo) open per track above the transport.
They change what you hear and what you export, never the recording itself, so
you can always turn them off again.

The loudness ceiling and the master limiter are always on and cannot be
bypassed.

## Share

The Share key at the top of a song offers:

- **MP3** or **WAV** of the whole mix,
- **Stems**: one WAV per track, in a zip,
- **Project**: a `.tape` file holding the song and all its audio.

On a phone these go to the system share sheet; on a computer they are saved to
your downloads.

## Settings and the tuner

The gear at the top of a song opens Settings:

- **Recording**: input device and socket (Both, Input 1 or Input 2, for audio
  interfaces), **Monitor** and its level, the timing offset with **Calibrate** (it plays clicks and
  listens for them, so put the mic near the speaker), Catch that!, and the
  **Tuner**, which listens to the mic and shows the nearest note for a guitar,
  a bass or your voice.
- **Sound**: the loudness ceiling.
- **Look**: Day or Night theme, and **Calm mode**, which turns off every
  animation. The system "reduce motion" setting is respected as well.
- **App**: install as an app, when the browser allows it.

## Where your songs live

Songs are stored by the browser, on the device, for the address the app was
opened from. Nothing is uploaded anywhere. Three things follow from that:

- The same app opened from a **different address** (the Desktop icon, the
  single file opened directly, a hosted copy) has its **own separate
  Library**.
- Clearing the browser's site data deletes the Library.
- A browser may clear storage for sites it considers unused when the disk is
  nearly full. The app asks the browser to keep its data; installing it as an
  app makes that request much more likely to be granted.

So for anything you care about, use **Share → Project** now and then and keep
the `.tape` file somewhere safe. It imports back with everything intact.

## Moving songs between apps

- **To TAPE or the original PLAYTAPE:** Share → Project, then open the `.tape`
  file there. Takes and Keys notes travel along as extra data those apps
  ignore; they play the take that was selected.
- **From TAPE or the original PLAYTAPE:** save as a `.tape` file there and use
  Import, or use the "From the old app on this device" banner to read a project
  folder directly.

## Shortcuts

| Key | Does |
|---|---|
| `Space` | Play / stop |
| `R` or `Enter` | Record / stop recording |
| `Home` | Back to the start |
| `L` | Loop on / off |
| `C` | Click on / off |
| `M` | Monitor on / off |
| `S` | Split the selected clip at the playhead |
| `T` | Next take |
| `Ctrl+D` | Duplicate the selected clip |
| `Delete` | Remove the selected clip |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |

With Keys open, the letter keys play notes, so use `Enter` to record.

## Troubleshooting

**The microphone is blocked.** Click the padlock or the camera icon in the
address bar, allow the microphone, and press Record again.

**My playing lands early or late against the click.** Settings → Recording →
Calibrate, with the mic near the speaker. With headphones, hold one earcup to
the mic. The offset is remembered per input device.

**I hear myself late on the monitor.** That delay belongs to the sound device,
not the app. Use a wired audio interface rather than the built-in sound or
Bluetooth, close other programs that are playing sound, and prefer the
interface's own direct-monitor switch if it has one.

**The Library is empty after I moved to a different icon or address.** It is a
separate Library (see [Where your songs live](#where-your-songs-live)). Open
the app the way you did before, export the songs as Project files, and import
them in the new place.

**No Install button.** Installing needs the HTTPS-hosted version (`dist/`) in
Chrome, Edge or a recent Safari. The single file and the Desktop icon cannot be
installed as a web app, and do not need to be.
