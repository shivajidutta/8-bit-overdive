# Car Racing Game — Project Context

## Who this is for
Arnay, 12 years old. Dislikes traditional "learning tech" framing — engages
through games. This project is a simple car racing video game, built with
Arnay as the creative lead: he supplies the idea/prompt, we ask clarifying
questions, then build and show him working results fast and often.

## Governing rules
- Follow `D:\000-all-Claude\FABLE-PROTOCOL.md` without exception (Core Loop,
  Final Gate, no fabricated facts, ask on costly-if-wrong ambiguity).
- This file is the source of truth for this project's context. Update it as
  decisions get made (game concept, tech stack, hosting) so future sessions
  don't re-ask settled questions.
- Keep things simple and buildable in short sessions — favor visible, playable
  progress over architectural completeness. Arnay should be able to see/play
  something new frequently.

## Status
- [2026-07-13] v1 built: `index.html`, `style.css`, `game.js` — playable in
  any browser, no install/build step. Core Loop verified this session by
  calling the game's functions directly in the browser console (car-select
  render, accelerate/brake/lane-change, Lotus fragile rule, Cybertruck
  2-lives rule, normal-car side-slow/rear-gameover rule, finish line +
  localStorage best-time) — all passed. Could NOT get a visual screenshot
  this session: the Browser-pane screenshot/zoom tool timed out repeatedly
  (infra issue with this preview tool, not a code defect — confirmed via
  pixel-data inspection that draw() renders correctly). Arnay/Shivaji should
  open `index.html` directly (double-click, or the localhost:8123 preview)
  to eyeball it themselves before we call it done.
- Not yet published to Netlify — that's the next step once Arnay confirms it
  plays the way he wants.
- [2026-07-13, round 2] Big feedback round from real screenshots: removed a
  stray overflow line bug in the car sprites, fully redesigned all 5 car
  shapes to read as their brands and fit cleanly in the select screen,
  replaced the whole lane-based movement system with FREE continuous
  steering for both the player AND traffic (confirmed by Arnay — no lanes at
  all anymore, smooth steer-anywhere-on-the-road), background is now black,
  all colors muted/less vibrant, road widened + cars shrunk further,
  acceleration tripled (+200%) per request. Track length kept at the
  original ~40s baseline — Arnay's "not too long or short" note matches his
  own original spec, so no change was made there; flag if a different length
  is wanted. Verified via direct function/pixel tests in-session (collision
  rules, steering physics, occupancy anti-overlap, sprite bounds, colors) —
  visual screenshot tool still unavailable this session; Arnay should
  eyeball it in the browser himself.
- [2026-07-13, round 3] Acceleration boosted another +1000% (now reaches ~99%
  of top speed in a single frame — essentially instant on tap of Up).
  Assumption: "add a few more cars for a challenge" was read as more TRAFFIC
  variety/density (not more player-selectable brand cars, since those were
  originally specified in detail) — added 2 new traffic-only silhouettes
  (boxy van, tall SUV) and increased spawn density. Flag if Arnay actually
  meant more cars to choose from at race start.
- [2026-07-13, round 4] Found and fixed the real cause of "cars feel
  indestructible": the old side-vs-rear collision split judged a hit as
  lethal only if NEITHER car was actively steering — but with free-roam
  steering now the norm, players are almost always steering, so nearly
  every contact was getting scored as a harmless "graze" instead of a hit.
  Replaced with the simpler rule Arnay asked for: ANY touch (any side) =
  instant game over, except the Cyber Truck, which still takes 2 hits
  (confirmed both behaviors with direct tests). Also made traffic
  increasingly aim its (still telegraphed/signaled) lane-change moves
  straight at the player's position instead of only random shifts — caught
  and fixed a bug during testing where the occupancy check was blocking
  the AI from ever actually targeting the player. Raised each car's top
  speed further (acceleration was already reaching 99% of max speed in a
  single frame from the last round, so another accel increase wouldn't be
  felt — bumped maxSpeed instead to deliver the "even faster" ask).

## Confirmed concept (from Arnay, 2026-07-13)
- Retro 8-bit style, single-player car racing game.
- Selectable cars (visually distinct, brand-inspired but not identical):
  silver Tesla Cybertruck, Audi R8, green Mercedes-Benz, yellow Lotus
  Spyder, royal blue Dodge Challenger.
