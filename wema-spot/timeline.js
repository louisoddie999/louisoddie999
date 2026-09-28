/* Shared clock for picture and sound.
   112 BPM → one beat = 0.5357 s, one bar = 2.1429 s, fourteen bars = exactly 30 s.
   Every act starts on a downbeat so the edit, the animation and the music lock together. */
(function (root) {
  const BPM = 112;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;
  const acts = [
    { id: '01', name: 'HERITAGE', bar: 0 },
    { id: '02', name: 'THE DROP', bar: 3 },
    { id: '03', name: 'MONEY IN MOTION', bar: 5 },
    { id: '04', name: 'FOR EVERY NIGERIAN', bar: 9 },
    { id: '05', name: 'RESOLVE', bar: 12 },
  ];
  const TL = {
    W: 1920,
    H: 1080,
    FPS: 60,
    DURATION: 30,
    BPM,
    BEAT,
    BAR,
    BARS: 14,
    acts,
    b: (n) => n * BEAT, // beat number → seconds
    bar: (n) => n * BAR, // bar number → seconds
  };
  // Talking-drum phrases: [beat, start pitch, end pitch] in semitones. The drum opens the spot,
  // and at the end it "speaks" the tagline — F̀irst is a há-bit — following the rise and fall of speech.
  // The picture reads the same hits to make the purple thread vibrate.
  TL.talk = [
    [0, -5, 2], [0.75, 0, 0], [1, 3, 3], [1.5, -2, -2], [2, 0, 5], [2.5, 5, 5], [3, 0, 0], [3.5, -5, 3],
    [40, 0, 5], [41, 3, 3], [42, -2, 0], [43, 5, -2],
    [52.5, 5, 5], [52.75, 0, 0], [53, -3, -3], [53.5, 5, 5], [54, -3, 2], [55, -5, 0],
  ].map(([beat, p0, p1]) => ({ t: beat * BEAT, p0, p1 }));
  if (typeof module === 'object' && module.exports) module.exports = TL;
  else root.TL = TL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
