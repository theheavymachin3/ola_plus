// Svelte action: call `down` when pressed and `up` when released, for mouse, touch, pen and
// keyboard (Space/Enter). The release is tracked on the window so letting go outside the
// button, losing focus or a cancelled touch can never leave something stuck on.
export interface HoldHandlers {
  down: () => void;
  up: () => void;
}

export function hold(node: HTMLElement, initial: HoldHandlers) {
  let handlers = initial;
  let active = false;
  let pointer = -1;

  function press() {
    if (active) return;
    active = true;
    handlers.down();
  }

  function release() {
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    pointer = -1;
    if (!active) return;
    active = false;
    handlers.up();
  }

  function onPointerEnd(e: PointerEvent) {
    if (e.pointerId === pointer) release();
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // no text selection or native drag while holding
    pointer = e.pointerId;
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    press();
  }

  const isKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';
  function onKeyDown(e: KeyboardEvent) {
    if (!isKey(e)) return;
    e.preventDefault();
    if (!e.repeat) press();
  }
  function onKeyUp(e: KeyboardEvent) {
    if (isKey(e)) release();
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('keydown', onKeyDown);
  node.addEventListener('keyup', onKeyUp);
  node.addEventListener('blur', release);

  return {
    update(next: HoldHandlers) {
      handlers = next;
    },
    destroy() {
      release();
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('keydown', onKeyDown);
      node.removeEventListener('keyup', onKeyUp);
      node.removeEventListener('blur', release);
    },
  };
}
