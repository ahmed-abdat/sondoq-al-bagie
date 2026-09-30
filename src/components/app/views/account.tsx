"use client";
// «حسابي»: the signed-in committee member's own page. Name, role, login; password;
// notifications; sign out (here or everywhere). Settings stay fund-only.
import { setCanceller } from "../viewer";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { CommitteePushToggle } from "@/components/providers/committee-push";
import { createIdbPersister } from "@/lib/offline/persister";
import { useAct, useIsDemo } from "../act";
import { ROLE_LABEL } from "../derive";
import { I } from "../icons";
import { LogoutButton } from "../logout";
import { PasswordField } from "../member-pick";
import { Sheet } from "../sheet";
import { useSnack } from "../shell";
import type { MyProfile } from "../types";
import { SubHead } from "./committee";
import { IDLE, runSave, SaveNote, type SaveState } from "./settings";

/** This browser's push endpoint, so signing out everywhere also stops its notifications. */
async function pushEndpoint(): Promise<string | undefined> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    return (await reg?.pushManager.getSubscription())?.endpoint;
  } catch {
    return undefined;
  }
}

export function AccountView({ me }: { me: MyProfile }) {
  const router = useRouter();
  const online = useOnline();
  const demo = useIsDemo();
  const say = useSnack();
  const acts = useAct();
  const [name, setName] = useState(me.displayName);
  const [savedName, setSavedName] = useState(me.displayName);
  const [nameSave, setNameSave] = useState<SaveState>(IDLE);
  const [pw, setPw] = useState("");
  const [pwSave, setPwSave] = useState<SaveState>(IDLE);
  const memberId = me.memberId;
  const [sheet, setSheet] = useState<"everywhere" | null>(null);
  const [out, setOut] = useState(false);

  return (
    <>
      <SubHead title="حسابي" />

      <section className="bq-sec bq-sec-first" aria-labelledby="bq-me-h">
        <h2 id="bq-me-h">البيانات</h2>
        <form
          className="bq-login"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = name.trim();
            if (
              await runSave(setNameSave, () => acts.updateMyProfile({ displayName: v, memberId }))
            ) {
              setSavedName(v);
              router.refresh();
            }
          }}
        >
          <label>
            الاسم
            <input
              className="bq-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </label>
          {name.trim() !== savedName && name.trim().length > 1 && (
            <button
              type="submit"
              className="bq-btn bq-btn-soft bq-press"
              disabled={!online || nameSave.status === "saving"}
            >
              احفظ الاسم
            </button>
          )}
          <SaveNote s={nameSave} />
        </form>
        <dl className="bq-facts bq-small-top">
          <div>
            <dt>الدور</dt>
            <dd>{ROLE_LABEL[me.role]}</dd>
          </div>
        </dl>
        <p className="bq-hint bq-small-top">البريد أو الهاتف للدخول:</p>
        <p className="bq-login-id" dir="ltr">
          {me.login || "غير معروف"}
        </p>
        <p className="bq-hint">يغيّرهما المسؤول.</p>
      </section>

      <section className="bq-sec" aria-labelledby="bq-pw-h">
        <h2 id="bq-pw-h">كلمة السر</h2>
        <form
          className="bq-login"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await runSave(setPwSave, () => acts.setPassword({ password: pw }))) setPw("");
          }}
        >
          <PasswordField value={pw} onChange={setPw} />
          <button
            type="submit"
            className="bq-btn bq-btn-soft bq-press"
            disabled={!online || pw.length < 8 || pwSave.status === "saving"}
          >
            غيّر كلمة السر
          </button>
          <SaveNote s={pwSave} />
        </form>
      </section>

      <section className="bq-sec" aria-labelledby="bq-push-h">
        <h2 id="bq-push-h">الإشعارات</h2>
        <p className="bq-hint">أعلمني حين يسجّل أحد اللجنة دفعة أو مصروفًا، على هذا الهاتف.</p>
        {demo ? (
          <p className="bq-hint">لا تعمل الإشعارات في النسخة التجريبية.</p>
        ) : (
          <CommitteePushToggle className="bq-small-top" />
        )}
      </section>

      <section className="bq-sec" aria-labelledby="bq-sec-h">
        <h2 id="bq-sec-h">الأمان</h2>
        <p className="bq-hint">إن نسيت حسابك مفتوحًا على هاتف آخر، أخرج منه من هنا.</p>
        <button
          type="button"
          className="bq-btn bq-btn-tonal bq-press bq-small-top"
          disabled={!online}
          onClick={() => setSheet("everywhere")}
        >
          الخروج من كل الأجهزة
        </button>
        <div className="bq-small-top">
          <LogoutButton className="bq-btn bq-btn-ghost bq-press">{I.out2(20)} خروج</LogoutButton>
        </div>
      </section>

      {sheet === "everywhere" && (
        <Sheet key="everywhere" label="الخروج من كل الأجهزة" onDone={() => setSheet(null)}>
          <div className="bq-rec bq-cancel">
            <h2>الخروج من كل الأجهزة</h2>
            <p className="bq-lead">
              ستخرج من حساب اللجنة على كل هاتف وحاسوب، ومنها هذا الهاتف. ادخل من جديد بكلمة السر.
            </p>
            <div className="bq-rec-foot">
              <button
                type="button"
                className="bq-btn bq-btn-danger bq-btn-lg bq-press"
                disabled={!online || out}
                onClick={async () => {
                  setOut(true);
                  const r = await acts.signOutEverywhere({ endpoint: await pushEndpoint() });
                  if (!r.ok) {
                    setOut(false);
                    return say(r.message);
                  }
                  // nothing of the committee stays on this phone
                  setCanceller(null);
                  try {
                    await createIdbPersister().removeClient();
                  } catch {
                    /* nothing saved */
                  }
                  router.replace("/login");
                  router.refresh();
                }}
              >
                اخرج من كل الأجهزة
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-ghost bq-press"
                onClick={() => setSheet(null)}
              >
                رجوع
              </button>
              <OfflineWriteHint />
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
