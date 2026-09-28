"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        البريد الإلكتروني
        <input
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          className="h-12 rounded-xl border border-line bg-surface-2 px-3 text-base outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        كلمة السر
        <input
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-line bg-surface-2 px-3 text-base outline-none focus:border-primary"
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-primary text-base font-bold text-primary-ink disabled:opacity-60"
      >
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
