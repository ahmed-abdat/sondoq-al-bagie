import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ASSOC } from "@/components/app/derive";
import * as src from "@/components/app/source";
import { SetupForm } from "@/components/app/views/setup";

export const metadata: Metadata = { title: "جهّز حسابك · صندوق الرابطة" };

// First sign-in (or after the admin reset the password): name, own membership, a new password.
// Every other committee page sends a pending session here (source.committeeSession). Outside the
// (app) shell on purpose: no nav to wander off; «خروج» stays. Demo: always open, to try it.
export default async function SetupPage() {
  const s = await src.anyCommitteeSession();
  if (!s) redirect("/login?next=/committee/setup");
  if (!s.setupPending && !src.demoMode) redirect("/committee");
  const rows = await src.memberRows();
  const pick = (m: (typeof rows)[number]) => ({
    memberId: m.memberId,
    memberRef: m.memberRef,
    fullName: m.fullName,
  });
  const linked = s.memberId ? rows.find((m) => m.memberId === s.memberId) : undefined;
  return (
    <main className="bq-verify bq-setup">
      <header className="bq-verify-h">
        <span className="bq-logo">
          <Image src="/logo.jpg" alt="شعار الرابطة" width={96} height={96} priority />
        </span>
        <span className="bq-brand-t">
          <strong>صندوق الرابطة</strong>
          <span>{ASSOC}</span>
        </span>
      </header>
      <SetupForm
        name={s.displayName}
        confirmer={src.MANAGERS.includes(s.role)}
        linked={linked ? pick(linked) : null}
        members={linked ? [] : rows.filter((m) => m.status === "active").map(pick)}
      />
    </main>
  );
}
