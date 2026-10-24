// Standard Gamepad mapping. Pure functions shared by the iframe and tests.
export const DEMO_PACE = Object.freeze({ movement: 0.25, turning: 0.25 });

// Apply once after keyboard, mouse and gamepad input have been composed.
// Only player locomotion changes; combat buttons and the simulation keep time.
export function applyDemoPace(cmd) {
  cmd.forwardmove = Math.trunc(cmd.forwardmove * DEMO_PACE.movement);
  cmd.sidemove = Math.trunc(cmd.sidemove * DEMO_PACE.movement);
  cmd.angleturn = Math.trunc(cmd.angleturn * DEMO_PACE.turning);
}

export function axis(value, deadzone = 0.18) {
  if (!Number.isFinite(value) || Math.abs(value) <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - deadzone) / (1 - deadzone));
}

export function readPad(pad) {
  const pressed = (i) => pad?.buttons?.[i]?.pressed === true || (pad?.buttons?.[i]?.value ?? 0) > 0.5;
  return {
    x: axis(pad?.axes?.[0]), y: axis(pad?.axes?.[1]), turn: axis(pad?.axes?.[2]),
    fire: pressed(7), use: pressed(0), run: pressed(6) || pressed(10),
    next: pressed(5), previous: pressed(4), menu: pressed(9), back: pressed(1),
    session: pressed(2), compare: pressed(3), cycle: pressed(8), fullscreen: pressed(11),
    up: pressed(12), down: pressed(13), left: pressed(14), right: pressed(15),
    accept: pressed(0),
  };
}

export function applyPad(cmd, pad) {
  const forward = pad.run ? 50 : 25;
  const side = pad.run ? 40 : 24;
  const clamp = (n) => Math.max(-50, Math.min(50, n));
  cmd.forwardmove = clamp(cmd.forwardmove + Math.round(-pad.y * forward));
  cmd.sidemove = clamp(cmd.sidemove + Math.round(pad.x * side));
  cmd.angleturn = ((cmd.angleturn - Math.round(pad.turn * 1280)) << 16) >> 16;
  if (pad.fire) cmd.buttons |= 1;
  if (pad.use) cmd.buttons |= 2;
}

export function rising(previous, current, key) {
  return current[key] === true && previous[key] !== true;
}
