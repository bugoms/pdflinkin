"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

/** Supabase 의 영문 오류를 사람이 읽을 수 있게 바꾼다. */
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("email not confirmed")) {
    return "이메일 확인이 아직 안 됐습니다. 받은 메일의 링크를 누르거나, Supabase 대시보드 → Authentication → Email 에서 'Confirm email' 을 끄세요.";
  }
  if (m.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 맞지 않습니다.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }
  if (m.includes("password")) {
    return "비밀번호는 6자 이상이어야 합니다.";
  }
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setError(translate(error.message));
      } else if (data.session) {
        router.replace("/board");
        router.refresh();
        return;
      } else {
        setMessage("확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료하세요.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(translate(error.message));
      } else {
        router.replace("/board");
        router.refresh();
        return;
      }
    }

    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">pdflinkin</h1>
        <p className="mt-2 text-sm text-neutral-400">
          링크와 PDF를 캔버스에 펼쳐두는 개인 아카이브.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-neutral-600"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-neutral-600"
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-50"
          >
            {busy ? "처리 중…" : mode === "signup" ? "가입하기" : "로그인"}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          className="mt-6 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
        >
          {mode === "signin"
            ? "계정이 없나요? 가입하기"
            : "이미 계정이 있나요? 로그인"}
        </button>
      </div>
    </main>
  );
}
