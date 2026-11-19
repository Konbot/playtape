/* Web MIDI: a plugged-in keyboard plays Keys; channel 10 (or pads 36-51 on a
   pad controller's own channel) plays the drum voices. Controller-to-knob
   mapping arrives with the Mix phase, when there are knobs to map. */

export interface MidiHandlers {
  noteOn: (pitch: number, vel: number) => void;
  noteOff: (pitch: number) => void;
  drum: (index: number) => void;
  devices: (names: string[]) => void;
}

let started = false;

export const midiSupported = () => typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

/** Ask for MIDI access once (the browser may prompt). Safe to call repeatedly. */
export async function initMidi(h: MidiHandlers): Promise<boolean> {
  if (started) return true;
  if (!midiSupported()) return false;
  try {
    const acc = await navigator.requestMIDIAccess();
    started = true;
    const hook = () => {
      const names: string[] = [];
      acc.inputs.forEach((inp) => {
        names.push(inp.name ?? 'MIDI input');
        inp.onmidimessage = (e) => {
          const d = e.data;
          if (!d || d.length < 2) return;
          const cmd = d[0] & 0xf0;
          const ch = d[0] & 0x0f;
          const d1 = d[1];
          const d2 = d[2] ?? 0;
          if (cmd === 0x90 && d2 > 0) {
            if (ch === 9) h.drum((d1 - 36 + 80) % 5);
            else h.noteOn(d1, d2 / 127);
          } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
            if (ch !== 9) h.noteOff(d1);
          }
        };
      });
      h.devices(names);
    };
    hook();
    acc.onstatechange = hook;
    return true;
  } catch {
    return false;
  }
}
