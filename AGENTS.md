# AGENTS.md

Rules for anyone (human or agent) who changes this repo.

## Project

**Divoká kola** — an arcade kart racer for children in the spirit of the 1994 DOS game Wacky Wheels,
rebuilt with modern 3D graphics. Plain JavaScript (ES modules) + [three.js](https://threejs.org/) r128,
served and built by Vite. No framework, no backend, no image or audio assets: every model, texture and
sound is generated in code.

The audience is children: characters must be cute and recognisable at a glance, **including from behind**
(the camera sits behind the kart), and sound must never be harsh, boomy or monotonous.

## Layout

| File                | What lives there                                                                   |
| ------------------- | ---------------------------------------------------------------------------------- |
| `index.html`        | HUD, menu, pause and results markup                                                |
| `src/styles.css`    | all styles; colours as custom properties on `:root`                                |
| `src/util.js`       | small helpers (`clamp`, `col`, `store`…)                                           |
| `src/render.js`     | renderer, scene, camera, sky, sun, `canvasTex`, material cache `std`, `mesh`       |
| `src/track.js`      | the circuit (spline, road, curbs, fences), scenery, track queries (`nearest`…)     |
| `src/characters.js` | the six animal drivers, their karts and menu portraits                             |
| `src/items.js`      | item boxes, hedgehog projectile, fireball, ice-cream hazard, HUD icons             |
| `src/hedgehogs.js`  | hedgehogs sitting on the road as ammo pickups, their activities and props         |
| `src/particles.js`  | pooled additive particles                                                          |
| `src/audio.js`      | Web Audio: synthesised engine, opponents' engines with doppler, wind, skid, sfx    |
| `src/main.js`       | game state, input, kart physics, AI, HUD, menu, main loop                          |

## Conventions

- **Code, comments and identifiers in English.** User-facing text (menu, HUD) in **Czech**.
- Colours in code go through `col(hex)` (sRGB → linear); canvas textures through `canvasTex`.
- Materials come from `std(hex, opts)` so identical materials are shared.
- `three` stays pinned at `0.128.0`. Newer versions changed colour management and removed
  `outputEncoding`; upgrading is a deliberate task of its own, not a side effect.
- Coordinates: a kart's forward vector is `(sin h, cos h)`; **increasing `h` turns left**.
  `S[i]` is the track's sideways vector (local +x of `trackFrame`).
- Keep the game runnable by opening the dev server — no build step may be required for play.

## Before handing work back

```
npm run lint
npm run build
```

Both must pass. Then play a race in the browser (`npm run dev`): a visual or audio change is verified
by looking and listening, not by reading the code.

## Commits

One change, one commit, message in Czech, a short description only.
