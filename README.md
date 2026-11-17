# SOLMAR HEAT

An original open-world crime game in the fictional coastal city of Solmar, built for
make.fun competition `gta6-01`. Everything in it — the city, characters, vehicles,
names, story, art, sound and music — is original. No real city, gang, person or brand
is depicted.

## Play

Serve `game/` and open it in a desktop browser (no network needed, everything is
local):

```sh
node serve.ts
# open http://localhost:8080
```

You are **Jax Marlow**, fresh out of the Solmar docks. Your friend **Mara Voss** has
five jobs for you: borrow a car, run a package, lose the cops, settle a score with
the Vipers, and one last getaway down Ocean Drive.

- **On foot**: WASD to walk, Shift to run, Space to jump, drag the mouse to look.
- **Cars**: press E near a parked car to borrow it; WASD to drive, Space is the
  handbrake, E again to get out.
- **Combat**: click or F to shoot, R to reload. Health packs (green crosses) heal you.
- **Wanted**: stealing cars, hitting pedestrians and shooting raise your wanted
  stars (1–5). Solmar PD cars chase and ram you; stay out of sight and the heat
  fades, or press H to lay low.
- **Missions**: follow the yellow beacon and the objective line; the minimap shows
  you, traffic, police (blue) and the mission marker (yellow).
- **Save**: pause with Esc to save (localStorage), restart a mission, or quit to title.
- **Sound**: fully synthesized with WebAudio — engine hum, sirens, gunshots, a bass
  loop. M mutes.

## Tech

- Three.js r160, vendored as a single `game/vendor/three.min.js`, loaded via import map.
- Plain static files under `game/`; `game/index.html` is the entry point.
- `main.ts` (Node 22, stdlib only) copies `game/` + `screenshots/` to `/output` and
  writes `/output/dossier.json` via the vendored make.fun library.
- Screenshots are staged deterministically with `?shot=title|driving|police|mission&seed=1`
  (see `game/src/shots.js` and `shots.json`).
- Round 2 polish: traffic cars pause at intersections, enemies keep a fighting
  range and strafe while firing in bursts, and gunfire tracers linger in
  screenshot mode so the mission shot shows the firefight.

## License

MIT — see `LICENSE`.