- Objective: evade other cars while speeding, complete the race in the
  minimum time.
- Straight road with obstacles to avoid; difficulty increases over time.
- Controls: Up = accelerate, Left/Right = move lanes/steer, Down =
  brake/slow down. Car auto-drives (keeps moving forward) even without
  pressing Up; Up adds acceleration on top of that.
- Other traffic cars have varied speeds (some fast, some slow) and some
  suddenly change lane/position, forcing a dodge — more of this at higher
  difficulty.
- Cars must look distinct from each other (shape, tires, proportions), not
  reskins of one sprite.
- Finish line marks the end of the race.
- On-screen speedometer showing current speed state (accelerating,
  cruising, braking, etc.)

## Full confirmed spec (locked 2026-07-13 — build against this)

**Track**
- One straight 3-lane road, single level, no laps.
- Track length = distance covered in 40 seconds at base auto-drive speed
  (no player accel). Player can beat 40s by accelerating/dodging well.
  A finish line sprite marks the end.
- Difficulty (traffic density/speed/sudden-lane-change frequency) ramps up
  progressively the further along the track you get.

**Controls**
- Car auto-drives forward at a base speed with no input.
- Up = accelerate above base speed. Down = brake/slow below base speed.
  Left/Right = change lane (3 lanes total).

**Cars (car-select screen before racing)**
- Lotus Spyder (yellow) — fastest top speed of all 5. Fragile: ANY side
  touch against another car = instant destroyed/game over (no slow-down
  grace like other cars). Rear hit = game over too (same as everyone else).
- Tesla Cybertruck (silver) — slowest top speed. Tanky: 2 lives. Side touch
  = slows down (like normal cars, doesn't cost a life). Rear hit costs 1
  life instead of instant game over; game over only after 2nd rear hit.
- Audi R8 — quick but twitchy: fast acceleration and fast lane-change, but
  slightly lower top speed than Mercedes/Challenger.
- Mercedes-Benz (green) — balanced: average acceleration, handling, and top
  speed. The "no-surprises" pick.
- Dodge Challenger (royal blue) — powerful but heavy: high top speed and
  strong acceleration, but slower/heavier lane-change response.
- Default rule for Audi/Mercedes/Challenger (i.e. everyone except Lotus and
  Cybertruck): side touch on another car = slow down (speed penalty); hit
  from behind = instant game over.

**Traffic (obstacle cars)**
- Mix of fast and slow traffic cars in the 3 lanes.
- Some traffic cars suddenly shift lane/position while moving, forcing the
  player to dodge — frequency increases at higher difficulty (later in the
  track).

**Game over / retry**
- On game over (final life lost), return to the car-select screen so the
  player can pick again (same or different car) and restart the level.

**Scoring**
- Track and persist best (fastest) completion time using the browser's
  localStorage. Show current time and best time on screen.

**HUD**
- Speedometer visible on screen at all times, reflecting current
  accelerating/cruising/braking state.
- Elapsed time and best/high score displayed.

**Look/feel**
- Retro 8-bit pixel-art visual style. Each of the 5 cars must be visually
  distinct (silhouette/shape/tire size), not palette-swapped copies of one
  sprite, and should read as "inspired by" their real-world counterpart
  without being a literal logo/brand reproduction.
- Canvas fills the browser window.
- Silent for now — no sound effects/music in this version.

## Tech stack / hosting (confirmed)
- HTML5 Canvas + vanilla JavaScript, single-page, no build tools/frameworks.
  Runs by opening the HTML file in any browser — nothing to install.
- Best time saved via `localStorage` (persists between sessions on the same
  browser/computer).
- Hosting: fully browser-based, so once built it can be shared for free via
  Netlify (drag-and-drop deploy, free URL like
  `arnays-car-race.netlify.app`) if Arnay wants friends to play it online;
  no server or backend needed. Requires Arnay/parent to create their own
  free Netlify account when ready to publish — Claude does not create
  accounts on their behalf.
- Camera: top-down, vertical-scrolling view (car near bottom of screen,
  road scrolls downward, traffic approaches from top) — classic NES-style
  racer look (Spy Hunter/Road Fighter), chosen over isometric for v1 since
  isometric adds significant sprite/art and coordinate-mapping complexity
  for no gameplay benefit. Can revisit isometric as a visual-only v2 later
  if still wanted after playing v1.
