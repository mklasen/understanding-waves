# Understanding Waves

An interactive field guide to ocean waves and tides — live at
https://understanding-waves.helios.users.ctx7.dev

Eight chapters: superposition ("never the same wave twice"), the wind's three ingredients,
energy vs water (orbits), swell dispersion, tides (Moon & Sun), the beach (shoaling, breaking,
tide), capillary ripples, and a waves-vs-tides summary.

- Static site in `site/` (vanilla ES modules, raw WebGL with a Canvas2D fallback, no build step).
- `docker compose up -d` serves it with nginx; `site/` is bind-mounted, so edits are live.
- Physics model, simplifications and next steps: [DECISIONS.md](DECISIONS.md).
