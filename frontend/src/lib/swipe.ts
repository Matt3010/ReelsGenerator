const NARROW = '(max-width: 600px)';
const ENOUGH = 90;

/**
 * Su un telefono una finestra si spinge via col dito, invece di cercare la crocetta. Da gymlog.
 * Solo da in cima a quello che ha dentro, e mai da un campo o un tasto, che il dito lo vogliono per sé.
 */
export function swipeToClose(node: HTMLElement, onClose: () => void) {
  let startY = 0;
  let travelled = 0;
  let dragging = false;

  const settle = (animated: boolean) => {
    node.style.transition = animated ? 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)' : '';
    node.style.transform = '';
    if (animated) setTimeout(() => (node.style.transition = ''), 240);
  };

  const down = (event: PointerEvent) => {
    if (!window.matchMedia(NARROW).matches || event.button !== 0) return;
    // quello che sta sotto al dito ed è già sceso: il dito vuole risalirlo, non chiudere
    for (let el = event.target as HTMLElement | null; el && el !== node.parentElement; el = el.parentElement) {
      if (el.scrollTop > 0) return;
    }
    if ((event.target as HTMLElement).closest('input, textarea, select, button, a')) return;
    dragging = true;
    travelled = 0;
    startY = event.clientY;
  };

  const move = (event: PointerEvent) => {
    if (!dragging) return;
    travelled = Math.max(0, event.clientY - startY);
    if (travelled > 4) {
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        /* il dito se n'è già andato: la fine del gesto arriva lo stesso */
      }
    }
    node.style.transform = `translateY(${travelled}px)`;
  };

  const up = () => {
    if (!dragging) return;
    dragging = false;
    if (travelled > ENOUGH) {
      settle(false);
      onClose();
    } else {
      settle(true);
    }
  };

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);

  return {
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    },
  };
}
