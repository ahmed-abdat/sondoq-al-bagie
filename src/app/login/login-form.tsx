"use client";

import { useActionState, useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct } from "@/components/app/act";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const online = useOnline();
  const { requestPasswordReset } = useAct();
  const [email, setEmail] = useState("");
  const [reset, setReset] = useState<"idle" | "sending" | "sent">("idle");

  return (
    <form action={action} className="bq-login">
      <input type="hidden" name="next" value={next ?? ""} />
      <label>
        البريد أو رقم الهاتف
        <input
          className="bq-input"
          name="login"
          type="text"
          inputMode="email"
          dir="ltr"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        كلمة السر
        <input
          className="bq-input"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error && (
        <p role="alert" className="bq-alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !online}
        className="bq-btn bq-btn-primary bq-btn-lg bq-press"
      >
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
      <OfflineWriteHint />
      {reset === "sent" ? (
        <p className="bq-hint" role="status">
          إن كان لهذا البريد حساب، ستصله رسالة لتغيير كلمة السر.
        </p>
      ) : (
        <button
          type="button"
          className="bq-link bq-link-s bq-press"
          disabled={reset === "sending" || !online}
          onClick={async () => {
            if (!email.includes("@")) return; // reset links go to an email; phone logins ask the admin
            setReset("sending");
            await requestPasswordReset({ email });
            setReset("sent");
          }}
        >
          نسيت كلمة السر؟ {email.includes("@") ? "" : "(اكتب بريدك، أو اطلب كلمة جديدة من المسؤول)"}
        </button>
      )}
    </form>
  );
}
