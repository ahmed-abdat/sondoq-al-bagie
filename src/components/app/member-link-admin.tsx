"use client";
// «رابط العضو» in the committee's member sheet: create a personal link (shown once, sent on
// WhatsApp), replace it (the old one stops) or stop it. The server keeps only a hash.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { failure } from "@/lib/data/errors";
import type { MemberAdmin } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { dayWords, relativeAgo } from "./derive";
import { copyText, ManualCopy } from "./copy";
import { I } from "./icons";
import { useAct } from "./act";
import type { MemberLinkInfo } from "@/lib/data/member-types";
import { useNow } from "./num";

/** «آخر استخدام قبل 3 أيام» / «آخر استخدام أمس» / «لم يُستخدم بعد». */
export function lastUsedLabel(lastUsedAt: string | null, now: Date) {
  if (!lastUsedAt) return "لم يُستخدم بعد";
  const r = relativeAgo(lastUsedAt, now);
  return r.startsWith("منذ ") ? `آخر استخدام قبل ${r.slice(4)}` : `آخر استخدام ${r}`;
}

/** The WhatsApp message: the link alone on its line so copying it gives exactly the link. */
export function linkMessage(name: string, url: string) {
  return [
    `السلام عليكم ${name}،`,
    "هذا رابطك الخاص في صندوق الرابطة:",
    url,
    "افتحه لترى رسومك وترسل صورة دفعتك إلى اللجنة. لا ترسله لغيرك.",
  ].join("\n");
}

type Mode = "view" | "new" | "stop" | { url: string };

export function MemberLinkSection({
  m,
  link,
}: {
  m: Pick<MemberAdmin, "memberId" | "fullName" | "phone" | "status">;
  /** the active link, or null */
  link: MemberLinkInfo | null;
}) {
  const router = useRouter();
  const online = useOnline();
  const now = useNow();
  const { createMemberLink, revokeMemberLink } = useAct();
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<"copied" | "manual" | null>(null);

  const run = async (f: () => ReturnType<typeof revokeMemberLink>, then: () => void) => {
    setBusy(true);
    setErr("");
    const r = await f()
      .catch(() => failure("network"))
      .finally(() => setBusy(false));
    if (!r.ok) return setErr(r.message);
    then();
    router.refresh();
  };
  const create = () =>
    run(
      async () => {
        const r = await createMemberLink({ memberId: m.memberId });
        if (r.ok) setMode({ url: r.data.url });
        return r.ok ? { ok: true as const, data: undefined } : r;
      },
      () => {},
    );

  if (typeof mode === "object") {
    const text = linkMessage(m.fullName, mode.url);
    return (
      <section className="bq-mlink" aria-labelledby="bq-mlink-h">
        <h3 id="bq-mlink-h" className="bq-rec-k">
          رابط العضو
        </h3>
        <p className="bq-lead">أرسله إلى {m.fullName} الآن.</p>
        <p className="bq-mlink-url">
          <bdi dir="ltr" className="bq-num">
            {mode.url}
          </bdi>
        </p>
        <p className="bq-alert" role="note">
          لن يظهر الرابط مرة أخرى. أرسله أو انسخه قبل الإغلاق.
        </p>
        <div className="bq-btn-col bq-small-top">
          <a
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            href={waLink(m.phone, text)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {I.wa(22)} افتح الرسالة في واتساب
          </a>
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            onClick={async () => setCopied(await copyText(text))}
          >
            {copied === "copied" ? I.check(20) : I.copy(20)}{" "}
            {copied === "copied" ? "نُسخت الرسالة" : "نسخ الرسالة"}
          </button>
          {copied === "manual" && <ManualCopy text={text} label="انسخ الرسالة يدويًا" />}
          <button
            type="button"
            className="bq-btn bq-btn-ghost bq-press"
            onClick={() => {
              setMode("view");
              setCopied(null);
            }}
          >
            تم
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bq-mlink" aria-labelledby="bq-mlink-h">
      <h3 id="bq-mlink-h" className="bq-rec-k">
        رابط العضو
      </h3>
      {link ? (
        <p className="bq-mline">
          {I.check(18)} له رابط يعمل منذ {dayWords(link.createdAt)}
          <span className="bq-row-s">{now ? lastUsedLabel(link.lastUsedAt, now) : ""}</span>
        </p>
      ) : (
        <p className="bq-hint">
          لا رابط له بعد. الرابط يفتح له التطبيق باسمه، فيرى رسومه ويرسل صورة دفعته لتؤكدها اللجنة.
        </p>
      )}

      {mode === "view" &&
        (link ? (
          <div className="bq-slip-btns">
            <button
              type="button"
              className="bq-btn bq-btn-soft bq-press"
              onClick={() => setMode("new")}
            >
              رابط جديد
            </button>
            <button
              type="button"
              className="bq-btn bq-btn-tonal bq-press"
              onClick={() => setMode("stop")}
            >
              إيقاف الرابط
            </button>
          </div>
        ) : (
          m.status === "active" && (
            <button
              type="button"
              className="bq-btn bq-btn-soft bq-press"
              disabled={busy || !online}
              onClick={() => void create()}
            >
              {busy ? "جارٍ الإنشاء…" : "إنشاء رابط"}
            </button>
          )
        ))}

      {mode === "new" && (
        <div className="bq-rej">
          <p className="bq-lead">يتوقف الرابط القديم فورًا، ويعمل الجديد وحده.</p>
          <div className="bq-slip-btns">
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              disabled={busy || !online}
              onClick={() => void create()}
            >
              {busy ? "جارٍ الإنشاء…" : "أنشئ رابطًا جديدًا"}
            </button>
            <button
              type="button"
              className="bq-btn bq-btn-ghost bq-press"
              onClick={() => setMode("view")}
            >
              رجوع
            </button>
          </div>
        </div>
      )}
      {mode === "stop" && (
        <div className="bq-rej">
          <p className="bq-lead">
            لن يعمل رابط {m.fullName} بعد الآن، على كل أجهزته. يمكنك إنشاء رابط جديد متى شئت.
          </p>
          <div className="bq-slip-btns">
            <button
              type="button"
              className="bq-btn bq-btn-tonal bq-press"
              disabled={busy || !online}
              onClick={() =>
                void run(
                  () => revokeMemberLink({ memberId: m.memberId }),
                  () => setMode("view"),
                )
              }
            >
              {busy ? "جارٍ الإيقاف…" : "نعم، أوقفه"}
            </button>
            <button
              type="button"
              className="bq-btn bq-btn-ghost bq-press"
              onClick={() => setMode("view")}
            >
              رجوع
            </button>
          </div>
        </div>
      )}
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <OfflineWriteHint />
    </section>
  );
}
