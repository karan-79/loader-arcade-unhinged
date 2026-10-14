// Prints the plugin's pixel sprites as JSON for build-assets.py, so the
// pictures are drawn from the same pixels the block styles use.
import { HERO_PALETTE, POSES } from '../hooks/hero'
import { DEFAULT_ROSTER } from '../hooks/rivals'
import { CHOPPER, CHOPPER_PALETTE, ROTOR_SHORT, TANK, TANK_PALETTE, TANK_TREADS } from '../hooks/shooter'

console.log(
  JSON.stringify({
    hero: { poses: POSES, palette: HERO_PALETTE },
    tank: { rows: TANK, treads: TANK_TREADS, palette: TANK_PALETTE },
    chopper: { rows: CHOPPER, rotorShort: ROTOR_SHORT, palette: CHOPPER_PALETTE },
    rivals: DEFAULT_ROSTER,
  }),
)
