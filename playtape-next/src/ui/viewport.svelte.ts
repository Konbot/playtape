/* Which part of the timeline is on screen, in lane pixels. Clips read this
   to draw only their visible stretch: a five-minute clip at high zoom would
   otherwise need a canvas far wider than any browser allows. */
export const viewport = $state({ left: 0, width: 1400 });
