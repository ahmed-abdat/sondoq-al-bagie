"use client";
// Bottom sheet (centred dialog on desktop): transition-driven, interruptible, drag to dismiss
// with velocity and a rubber-band pull-up. Optional shared-element morph from the tapped row.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { I } from "./icons";
import { prefersReduced } from "./num";

type VT = { finished: Promise<void> };
type VTDoc = Document & { startViewTransition?: (cb: () => void) => VT };
export const canVT = () =>
  typeof document !== "undefined" && !!(document as VTDoc).startViewTransition && !prefersReduced();
export const startVT = (cb: () => void) => (document as VTDoc).startViewTransition!(cb);

/**
 * State for one sheet at a time, with the morph: `open(value, from, name)` names the source
 * element (e.g. the avatar) so it grows into the sheet; `close()` morphs back when it can.
 */
export function useSheet<T>() {
  const [state, setState] = useState<{ value: T; vt: boolean; name?: string } | null>(null);
  const src = useRef<HTMLElement | null>(null);
  const open = useCallback((value: T, from?: HTMLElement | null, name?: string) => {
    src.current = from ?? null;
    if (from && name && canVT()) {
      from.style.viewTransitionName = name;
      startVT(() => {
        from.style.viewTransitionName = "";
        flushSync(() => setState({ value, vt: true, name }));
      });
    } else setState({ value, vt: false });
  }, []);
  const done = useCallback(() => setState(null), []);
  /** Returns true when it handled the close with a morph back to the source. */
  const tryVTClose = useCallback(() => {
    const el = src.current;
    if (!state?.vt || !state.name || !el?.isConnected || !canVT()) return false;
    const name = state.name;
    const vt = startVT(() => {
      flushSync(() => setState(null));
      el.style.viewTransitionName = name;
    });
    vt.finished.finally(() => (el.style.viewTransitionName = ""));
    return true;
  }, [state]);
  return { state, open, done, tryVTClose };
}

export function Sheet({
  label,
  vt = false,
  onDone,
  tryVTClose = () => false,
  children,
}: {
  label: string;
  vt?: boolean;
  onDone: () => void;
  tryVTClose?: () => boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(vt);
  const ref = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number; pts: { t: number; y: number }[] } | null>(null);
  const closing = useRef(false);
  const close = (viaDrag = false) => {
    if (closing.current) return;
    closing.current = true;
    if (!viaDrag && tryVTClose()) return;
    setOpen(false);
    window.setTimeout(onDone, prefersReduced() ? 160 : 230);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    // keep the view-transition snapshot cheap: layout + focus on the next frame
    const raf = requestAnimationFrame(() => {
      setOpen(true);
      document.body.style.overflow = "hidden";
      ref.current?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      // keep Tab inside the sheet (it is modal)
      if (e.key !== "Tab" || !ref.current) return;
      const f = [
        ...ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,textarea,select,label")) return;
    drag.current = { y0: e.clientY, dy: 0, pts: [{ t: e.timeStamp, y: e.clientY }] };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
    if (scrim.current) scrim.current.style.transition = "none";
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const raw = e.clientY - d.y0;
    d.dy = raw > 0 ? raw : -Math.sqrt(-raw) * 2; // rubber-band when pulled up
    d.pts.push({ t: e.timeStamp, y: e.clientY });
    while (d.pts.length > 2 && e.timeStamp - d.pts[0].t > 100) d.pts.shift();
    el.style.transform = `translateY(${d.dy}px)`;
    if (scrim.current)
      scrim.current.style.opacity = String(Math.max(0, 1 - Math.max(0, d.dy) / el.offsetHeight));
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    const first = d.pts[0];
    const idle = e.timeStamp - d.pts[d.pts.length - 1].t;
    const v = idle > 100 ? 0 : (e.clientY - first.y) / Math.max(1, e.timeStamp - first.t);
    el.style.transition = "";
    el.style.transform = "";
    if (scrim.current) {
      scrim.current.style.transition = "";
      scrim.current.style.opacity = "";
    }
    if (d.dy > 110 || v > 0.11) close(true);
  };
  return (
    <div className="bq-sheet-wrap" data-open={open}>
      <div
        className="bq-scrim"
        ref={scrim}
        onClick={() => close()}
        style={{ viewTransitionName: vt ? "bq-scrim" : undefined }}
      />
      <div
        className="bq-sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ viewTransitionName: vt ? "bq-sheet" : undefined }}
      >
        <div
          className="bq-drag"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <span className="bq-handle" aria-hidden="true" />
          <button
            type="button"
            className="bq-icon-btn bq-sheet-x bq-press"
            onClick={() => close()}
            aria-label="إغلاق"
          >
            {I.x(22)}
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
