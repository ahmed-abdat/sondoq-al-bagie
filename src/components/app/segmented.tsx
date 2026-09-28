"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { prefersReduced } from "./num";

/** Filled track + ONE sliding indicator, moved by clip-path (no width/left animation). */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { k: T; l: ReactNode }[];
  value: T;
  onChange: (k: T) => void;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const place = () => {
      const w = inner.current;
      const i = ind.current;
      const on = w?.querySelector<HTMLElement>("[aria-pressed=true]");
      if (!w || !i || !on) return;
      const l = on.offsetLeft;
      const r = w.offsetWidth - l - on.offsetWidth;
      i.style.clipPath = `inset(0 ${r}px 0 ${l}px round 999px)`;
      w.dataset.ready = "";
      const t = track.current;
      if (t) t.dataset.over = t.scrollWidth > t.clientWidth + 1 ? "true" : "false";
    };
    place();
    // scroll only the chip row, horizontally — never the page; skip on mount
    const on = inner.current?.querySelector<HTMLElement>("[aria-pressed=true]");
    const t = track.current;
    if (mounted.current && on && t && t.scrollWidth > t.clientWidth) {
      t.scrollTo({
        left: on.offsetLeft - (t.clientWidth - on.offsetWidth) / 2,
        behavior: prefersReduced() ? "auto" : "smooth",
      });
    }
    mounted.current = true;
    const ro = new ResizeObserver(place);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [value]);
  return (
    <div className="bq-seg" ref={track}>
      <div className="bq-seg-in" role="group" aria-label={label} ref={inner}>
        <span className="bq-seg-ind" ref={ind} aria-hidden="true" />
        {items.map((it) => (
          <button
            key={it.k}
            type="button"
            className="bq-seg-b bq-press"
            aria-pressed={value === it.k}
            onClick={() => onChange(it.k)}
          >
            {it.l}
          </button>
        ))}
      </div>
    </div>
  );
}
