// Web review loop: screenshots per chapter at 3 widths, reduced-motion pass, console errors, fps.
import { chromium } from "playwright-core";
import fs from "node:fs";
const URL = process.env.URL || "http://localhost:4173/";
const OUT = process.env.OUT || "captures";
const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const VIEWS = { phone: [390, 844], tablet: [768, 1024], desktop: [1440, 900] };
const errors = [];
const stops = [["hero", "#hero", 0], ["brook", "#brook", 0.5], ["champion", "#champion", 0.55], ["answer", "#answer", 0.5],
  ["sling20", ".sling", 0.2], ["sling60", ".sling", 0.6], ["sling88", ".sling", 0.88], ["sling95", ".sling", 0.95],
  ["fall", "#fall", 0.5], ["battle", "#battle", 0.5], ["film", "#film", 0.3]];
for (const [name, [w, h]] of Object.entries(VIEWS)) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("requestfailed", (r) => errors.push(`${name}: failed ${r.url()}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.goto(URL + "?capture&duration=40", { waitUntil: "load" });
  await page.evaluate(() => window.__motion.ready());
  for (const [label, sel, frac] of stops) {
    // map a position inside a chapter to capture time, then seek deterministically
    const t = await page.evaluate(([sel, frac]) => {
      const el = document.querySelector(sel);
      const st = window.scrollY + el.getBoundingClientRect().top;
      const pinned = el.parentElement.classList.contains("pin-spacer") ? el.parentElement : el;
      const span = sel === ".sling" ? pinned.offsetHeight - innerHeight : el.offsetHeight;
      const y = sel === ".sling" ? st + span * frac : st + el.offsetHeight * frac - innerHeight / 2;
      const max = document.documentElement.scrollHeight - innerHeight;
      const u = Math.min(1, Math.max(0, y / max));
      return (0.04 + 0.96 * u) * window.__motion.duration;
    }, [sel, frac]);
    // step up to t so time-based tweens and the strike have happened
    for (let k = 12; k >= 0; k--) await page.evaluate((x) => window.__motion.seek(x), Math.max(0, t - k * 0.1));
    await page.screenshot({ path: `${OUT}/${name}_${label}.png` });
  }
  await page.close();
}
// reduced motion: everything readable, no WebGL
const rm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
rm.on("pageerror", (e) => errors.push(`reduced: ${e}`));
await rm.goto(URL, { waitUntil: "load" });
await rm.waitForTimeout(1200);
const rmInfo = await rm.evaluate(() => ({ canvasDrawn: !!document.querySelector("canvas.stage").getContext("webgl2", { failIfMajorPerformanceCaveat: false }) && performance.getEntriesByType("resource").some((r) => r.name.includes("scene")), heroOpacity: getComputedStyle(document.querySelector(".hero h1")).opacity }));
await rm.screenshot({ path: `${OUT}/reduced_phone_full.png`, fullPage: true });
// JS disabled: story still readable
const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
const nj = await ctx.newPage();
await nj.goto(URL);
const njText = await nj.evaluate(() => document.body.innerText.includes("for the battle is the LORD") && getComputedStyle(document.querySelector(".hero h1")).opacity);
// fps under 4x CPU throttle while scrolling (software GL here: indicative only)
const fp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await fp.goto(URL, { waitUntil: "load" });
await fp.waitForTimeout(2500);
const cdp = await fp.context().newCDPSession(fp);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const fps = await fp.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; window.scrollBy(0, 12); performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : res(n / 3); };
  requestAnimationFrame(tick);
}));
console.log(JSON.stringify({ errors, reduced: rmInfo, noJsReadable: njText, fps4xThrottleSoftwareGL: Math.round(fps) }, null, 1));
await browser.close();
