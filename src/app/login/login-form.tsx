"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

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
          className="border-line bg-surface-2 focus:border-primary h-12 rounded-xl border px-3 text-base outline-none"
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
          className="border-line bg-surface-2 focus:border-primary h-12 rounded-xl border px-3 text-base outline-none"
        />
      </label>
      {state.error && (
        <p role="alert" className="bg-bad-soft text-bad rounded-xl px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-ink h-12 rounded-xl text-base font-bold disabled:opacity-60"
      >
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
