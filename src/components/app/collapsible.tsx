"use client";
import { useState, type ReactNode } from "react";
import { I } from "./icons";

/** A report section: tap the heading to open or close it. Always open when printed. */
export function Collapsible({
  title,
  count,
  open: initial = false,
  children,
}: {
  title: string;
  count?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={`rp-coll ${open ? "is-open" : ""}`}>
      <h2>
        <button
          type="button"
          className="rp-coll-h bq-press"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span>{title}</span>
          {count !== undefined && <span className="bq-group-n">{count}</span>}
          <span className="rp-coll-i">{I.chev(20)}</span>
        </button>
      </h2>
      <div className="rp-coll-body">{children}</div>
    </section>
  );
}
