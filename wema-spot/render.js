#!/usr/bin/env node
/* Renders the spot frame-by-frame in headless Chromium and encodes it with ffmpeg.

   node render.js                      → out/wema-first-is-a-habit.mp4 (1080p60, 8-sample motion blur, audio if out/reel.wav exists)
   node render.js --stills 0.5,2.9     → out/still-0.500.png … for quick review
   node render.js --sub 2 --workers 4  → faster draft

   Frames are a pure function of time, so workers render interleaved frames in parallel
   and the writer streams them to ffmpeg in order. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const ffmpegPath = require('ffmpeg-static');
const TL = require('./timeline.js');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const SUB = Number(arg('sub', 8));
const WORKERS = Number(arg('workers', 3));
const STILLS = arg('stills', null);
const FROM = Number(arg('from', 0));
const TO = Number(arg('to', TL.FPS * TL.DURATION - 1));
const FORMAT = arg('format', '16x9');
const [VW, VH] = { '16x9': [1920, 1080], '1x1': [1080, 1080], '9x16': [1080, 1920] }[FORMAT];
const FILE = arg('out', path.join(OUT, `wema-first-is-a-habit-${FORMAT}.mp4`));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.wav': 'audio/wav' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) return res.writeHead(403).end();
      fs.readFile(p, (err, data) => {
        if (err) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(`http://localhost:${port}/index.html?capture&format=${FORMAT}`);
  await page.waitForFunction('window.READY === true', null, { timeout: 60000 });
  return page;
}
const shot = (page) => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: VW, height: VH } });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--disable-web-security'] });

  if (STILLS) {
    const page = await openPage(browser, port);
    for (const s of STILLS.split(',').map(Number)) {
      const frame = Math.round(s * TL.FPS);
      await page.evaluate(([f, sub]) => SPOT.drawFrame(f, { subframes: sub }), [frame, SUB]);
      const file = path.join(OUT, `still-${FORMAT}-${s.toFixed(3).padStart(6, '0')}.png`);
      fs.writeFileSync(file, await shot(page));
      console.log(file);
    }
    await browser.close();
    srv.close();
    return;
  }

  const wav = path.join(OUT, 'reel.wav');
  const hasAudio = fs.existsSync(wav);
  const ff = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(TL.FPS), '-c:v', 'png', '-i', '-',
    ...(hasAudio ? ['-i', wav] : []),
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
    '-movflags', '+faststart', FILE,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const frames = [];
  for (let f = FROM; f <= TO; f++) frames.push(f);
  const results = new Map();
  const waiters = new Map();
  const deliver = (f, buf) => {
    results.set(f, buf);
    if (waiters.has(f)) waiters.get(f)();
  };
  const started = Date.now();
  let writerPos = FROM;

  const workers = Array.from({ length: WORKERS }, async (_, w) => {
    const page = await openPage(browser, port);
    for (let i = w; i < frames.length; i += WORKERS) {
      // keep workers from racing too far ahead of the writer
      while (frames[i] > writerPos + WORKERS * 6) await new Promise((r) => setTimeout(r, 20));
      await page.evaluate(([f, sub]) => SPOT.drawFrame(f, { subframes: sub }), [frames[i], SUB]);
      deliver(frames[i], await shot(page));
    }
  });

  for (const f of frames) {
    if (!results.has(f)) await new Promise((r) => waiters.set(f, r));
    const buf = results.get(f);
    results.delete(f);
    waiters.delete(f);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    writerPos = f + 1;
    if (f % 60 === 0) {
      const el = (Date.now() - started) / 1000;
      console.log(`frame ${f}/${TO}  ${el.toFixed(0)}s elapsed`);
    }
  }
  await Promise.all(workers);
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  srv.close();
  console.log(`done → ${FILE}  (${((Date.now() - started) / 1000).toFixed(0)}s)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
