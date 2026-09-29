"use client";

import { useActionState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const online = useOnline();

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
      <p className="bq-hint">نسيت كلمة السر؟ اطلب من المسؤول كلمة سر جديدة.</p>
    </form>
  );
}
