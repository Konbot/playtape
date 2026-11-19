/* One icon set for the whole app: Phosphor, bold for actions and fill for
   transport. Imported as raw SVG so only the icons used are bundled. */

import play from '@phosphor-icons/core/assets/fill/play-fill.svg?raw';
import pause from '@phosphor-icons/core/assets/fill/pause-fill.svg?raw';
import stop from '@phosphor-icons/core/assets/fill/stop-fill.svg?raw';
import skipBack from '@phosphor-icons/core/assets/fill/skip-back-fill.svg?raw';
import microphone from '@phosphor-icons/core/assets/fill/microphone-fill.svg?raw';
import undo from '@phosphor-icons/core/assets/bold/arrow-counter-clockwise-bold.svg?raw';
import redo from '@phosphor-icons/core/assets/bold/arrow-clockwise-bold.svg?raw';
import metronome from '@phosphor-icons/core/assets/bold/metronome-bold.svg?raw';
import plus from '@phosphor-icons/core/assets/bold/plus-bold.svg?raw';
import minus from '@phosphor-icons/core/assets/bold/minus-bold.svg?raw';
import back from '@phosphor-icons/core/assets/bold/caret-left-bold.svg?raw';
import forward from '@phosphor-icons/core/assets/bold/caret-right-bold.svg?raw';
import trash from '@phosphor-icons/core/assets/bold/trash-bold.svg?raw';
import more from '@phosphor-icons/core/assets/bold/dots-three-bold.svg?raw';
import close from '@phosphor-icons/core/assets/bold/x-bold.svg?raw';
import check from '@phosphor-icons/core/assets/bold/check-bold.svg?raw';
import upload from '@phosphor-icons/core/assets/bold/upload-simple-bold.svg?raw';
import pencil from '@phosphor-icons/core/assets/bold/pencil-simple-bold.svg?raw';
import moon from '@phosphor-icons/core/assets/bold/moon-bold.svg?raw';
import sun from '@phosphor-icons/core/assets/bold/sun-bold.svg?raw';
import leaf from '@phosphor-icons/core/assets/bold/leaf-bold.svg?raw';
import warning from '@phosphor-icons/core/assets/bold/warning-bold.svg?raw';
import speaker from '@phosphor-icons/core/assets/bold/speaker-high-bold.svg?raw';
import speakerOff from '@phosphor-icons/core/assets/bold/speaker-slash-bold.svg?raw';
import headphones from '@phosphor-icons/core/assets/bold/headphones-bold.svg?raw';
import zoomIn from '@phosphor-icons/core/assets/bold/magnifying-glass-plus-bold.svg?raw';
import zoomOut from '@phosphor-icons/core/assets/bold/magnifying-glass-minus-bold.svg?raw';
import tap from '@phosphor-icons/core/assets/bold/hand-tap-bold.svg?raw';
import waveform from '@phosphor-icons/core/assets/bold/waveform-bold.svg?raw';
import faders from '@phosphor-icons/core/assets/bold/faders-bold.svg?raw';
import record from '@phosphor-icons/core/assets/fill/record-fill.svg?raw';
import scissors from '@phosphor-icons/core/assets/bold/scissors-bold.svg?raw';
import copy from '@phosphor-icons/core/assets/bold/copy-simple-bold.svg?raw';
import loop from '@phosphor-icons/core/assets/bold/repeat-bold.svg?raw';
import piano from '@phosphor-icons/core/assets/bold/piano-keys-bold.svg?raw';
import catchBack from '@phosphor-icons/core/assets/bold/clock-counter-clockwise-bold.svg?raw';
import stack from '@phosphor-icons/core/assets/bold/stack-bold.svg?raw';
import gear from '@phosphor-icons/core/assets/bold/gear-six-bold.svg?raw';
import share from '@phosphor-icons/core/assets/bold/export-bold.svg?raw';

/* Phosphor has no drum; drawn on the same 256 grid with the bold stroke weight. */
const drum =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">' +
  '<ellipse cx="128" cy="96" rx="88" ry="36"/><path d="M40 96v68c0 20 39 36 88 36s88-16 88-36V96"/><path d="M88 130v62M168 130v62"/></svg>';

export const icons = {
  play, pause, stop, skipBack, microphone, undo, redo, metronome, plus, minus, back, forward, trash, more, close, check,
  upload, pencil, moon, sun, leaf, warning, speaker, speakerOff, headphones, zoomIn, zoomOut, tap, waveform, faders, record,
  scissors, copy, loop, piano, catchBack, stack, drum, gear, share,
};

export type IconName = keyof typeof icons;
