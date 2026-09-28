/* Shared clock for picture and sound.
   128 BPM → one beat = 0.46875 s, one bar = 1.875 s, eight bars = exactly 15 s.
   Every scene starts on a downbeat, so the edit, the animation and the music all lock. */
(function (root) {
  const BPM = 128;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;
  const scenes = [
    { id: '01', name: 'SQUASH & STRETCH' },
    { id: '02', name: 'KINETIC TYPE' },
    { id: '03', name: 'MORPH' },
    { id: '04', name: 'STAGGER' },
    { id: '05', name: 'EMERGENCE' },
    { id: '06', name: 'DEPTH' },
    { id: '07', name: 'PRINCIPLES' },
    { id: '08', name: 'RESOLVE' },
  ].map((s, i) => ({ ...s, start: i * BAR, end: (i + 1) * BAR }));

  const TL = {
    W: 1920,
    H: 1080,
    FPS: 60,
    DURATION: 15,
    BPM,
    BEAT,
    BAR,
    scenes,
    b: (n) => n * BEAT, // beat number → seconds
  };

  if (typeof module === 'object' && module.exports) module.exports = TL;
  else root.TL = TL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
