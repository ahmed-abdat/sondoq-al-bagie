"use client";
// The first sign-in setup, one screen: your name, who you are in the members list (or «لست
// عضوًا»), a new password. Then the hub. The admin's link, when set, is kept and only shown.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct } from "../act";
import { memberLabel } from "../derive";
import { I } from "../icons";
import { LogoutButton } from "../logout";
import { MemberPick, PasswordField, PickedMember, type Pickable } from "../member-pick";
import { Sheet } from "../sheet";

export function SetupForm({
  name: initial,
  linked,
  members,
}: {
  name: string;
  linked: Pickable | null;
  members: Pickable[];
}) {
  const router = useRouter();
  const online = useOnline();
  const { completeSetup } = useAct();
  const [name, setName] = useState(initial);
  const [who, setWho] = useState<Pickable | "none" | null>(linked);
  const [picking, setPicking] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const member = who && who !== "none" ? who : null;
  const ok = name.trim().length > 1 && !!who && pw.length >= 8;
  return (
    <>
      <form
        className="bq-login"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          setErr("");
          const r = await completeSetup({
            displayName: name.trim(),
            memberId: member?.memberId ?? null,
            password: pw,
          });
          if (!r.ok) {
            setBusy(false);
            return setErr(r.message);
          }
          router.replace("/committee");
          router.refresh();
        }}
      >
        <div className="bq-gate">
          <h1 className="bq-gate-t">أهلًا بك في اللجنة</h1>
          <p className="bq-hint">ثلاثة أشياء، مرة واحدة فقط.</p>
        </div>

        <label>
          اسمك كما يراه أعضاء اللجنة
          <input
            className="bq-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="name"
          />
        </label>

        <fieldset className="bq-setup-who">
          <legend>من أنت في قائمة الأعضاء؟</legend>
          {linked ? (
            <>
              <PickedMember m={linked} />
              <p className="bq-hint">ربطك المسؤول بهذه العضوية.</p>
            </>
          ) : (
            <div className="bq-role-list" role="radiogroup" aria-label="عضويتك">
              <button
                type="button"
                role="radio"
                aria-checked={!!member}
                className="bq-role bq-press"
                onClick={() => setPicking(true)}
              >
                <span className="bq-role-dot" aria-hidden="true" />
                <span className="bq-role-t">
                  <strong>{member ? member.fullName : "أنا عضو في الصندوق"}</strong>
                  <span>
                    {member ? `رقم ${memberLabel(member)} · اضغط للتغيير` : "اختر اسمك من القائمة"}
                  </span>
                </span>
                {!member && <span className="bq-chev">{I.go(18)}</span>}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={who === "none"}
                className="bq-role bq-press"
                onClick={() => setWho("none")}
              >
                <span className="bq-role-dot" aria-hidden="true" />
                <span className="bq-role-t">
                  <strong>لست عضوًا</strong>
                  <span>لا تُحسب عليّ رسوم في الصندوق</span>
                </span>
              </button>
            </div>
          )}
          {!linked && <p className="bq-hint">حتى لا تؤكد دفعة تخصك.</p>}
        </fieldset>

        <PasswordField value={pw} onChange={setPw} label="كلمة سر جديدة، بدل التي أرسلها المسؤول" />

        {err && (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        )}
        <button
          type="submit"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={!ok || busy || !online}
        >
          {busy ? "جارٍ الحفظ…" : "احفظ وادخل"}
        </button>
        <OfflineWriteHint />
      </form>
      <LogoutButton className="bq-btn bq-btn-ghost bq-press">{I.out2(20)} خروج</LogoutButton>

      {picking && (
        <Sheet label="اختر عضويتك" onDone={() => setPicking(false)}>
          <MemberPick
            members={members}
            onPick={(m) => {
              setWho(m);
              setPicking(false);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
