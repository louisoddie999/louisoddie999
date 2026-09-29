// Bridge to video: seek the live page frame by frame and encode a scroll-through MP4.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
const URL = process.env.URL || "http://localhost:4173/";
const [W, H] = (process.env.SIZE || "1280x720").split("x").map(Number);
const FPS = 24, DUR = parseFloat(process.env.DURATION || "36");
const OUT = process.env.OUT || "captures/scroll-through.mp4";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${URL}?capture&duration=${DUR}`, { waitUntil: "load" });
await page.evaluate(() => window.__motion.ready());
const ff = spawn(FFMPEG, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "21",
  "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] });
const n = Math.round(DUR * FPS);
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.__motion.seek(t), i / FPS);
  ff.stdin.write(await page.screenshot({ type: "png" }));
  if (i % 48 === 0) process.stderr.write(`\r${(i / FPS).toFixed(1)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.error(`\nwrote ${OUT}`);
