// input.js — keyboard state for the flight game.
// W/S pitch, A/D roll, Shift/Ctrl (or T/G) throttle, C camera, R restart,
// P pause, M mute, 1/2/3 choose a mission. Arrow keys mirror W/S/A/D.

export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since last consume
  const input = {
    keys,
    attach() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
    down(code) { return keys.has(code); },
    // True once for the frame the key was pressed.
    consume(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
    // Flight controls for this frame: pitch/roll in [-1, 1], throttle delta.
    // W climbs, S descends (arcade convention: W is "up"), A/D roll.
    flightControls() {
      const pitch = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0)
        - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
      const roll = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
        - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
      const throttleDelta = (this.down('ShiftLeft') || this.down('ShiftRight') || this.down('KeyT') ? 1 : 0)
        - (this.down('ControlLeft') || this.down('ControlRight') || this.down('KeyG') ? 1 : 0);
      return { pitch, roll, throttleDelta };
    },
  };
  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onBlur() { keys.clear(); pressed.clear(); }
  return input;
}
