"use client";

import { useEffect, useRef } from "react";

/**
 * Remote-control input layer for the 10-foot UI.
 *
 * Supports both input styles of an air mouse remote:
 *  - D-pad mode: arrow keys move focus spatially, OK/Enter activates.
 *  - Pointer mode: the gyro cursor focuses whatever it hovers, so switching
 *    back to the D-pad continues from where the cursor was.
 *
 * Focus is confined to the top-most element marked `data-tv-layer`
 * (player, dialogs), so the D-pad never lands on content hidden underneath.
 */

type Direction = "up" | "down" | "left" | "right";

interface TVNavigationOptions {
  containerRef?: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Called on Back when no `useTVBackHandler` is registered. */
  onBack?: () => void;
  onHome?: () => void;
  onMenu?: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [data-tv-nav="true"]';

const BACK_KEYS = new Set(["Escape", "Backspace", "BrowserBack", "GoBack", "Back"]);
const HOME_KEYS = new Set(["BrowserHome", "Home", "GoHome"]);
const MIC_KEYS = new Set(["BrowserSearch", "v", "V"]);
const PAGE_DOWN_KEYS = new Set(["PageDown", "ChannelDown"]);
const PAGE_UP_KEYS = new Set(["PageUp", "ChannelUp"]);
const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** One physical Back press can arrive as several events (key + popstate, mouse + contextmenu). */
const BACK_DEDUPE_MS = 400;
/** Gyro mice jitter; ignore movement below this many pixels before entering pointer mode. */
const POINTER_MOVE_THRESHOLD_PX = 12;
const CURSOR_IDLE_HIDE_MS = 4000;

// Stack of back handlers: the most recently registered (top-most UI) wins.
const backHandlerStack: Array<React.MutableRefObject<() => void>> = [];

/** Registers a Back handler while `active` (e.g. a dialog that should close on Back). */
export function useTVBackHandler(handler: () => void, active = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    backHandlerStack.push(handlerRef);
    return () => {
      const index = backHandlerStack.lastIndexOf(handlerRef);
      if (index >= 0) backHandlerStack.splice(index, 1);
    };
  }, [active]);
}

export function getActiveLayer(fallback?: HTMLElement | null): HTMLElement {
  const layers = document.querySelectorAll<HTMLElement>("[data-tv-layer]");
  return layers[layers.length - 1] || fallback || document.body;
}

function isVisible(el: HTMLElement) {
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return el.offsetParent !== null || style.position === "fixed";
}

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      el.tabIndex !== -1 &&
      !(el as HTMLButtonElement).disabled &&
      !el.hasAttribute("data-tv-skip") &&
      isVisible(el)
  );
}

export function focusElement(el: HTMLElement | null | undefined, scroll = true) {
  if (!el) return;
  el.focus({ preventScroll: true });
  if (scroll) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

/** Focuses the layer's preferred element (`data-tv-autofocus`), else its first focusable. */
export function focusFirstIn(root: HTMLElement) {
  const preferred = root.querySelector<HTMLElement>("[data-tv-autofocus]");
  if (preferred && isVisible(preferred)) {
    focusElement(preferred);
    return;
  }
  focusElement(getFocusableElements(root)[0]);
}

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return ["text", "search", "url", "email", "number", "password", "tel"].includes(type);
}

/** Lets the D-pad leave a text field once the caret is at the edge in that direction. */
function canLeaveTextField(field: HTMLInputElement | HTMLTextAreaElement, direction: Direction) {
  const isTextarea = field.tagName === "TEXTAREA";
  if (!isTextarea && (direction === "up" || direction === "down")) return true;

  let start: number | null = null;
  let end: number | null = null;
  try {
    start = field.selectionStart;
    end = field.selectionEnd;
  } catch {
    return true; // input types without selection support
  }
  if (start === null || end === null) return true;
  if (start !== end) return false;
  const atStart = start === 0;
  const atEnd = end === field.value.length;
  return direction === "up" || direction === "left" ? atStart : atEnd;
}

/** Scores how good `to` is as the next focus target from `from` in `direction` (lower is better). */
function spatialScore(direction: Direction, from: DOMRect, to: DOMRect): number {
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  const toCx = to.left + to.width / 2;
  const toCy = to.top + to.height / 2;

  const vertical = direction === "up" || direction === "down";
  const forward =
    direction === "down" ? toCy - fromCy :
    direction === "up" ? fromCy - toCy :
    direction === "right" ? toCx - fromCx :
    fromCx - toCx;
  if (forward <= 4) return Infinity;

  const edgeGap = Math.max(
    0,
    direction === "down" ? to.top - from.bottom :
    direction === "up" ? from.top - to.bottom :
    direction === "right" ? to.left - from.right :
    from.left - to.right
  );

  // Distance between the two boxes on the cross axis (0 when they overlap).
  const crossGap = vertical
    ? Math.max(0, Math.max(from.left, to.left) - Math.min(from.right, to.right))
    : Math.max(0, Math.max(from.top, to.top) - Math.min(from.bottom, to.bottom));
  const crossCenterOffset = vertical ? Math.abs(toCx - fromCx) : Math.abs(toCy - fromCy);

  return edgeGap + crossGap * 3 + crossCenterOffset * 0.15;
}

