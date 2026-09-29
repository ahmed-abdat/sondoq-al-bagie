import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { dayDate, fmt, isGone, MONTHS } from "@/components/app/derive";
import * as src from "@/components/app/source";

// Link preview for a pasted /report link (WhatsApp shows it as a rich card).
export const alt = "ملخص صندوق الرابطة: ما في الصندوق الآن ومن دفع رسوم هذا الشهر";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

/** Arabic TTF subset for exactly the text drawn (Google Fonts serves TTF to plain fetches). */
async function font(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}${text ? "" : ""}`,
      )
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * The image renderer has no bidi: Arabic letters join, but words run left to right. Lay each
 * line out word by word from the right (row-reverse), so the sentence reads correctly.
 */
function Rtl({ text, style }: { text: string; style?: React.CSSProperties }) {
  // one text run (so joined letters keep their real width), words in reverse order
  return <div style={{ display: "flex", ...style }}>{text.split(/\s+/).reverse().join(" ")}</div>;
}

export default async function Image() {
  const [summary, members, months] = await Promise.all([
    src.fundSummary(),
    src.members(),
    src.memberMonths(),
  ]);
  const today = src.today();
  const month = today.getUTCMonth() + 1;
  const active = members.filter((m) => m.status === "active" && !isGone(m.status));
  const paid = new Set(
    months.filter((x) => x.month === month && x.state === "paid").map((x) => x.memberId),
  );
  const paidCount = active.filter((m) => paid.has(m.memberId)).length;

  const title = "صندوق الرابطة";
  const sub = "رابطة شباب قرية البقيع";
  const label = "في الصندوق الآن";
  const amount = fmt(summary.balance).replace(/ /g, " ");
  const unit = "أوقية";
  const line = `${paidCount} من ${active.length} دفعوا رسوم ${MONTHS[month - 1]}`;
  const date = `حتى ${dayDate(today)}`;
  const all = [title, sub, label, amount, unit, line, date, "0123456789 "].join("");

  const [bold, regular, logo] = await Promise.all([
    font("Alexandria", 700, all),
    font("Alexandria", 400, all),
    readFile(join(process.cwd(), "public/logo.jpg")),
  ]);
  const logoSrc = `data:image/jpeg;base64,${logo.toString("base64")}`;
  const fonts = [
    ...(bold
      ? [{ name: "Alexandria", data: bold, weight: 700 as const, style: "normal" as const }]
      : []),
    ...(regular
      ? [{ name: "Noto", data: regular, weight: 400 as const, style: "normal" as const }]
      : []),
  ];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "flex-end",
        padding: "56px 72px",
        background: "#237A3B",
        color: "#fff",
        fontFamily: "Noto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 28 }}>
        <img
          src={logoSrc}
          width={112}
          height={112}
          alt=""
          style={{ borderRadius: 999, border: "5px solid #fff", boxShadow: "0 0 0 5px #D9AA2B" }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <Rtl text={title} style={{ fontFamily: "Alexandria", fontSize: 56, fontWeight: 700 }} />
          <Rtl text={sub} style={{ fontSize: 30, color: "#EEF5EF" }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <Rtl text={label} style={{ fontSize: 36, color: "#EEF5EF" }} />
        <div
          style={{ display: "flex", flexDirection: "row-reverse", alignItems: "baseline", gap: 24 }}
        >
          <div style={{ fontFamily: "Alexandria", fontSize: 140, fontWeight: 700 }}>{amount}</div>
          <Rtl text={unit} style={{ fontSize: 46, color: "#EEF5EF" }} />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row-reverse",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Rtl text={line} style={{ fontFamily: "Alexandria", fontWeight: 700, fontSize: 34 }} />
        <Rtl text={date} style={{ color: "#EEF5EF", fontSize: 28 }} />
      </div>
    </div>,
    { ...size, fonts },
  );
}
