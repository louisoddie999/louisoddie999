# Handoff: continue this work locally

This branch (`claude/festive-keller-a6uf0f`) contains three projects:

| Folder | What it is | Status |
| --- | --- | --- |
| `motion-reel/` | 15 s motion-design reel (`motion-reel.mp4`) | Done |
| `wema-spot/` | Wema Bank "First is a habit." 30 s spec spot in 16:9, 9:16 and 1:1 (`renders/`) | Done |
| `project-cj-pitch/` | Project CJ × Wema Bank for Kids sponsorship film | Next: references collected in `refs/` |

## Get it onto your machine
Download `louisoddie999-work.bundle`, then:

```powershell
git clone louisoddie999-work.bundle louisoddie999-work -b claude/festive-keller-a6uf0f
cd louisoddie999-work
git remote set-url origin https://github.com/louisoddie999/louisoddie999.git
git push -u origin claude/festive-keller-a6uf0f   # uses your own GitHub login
```

## Re-render locally (Node 18+)
```powershell
cd wema-spot            # or motion-reel
npm install
npx playwright install chromium   # the cloud box had Chromium preinstalled; your PC needs this once
npm run build           # audio + all renders into out/
```
For quick review stills: `node render.js --format 9x16 --stills 7.2,28.9 --sub 2`.

## Project CJ: next steps (run locally with Claude Code)
1. Put the official **Wema Bank** and **Project CJ** logo files, plus the poster, in `project-cj-pitch/refs/`. Your `C:\Users\FX\codex-workspace\projects\project-cj` folder can be read directly once you work locally.
2. Set your OpenAI key as an environment variable, `setx OPENAI_API_KEY "..."`, then open a new terminal. Never commit the key.
3. Generate about 10 key frames with GPT Image, passing the logos and the poster as **reference images** (for example through the images edit endpoint). Name each logo's position, colour and exact wording in the prompt, and regenerate any frame where a logo or its text drifts.
4. Animate the frames with the same engine as `wema-spot/`: comic-panel wipes, halftone transitions, parallax and a beat-synced amapiano score. Export 16:9, 9:16 and 1:1.

Film concept: "Project CJ × Wema Bank for Kids · Proud Partner". It covers 52 weekly comic issues for ages 5–16 (Save · Grow · Learn), with Wema's run of firsts (1945, then ALAT in 2017) leading into its next first. It ends on a call to sponsor.
