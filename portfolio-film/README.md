# Prompt → Product · a portfolio film

Final renders: [`renders/`](renders/)

A 36-second cinematic film for Louis Odiatu's LinkedIn portfolio, delivered as a **4:5** feed master plus **16:9** (Featured section) and **1:1** cuts. It tells its story in on-screen text, so it works with the sound off, the way LinkedIn autoplays.

**The idea:** watch one sentence become a product. A typed prompt shatters into light and builds a 3D AI workflow: trigger, then LLM draft, then RAG, then data, then a **human review gate** that holds everything until approval, then publish. The workflow becomes a working product, the product joins a body of work, and the work travels from Lagos to the world.

| Time | Beat |
| --- | --- |
| 0:00 | "Watch one sentence become a product." The prompt types itself, then Enter |
| 0:04 | The prompt shatters into light, which flows into the first node |
| 0:06 | The camera flies through the workflow, landing one node per beat |
| 0:13 | The human review gate: the flow queues and waits, then the approval burst |
| 0:17 | Panels snap together into a live product (a review queue with statuses advancing) |
| 0:22 | Five real projects orbit in 3D: "Prompt → system → product. Again and again." |
| 0:26 | The globe: Nigeria glows, and light arcs reach London, Berlin, Toronto, New York and more |
| 0:31 | End card: name, role, "Open to remote roles worldwide", LinkedIn call to action |

Built with the coded-motion workflow (`.claude/skills/coded-motion`):
- `film.js` is a deterministic canvas renderer with a small 3D camera, depth-of-field blur, 8-sample motion blur, bloom, grain and chromatic aberration on impacts.
- `audio.js` synthesizes the score: an original D-minor cinematic pulse with no samples.
- `landdots.js` holds the globe's land data (Natural Earth, public domain).

```bash
npm install && npx playwright install chromium   # Chromium only needed once per machine
npm run build   # → out/louis-odiatu-prompt-to-product-{4x5,16x9,1x1}.mp4
```

## Suggested LinkedIn post
> One sentence in. A working product out.
>
> This is how I build: a prompt becomes an AI workflow (LLM drafting, RAG grounding, data routing), with a human approving every output before it ships. Then it becomes a tool a team actually runs.
>
> Fun detail: this film wasn't made in After Effects. I wrote it as code. Every frame is rendered from one function of time, and the soundtrack is synthesized too.
>
> Based in Nigeria, open to remote AI automation and product engineering roles worldwide. Let's build. 👇
>
> #AIAutomation #ProductEngineering #MotionDesign #LLM #RemoteWork