function findScrollContainer(from: Element | null, layer: HTMLElement): HTMLElement | null {
  let el = from instanceof HTMLElement ? from.parentElement : null;
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return layer.querySelector<HTMLElement>("[data-tv-scroll]");
}

export function useTVRemoteNavigation({
  containerRef,
  enabled = true,
  onBack,
  onHome,
  onMenu,
}: TVNavigationOptions = {}) {
  // Keep callbacks in a ref so listeners are attached once, not on every render.
  const optionsRef = useRef({ containerRef, onBack, onHome, onMenu });
  optionsRef.current = { containerRef, onBack, onHome, onMenu };

  useEffect(() => {
    if (!enabled) return;

    const body = document.body;
    let lastBackAt = 0;
    let pointerMode = false;
    let pointerTravel = 0;
    let lastPointer: { x: number; y: number } | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const layer = () => getActiveLayer(optionsRef.current.containerRef?.current);

    const triggerBack = () => {
      const now = Date.now();
      if (now - lastBackAt < BACK_DEDUPE_MS) return;
      lastBackAt = now;
      const top = backHandlerStack[backHandlerStack.length - 1];
      if (top) top.current();
      else optionsRef.current.onBack?.();
    };

    const hideCursor = () => {
      body.classList.add("tv-cursor-hidden");
      pointerMode = false;
      pointerTravel = 0;
    };

    const moveFocus = (direction: Direction) => {
      const root = layer();
      const focusables = getFocusableElements(root);
      if (focusables.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      if (!active || active === body || !root.contains(active)) {
        focusFirstIn(root);
        return;
      }

      const fromRect = active.getBoundingClientRect();
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const el of focusables) {
        if (el === active || el.contains(active) || active.contains(el)) continue;
        const score = spatialScore(direction, fromRect, el.getBoundingClientRect());
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) focusElement(best);
    };

    const scrollPage = (dir: 1 | -1) => {
      const root = layer();
      const container = findScrollContainer(document.activeElement, root);
      if (!container) return;
      container.scrollBy({ top: dir * container.clientHeight * 0.8, behavior: "auto" });

      // Move focus onto the first element now visible, so the next arrow press continues from there.
      const bounds = container.getBoundingClientRect();
      const firstVisible = getFocusableElements(container).find((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= bounds.top && r.bottom <= bounds.bottom;
      });
      focusElement(firstVisible, false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      hideCursor();

      const target = document.activeElement;
      const direction = ARROW_DIRECTIONS[e.key];

      if (e.altKey) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          triggerBack();
        }
        return;
      }

      if (isTextField(target)) {
        if (e.key === "Escape" || e.key === "BrowserBack" || e.key === "GoBack") {
          e.preventDefault();
          target.blur();
          return;
        }
        if (direction && canLeaveTextField(target, direction)) {
          e.preventDefault();
          moveFocus(direction);
        }
        return;
      }

      if (direction) {
        e.preventDefault();
        moveFocus(direction);
        return;
      }

      if (BACK_KEYS.has(e.key)) {
        e.preventDefault();
        triggerBack();
        return;
      }

      if (HOME_KEYS.has(e.key)) {
        e.preventDefault();
        optionsRef.current.onHome?.();
        return;
      }

      if (e.key === "ContextMenu") {
        e.preventDefault();
        optionsRef.current.onMenu?.();
        return;
      }

      if (PAGE_DOWN_KEYS.has(e.key) || PAGE_UP_KEYS.has(e.key)) {
        e.preventDefault();
        scrollPage(PAGE_DOWN_KEYS.has(e.key) ? 1 : -1);
        return;
      }

      if (MIC_KEYS.has(e.key)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("tv-toggle-mic"));
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (lastPointer) {
        pointerTravel += Math.abs(e.clientX - lastPointer.x) + Math.abs(e.clientY - lastPointer.y);
      }
      lastPointer = { x: e.clientX, y: e.clientY };

      if (!pointerMode) {
        if (pointerTravel < POINTER_MOVE_THRESHOLD_PX) return;
        pointerMode = true;
        body.classList.remove("tv-cursor-hidden");
      }

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(hideCursor, CURSOR_IDLE_HIDE_MS);

      // Focus follows the pointer so the highlight is always in one place.
      const hovered = (e.target as Element | null)?.closest?.<HTMLElement>(FOCUSABLE_SELECTOR);
      if (
        hovered &&
        hovered !== document.activeElement &&
        !isTextField(hovered) &&
        !isTextField(document.activeElement) &&
        layer().contains(hovered)
      ) {
        hovered.focus({ preventScroll: true });
      }
    };

    // The air mouse "back" button is usually a right-click.
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerBack();
    };

    // Mouse side button (XButton1) = back. Suppress the browser's own navigation.
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        if (e.button === 3) triggerBack();
      }
    };

    // Trap browser history so Back never leaves the kiosk.
    try {
      window.history.pushState({ tvKiosk: true }, "", window.location.href);
    } catch {}
    const handlePopState = () => {
      try {
        window.history.pushState({ tvKiosk: true }, "", window.location.href);
      } catch {}
      triggerBack();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("popstate", handlePopState);

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      body.classList.remove("tv-cursor-hidden");
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [enabled]);
}
