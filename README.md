# Velocity Circuit 🏁

A 3D arcade car racing game that runs entirely in the browser. Built with
[Three.js](https://threejs.org/) — no build step, no external assets, fully
offline (the Three.js library is vendored in this folder). The track, cars,
trees, mountains, grandstand, and every texture are generated procedurally
at load time.

![genre](https://img.shields.io/badge/genre-arcade%20racer-red)

## Running it

ES modules require an HTTP server (opening `index.html` via `file://` won't
work). Any static server does the job:

```bash
cd 3d-game
python3 -m http.server 8517
# then open http://localhost:8517
```

or `npx serve`, `php -S localhost:8517`, etc.

## Deploying

The game is a zero-build static site, so it deploys to
[Vercel](https://vercel.com) as-is: import this repo at
[vercel.com/new](https://vercel.com/new), pick the **Other** framework preset,
leave the build command and output directory empty, and deploy. Every push to
`main` then auto-deploys, and pull requests get preview URLs. The included
`vercel.json` only adds an immutable cache header for the vendored
`three.module.js`.

<!-- Live: https://<project>.vercel.app -->


> Note: port 8517 is deliberately uncommon. If you serve on a popular port
> (8000, 8080, 3000) inside a dev container, an app on the host machine may
> already own it — the browser then hangs on that app instead of reaching
> the forwarded container port.

## How to play

Beat 4 AI drivers — **Blaze, Vex, Nitro, and Echo** — over a 3-lap race.
You start at the back of the grid.

| Key | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A`·`D` / `←`·`→` | Steer |
| `Space` | Handbrake (drift!) |
| `C` | Cycle camera: chase → hood → overhead |
| `R` | Reset car onto the track |
| `M` | Toggle engine sound |
| `Enter` | Restart after the finish |

Tips:
- Stay on the asphalt — grass is *slow*.
- The AI brakes before corners; out-brake them on the inside.
- Tap `Space` while turning to rotate the car through hairpins.
- Watch the minimap (top right) to learn the circuit.

## What's inside

Single ES module (`game.js`, ~700 lines):

- **Track** — a closed Catmull-Rom spline sampled into 800 segments and
  extruded into a road ribbon, with rumble strips, lane markings, and a
  checkered start line painted onto canvas-generated textures.
- **Player physics** — arcade model with a velocity vector decomposed into
  forward/lateral components: engine force with top-speed taper, separate
  braking/reverse, speed-sensitive steering, lateral grip that drops when
  handbraking (drifting) or driving on grass, and a soft barrier that nudges
  you back toward the road if you stray far.
- **AI drivers** — follow the spline with a precomputed per-segment target
  speed table (slow into corners via backward braking passes), lane weaving,
  per-driver skill, and mild rubber-banding to keep the race close.
- **Race logic** — countdown start, lap counting via start-line crossings
  with an anti-cheat halfway checkpoint, live position ranking, lap/best
  timing, wrong-way warning, and a results screen.
- **Presentation** — chase/hood/overhead cameras with speed-reactive FOV,
  sun shadows that follow the car, instanced trees, procedural clouds and
  mountains, a grandstand with a colorful crowd, a live minimap, and a
  WebAudio synthesized engine note pitched to your speed.

No dependencies beyond the vendored `three.module.js` (r160, MIT).
