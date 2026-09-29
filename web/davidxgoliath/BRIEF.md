# Brief: David × Goliath, scroll-story website

**Objective.** A one-page scroll story that retells 1 Samuel 17 with the same look as the
film. It works as the home for the film and as a portfolio piece for web motion (Three.js +
GSAP).

**Audience.** People who arrive from the Reel or TikTok on a phone, plus recruiters and clients
looking at the work on desktop.

**Insight.** The story is about scale: a giant in armour against a boy with a sling. On a web
page, the reader's own scroll can *be* the sling.

**One big idea: "Your scroll is the sling."** A single real-time 3D stone travels the whole
page. It is chosen from the brook, weighed against the giant, and then **the reader's scroll
throws it**, ending in one flash when it strikes.

## Chapters (verified KJV text)
| # | Chapter | On screen | Source |
|---|---|---|---|
| 0 | Hero | DAVID × GOLIATH; The Valley of Elah; the 3D stone turning in the light | 1 Sam 17:2 |
| I | The Brook | "chose him five smooth stones out of the brook"; five 3D stones rise, one is chosen | 17:40 |
| II | The Champion | A gold ruler draws to "six cubits and a span" with armour weights counting up | 17:4–7 |
| III | The Answer | "Thou comest to me with a sword, and with a spear, and with a shield: but I come to thee in the name of the LORD of hosts" | 17:45 |
| IV | The Sling | Pinned: verse lines reveal while the scroll hurls the stone at the camera; one flash on the strike | 17:48–49 |
| V | The Fall | "and he fell upon his face to the earth"; dust takes over the frame | 17:49 |
| VI | The Battle | "for the battle is the LORD's" | 17:47 |
| VII | The Film | The 30s cinematic cut, click to play | none |

**Numbers, all labelled approximate:**
- Six cubits and a span is about 2.97 m (9 ft 9 in), taking an 18 in cubit and a 9 in span.
- The Dead Sea Scrolls (4QSamᵃ) and the Septuagint read "four cubits and a span", about 2.06 m (6 ft 9 in).
- 5,000 shekels is about 57 kg (125 lb) and 600 shekels about 6.8 kg (15 lb), taking about 11.4 g per shekel.

No other statistics.

## Design system (shared with the film)
- **Palette:** night `#0b0a09`, burnished gold `#D4AF6A` / `#F6E4B8` / `#96703A`, bone `#EDE6D6`.
- **Fonts (OFL, self-hosted):** Cinzel (titles), Cormorant Garamond (verses).
- **Motif:** the thin gold rule. It draws under every chapter title and doubles as the reading-progress line.
- **Imagery:** graded stills from the film behind each chapter, parallaxed. Grain and vignette sit over everything so the 3D and the photos share one surface.

## Stack
Vite 8, Three.js 0.186 (stone, the other four stones and dust particles), GSAP 3.15 with
ScrollTrigger and SplitText, Lenis 1.3. No framework.

## Budgets and guardrails
- **Speed:** LCP < 2.5 s (the hero image is the LCP; the 3D loads after it), CLS < 0.1, INP < 200 ms; cap the pixel density at 1.75.
- **Rendering:** pause when the tab is hidden and once the story has scrolled away.
- **Reduced motion:** no WebGL, no smooth scroll, no scrub. The page shows static stills with the text.
- **No JavaScript:** the full story is still readable. Only one flash, rate-limited to one per second.
- **Honesty:** the film is AI-generated, so it's labelled that way and never presented as a historical depiction.

## Deliverables
- The Vite project in `web/davidxgoliath/` and a static build.
- A preview link.
- Review captures: screenshots at 390/768/1440 widths and a scroll-through MP4.
- A README.
