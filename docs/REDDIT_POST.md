# Reddit post — draft

Copy the block below into the Reddit post editor (Markdown mode). Notes
for you, not for the post itself, are in blockquotes like this one.

> **Before posting:**
> 1. Add 2–4 real screenshots. Best shots: the Shelf, Stage 1 (Play) with
>    a couple of tracks recorded, the Studio mixer, and the Keys drawer.
>    `Win+Shift+S` while the app is open is all you need.
> 2. Swap in your actual GitHub URL everywhere you see `<REPO_URL>`.
> 3. Read the personalization note near the top and adjust the "why" —
>    it's written to be true in spirit, but you know your actual reason
>    for building this better than I do.
> 4. Suggested subreddits, roughly in order of best fit:
>    - **r/SideProject** — solo build + open-source, exactly its crowd
>    - **r/opensource** — lead with the license + "here's the repo"
>    - **r/edtech** or **r/Montessori** — lead with the pedagogy, trim
>      the technical/vibecoding parts down
>    - **r/InternetIsBeautiful** — needs a punchier one-liner + more GIF,
>      less prose
>    - **r/musicproduction** or **r/WeAreTheMusicMakers** — lead with
>      what it can actually record/mix, mention the kids angle second
>    - **r/ClaudeAI** or **r/vibecoding** (if it exists on your instance)
>      — lead with the build process, keep the bug-hunt stories, this
>      crowd wants those
>    Post to one or two of these, not all at once — Reddit's spam
>    filters and mods dislike identical cross-posts within a short window.
> 5. Reply to early comments, especially questions about "is this safe
>    for my kid's data" (answer: nothing leaves the machine, no account,
>    no analytics) — that question will come up and answering it well
>    builds trust fast.

---

## Title options

- I vibecoded an open-source DAW for kids (and a "real" one for myself) — built entirely by talking to an AI, no code written by hand
- I built a Montessori-style music recorder for my kid using Claude Code — it's now open source
- Two weeks of "vibecoding" produced a real multitrack recorder for kids 5-15. Open source, single HTML file, zero dependencies.

## Post body

Hey — I want to share something a little unusual: a fully working,
open-source multitrack recorder for kids, that I built almost entirely
through conversation with an AI coding agent (Claude Code) rather than
writing code by hand. People are calling this "vibecoding" and I went in
skeptical of whether it could produce something *actually* solid rather
than a demo. It's a genuinely mixed answer, and I think that's the
interesting part.

**What it is:** [PLAYTAPE](<REPO_URL>) — a browser-based multitrack
recorder for kids 5–15 (neurotypical and neurodivergent), built around
Montessori principles. It's the little sibling of **TAPE**, a "real"
8-track portastudio I built first for myself. Both are single HTML files
— no install, no account, no cloud, nothing leaves your machine. Open the
file, hit the big red record button, and it just works: mic, track, and
arming are automatic.

**Why a kids' DAW instead of just simplifying an existing one:** every
kids' music app I looked at either gamifies practice into a chore
(streaks, XP, notifications) or is a toy that can't make a real
recording you'd want to keep. I wanted the opposite: build one real audio
engine, then put two doors on it. PLAYTAPE has:

- **A cassette shelf as the home screen** instead of a file browser —
  your songs *are* the cassettes. A finished song gets a small foil
  sticker. That sticker is the *entire* reward system. No points, no
  streaks, no popups, on purpose.
- **Three stages you choose yourself, nothing ever locked** — Play (huge
  buttons, one knob per track, just record and listen), Arrange (clips,
  loop/punch-in, a drum grid), Studio (full mixer, effects, MIDI learn).
  A song built in Studio still opens fine back in Play — nothing is ever
  removed, the stage is just how much of the machine is showing.
- **Calm mode** that kills every animation and blinking light in the
  app (and respects your OS's reduce-motion setting automatically), plus
  an always-on loudness ceiling so nothing can suddenly get painfully
  loud. These aren't accessibility bolted on after — the whole thing is
  designed around not overwhelming a kid who needs that.
- **Keys, a drum machine, and a pocket synth**, playable from the mouse,
  the computer keyboard, or a plugged-in MIDI keyboard with real
  velocity — zero setup, zero drivers.
- A **graduation path**: any PLAYTAPE song opens directly in TAPE, the
  full version, unchanged. It's not a toy you eventually throw away —
  it's the same instrument with a simpler face at first.

**On the vibecoding process, honestly:** it was genuinely productive for
UI iteration, feature scaffolding, and — surprisingly — for finding and
benchmarking performance problems I wouldn't have thought to look for.
One real example: bouncing a mix down to a file was always technically
"working" but painfully slow on longer songs, because the mixer was
building every audio effect for every track even when it was switched
off. Once found, the fix was straightforward and cut export time by
roughly 10x.

But it also produced at least one genuinely nasty, very "AI-shaped" bug:
a one-character typo (a dropped closing quote in an HTML attribute) that
made *every single close button in the entire app* silently stop
working — not just visually broken, but a JavaScript error that quietly
killed every event handler registered after it in the script. It went
undetected through a full round of testing because the AI's own tests
called the underlying functions directly instead of clicking the actual
buttons a real person clicks. Classic gap between "the code runs" and
"the feature works" — and a good reminder that AI-assisted testing needs
the same skepticism as AI-assisted code.

There was also a fun one where an installer appeared to work perfectly
in every test, but silently updated a shadow copy of the app that only
the AI's own process could see, while my actual desktop icon kept
launching yesterday's version — a Windows app-sandboxing quirk neither
of us anticipated until I reported "the icon still opens the old one" for
the second time.

None of this is a knock on the tools — it's more that "vibecoding" still
needs a human who actually uses the thing, reports what's real, and
pushes back. I'm the test suite. That worked, for a solo project at this
size; I'd be more careful claiming it scales to something bigger or
higher-stakes without much more rigorous automated testing than I put in
here.

**Tech, if you're curious:** each app is one self-contained HTML file —
no bundler, no `npm install`, nothing to go stale. The whole engine runs
on the Web Audio API (`AudioWorklet` for sample-accurate recording,
`OfflineAudioContext` for fast non-blocking export), Web MIDI for
hardware keyboards, and a bundled MP3 encoder for the one dependency it
does have. Projects save as a JSON manifest plus a folder of plain WAV
files — no proprietary format, nothing you can't read without this app
in ten years.

It's **MIT licensed** and up on GitHub: **<REPO_URL>**. Full manual is
in `docs/MANUAL.md` if you want the details, or just open
`playtape/index.html` in Chrome and press the red button.

Genuinely curious what this community thinks — both about the product
and about the vibecoding process that built it. Happy to answer anything.

---

## Shorter version (for InternetIsBeautiful-style subs)

I built a browser-based music recorder for kids (5–15) that opens on a
shelf of cassettes instead of a file browser, has a "calm mode" that
kills all blinking/animation, and grows with the kid through three
stages you pick yourself — nothing's ever locked. It's one HTML file,
no install, no account, nothing leaves your computer. A finished song
opens straight in the full "grown-up" version too, unchanged.

Built almost entirely by talking to an AI coding agent rather than
writing the code by hand — happy to talk about what that was actually
like (mixed bag, some real wins, one genuinely nasty bug) in the
comments.

MIT licensed, open source: **<REPO_URL>**
