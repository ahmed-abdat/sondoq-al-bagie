// One icon family: 24px grid, 1.5 stroke, round caps. Decorative (aria-hidden); pair with words.
import type { ReactNode } from "react";

function Ico({
  children,
  size = 24,
  className,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}
const tray = <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />;
export const I = {
  home: (s?: number) => (
    <Ico size={s}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </Ico>
  ),
  people: (s?: number) => (
    <Ico size={s}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.8.7 3 2.3 3.5 4.7" />
    </Ico>
  ),
  book: (s?: number) => (
    <Ico size={s}>
      <path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z" />
      <path d="M5 18a2 2 0 0 1 2-2h11.5" />
      <path d="M9 8.5h6M9 11.5h4" />
    </Ico>
  ),
  heart: (s?: number) => (
    <Ico size={s}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
    </Ico>
  ),
  coins: (s?: number) => (
    <Ico size={s}>
      <ellipse cx="12" cy="7" rx="6.5" ry="2.8" />
      <path d="M5.5 7v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8V7" />
      <path d="M5.5 12v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5" />
    </Ico>
  ),
  bag: (s?: number) => (
    <Ico size={s}>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </Ico>
  ),
  copy: (s?: number) => (
    <Ico size={s}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </Ico>
  ),
  calendar: (s?: number) => (
    <Ico size={s}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </Ico>
  ),
  lock: (s?: number) => (
    <Ico size={s}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <path d="M12 14.5v2" />
    </Ico>
  ),
  search: (s?: number) => (
    <Ico size={s}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Ico>
  ),
  x: (s?: number) => (
    <Ico size={s}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Ico>
  ),
  check: (s?: number) => (
    <Ico size={s}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Ico>
  ),
  clock: (s?: number) => (
    <Ico size={s}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Ico>
  ),
  in: (s?: number) => (
    <Ico size={s}>
      <path d="M12 4v10" />
      <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
      {tray}
    </Ico>
  ),
  out: (s?: number) => (
    <Ico size={s}>
      <path d="M12 14V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      {tray}
    </Ico>
  ),
  ban: (s?: number) => (
    <Ico size={s}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </Ico>
  ),
  plus: (s?: number) => (
    <Ico size={s}>
      <path d="M12 5v14M5 12h14" />
    </Ico>
  ),
  chev: (s?: number) => (
    <Ico size={s}>
      <path d="m6 9.5 6 6 6-6" />
    </Ico>
  ),
  back: (s?: number) => (
    <Ico size={s}>
      <path d="m9.5 6 6 6-6 6" />
    </Ico>
  ),
  phone: (s?: number) => (
    <Ico size={s}>
      <path d="M6.5 4h3l1.5 4-2 1.2a10 10 0 0 0 4.8 4.8L15 12l4 1.5v3A2 2 0 0 1 17 18.5 13.5 13.5 0 0 1 4.5 7 2 2 0 0 1 6.5 4z" />
    </Ico>
  ),
  go: (s?: number) => (
    <Ico size={s}>
      <path d="m14.5 6-6 6 6 6" />
    </Ico>
  ),
  image: (s?: number) => (
    <Ico size={s}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20 16-4.5-4.5L7 19" />
    </Ico>
  ),
  // mirrored for RTL: the arrow turns back toward the reading start (right)
  undo: (s?: number) => (
    <Ico size={s} className="bq-flip">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Ico>
  ),
  cash: (s?: number) => (
    <Ico size={s}>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M6.5 10v4M17.5 10v4" />
    </Ico>
  ),
  dots: (s?: number) => (
    <Ico size={s}>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </Ico>
  ),
  save: (s?: number) => (
    <Ico size={s}>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" />
    </Ico>
  ),
  expand: (s?: number) => (
    <Ico size={s}>
      <path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6" />
    </Ico>
  ),
  xc: (s?: number) => (
    <Ico size={s}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </Ico>
  ),
  out2: (s?: number) => (
    <Ico size={s}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8 6 12l4 4M6 12h9" />
    </Ico>
  ),
  wa: (s?: number) => (
    <Ico size={s}>
      <path d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6z" />
      <path d="M9.3 9.2c.2 2.3 2.4 4.6 5.3 5.3l1-1.2-1.8-.9-.8.8c-.9-.4-1.8-1.3-2.2-2.2l.8-.8-.9-1.8z" />
    </Ico>
  ),
};
