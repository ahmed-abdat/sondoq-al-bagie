"use client";
// Bottom sheet on phones (Base UI Drawer: swipe down to dismiss, nested sheets stack), a centred
// dialog on desktop (Base UI Dialog). Both give focus trap and return, Escape, scroll lock and an
// inert background. Optional shared-element morph from the tapped row (view transitions).
import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
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

const DESKTOP = "(min-width: 1024px)";
function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/**
 * Mount it to open, unmount it (in `onDone`) after it closes. `label` names the dialog for screen
 * readers (the visible heading stays in `children`); `description` is optional.
 */
export function Sheet({
  label,
  description,
  vt = false,
  onDone,
  tryVTClose = () => false,
  children,
}: {
  label: string;
  description?: string;
  vt?: boolean;
  onDone: () => void;
  tryVTClose?: () => boolean;
  children: ReactNode;
}) {
  const desktop = useDesktop();
  const [open, setOpen] = useState(true);
  const closing = useRef(false);
  const popup = useRef<HTMLDivElement>(null);
  // focus the sheet itself (screen readers read its title), unless a field inside took focus
  // with autoFocus; Base UI's default would land on «إغلاق»
  const initialFocus = () => {
    const el = popup.current;
    const a = document.activeElement;
    return el && a instanceof HTMLElement && a !== el && el.contains(a) ? a : el;
  };
  const change = (next: boolean) => {
    if (next || closing.current) return;
    closing.current = true;
    // morph back into the row it came from; the caller unmounts the sheet itself
    if (tryVTClose()) return;
    setOpen(false);
  };
  const complete = (isOpen: boolean) => {
    if (!isOpen) onDone();
  };
  const scrimStyle: CSSProperties = { viewTransitionName: vt ? "bq-scrim" : undefined };
  const sheetStyle: CSSProperties = { viewTransitionName: vt ? "bq-sheet" : undefined };
  const inner = (title: ReactNode) => (
    <div className="bq-drag">
      <span className="bq-handle" aria-hidden="true" />
      <button
        type="button"
        className="bq-icon-btn bq-sheet-x bq-press"
        onClick={() => change(false)}
        aria-label="إغلاق"
      >
        {I.x(22)}
      </button>
      {title}
      {children}
    </div>
  );

  if (desktop)
    return (
      <Dialog.Root open={open} onOpenChange={change} onOpenChangeComplete={complete}>
        <Dialog.Portal>
          <Dialog.Backdrop className="bq-scrim" style={scrimStyle} />
          <Dialog.Viewport className="bq-sheet-vp is-dialog">
            <Dialog.Popup
              ref={popup}
              initialFocus={initialFocus}
              className={`bq-sheet is-dialog ${vt ? "is-vt" : ""}`}
              style={sheetStyle}
            >
              {inner(
                <>
                  <Dialog.Title className="bq-sr-only">{label}</Dialog.Title>
                  {description && (
                    <Dialog.Description className="bq-sr-only">{description}</Dialog.Description>
                  )}
                </>,
              )}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    );

  return (
    <Drawer.Root
      open={open}
      onOpenChange={change}
      onOpenChangeComplete={complete}
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="bq-scrim" style={scrimStyle} />
        <Drawer.Viewport className="bq-sheet-vp">
          <Drawer.Popup
            ref={popup}
            initialFocus={initialFocus}
            className={`bq-sheet ${vt ? "is-vt" : ""}`}
            style={sheetStyle}
          >
            <Drawer.Content className="bq-sheet-c">
              {inner(
                <>
                  <Drawer.Title className="bq-sr-only">{label}</Drawer.Title>
                  {description && (
                    <Drawer.Description className="bq-sr-only">{description}</Drawer.Description>
                  )}
                </>,
              )}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
