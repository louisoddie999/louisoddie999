/* Shared clock: 100 BPM → beat 0.6 s, bar 2.4 s, 15 bars = 36 s. */
(function (root) {
  const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4;
  const TL = {
    FPS: 60, DURATION: 36, BPM, BEAT, BAR,
    b: (n) => n * BEAT,
    bar: (n) => n * BAR,
    // key story moments shared by picture and sound
    typeStart: 0.7, typePer: 0.065, enter: 3.6, shatter: 4.2,
    nodes: [6.0, 7.8, 9.6, 11.4, 13.2, 16.2], approve: 15.0,
    product: 16.8, orbit: 21.6, globe: 26.4, end: 31.2,
  };
  if (typeof module === 'object' && module.exports) module.exports = TL;
  else root.TL = TL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
