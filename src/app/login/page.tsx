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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 py-20">
      <div className="w-full max-w-[420px]">
        <header className="text-center">
          <h1 className="text-[56px] font-semibold leading-[1.07] tracking-[-0.02em] text-ink">
            LinkScape
          </h1>
          <p className="mx-auto mt-3 max-w-[340px] text-[21px] font-normal leading-[1.28] text-ink-48">
            링크와 PDF를 캔버스에 펼쳐두는 개인 아카이브.
          </p>
        </header>

        <form onSubmit={onSubmit} className="mt-12 space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-[52px] w-full rounded-apple-md border border-hairline bg-canvas px-4 text-[17px] text-ink outline-none transition placeholder:text-ink-48 focus:border-action-focus"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-[52px] w-full rounded-apple-md border border-hairline bg-canvas px-4 text-[17px] text-ink outline-none transition placeholder:text-ink-48 focus:border-action-focus"
          />

          <button
            type="submit"
            disabled={busy}
            className="h-[52px] w-full rounded-full bg-action text-[17px] font-normal text-white transition disabled:opacity-40"
          >
            {busy ? "처리 중…" : mode === "signup" ? "가입하기" : "로그인"}
          </button>
        </form>

        {error && (
          <p className="mt-5 rounded-apple-md bg-parchment px-4 py-3 text-[14px] leading-relaxed text-ink-80">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-5 rounded-apple-md bg-parchment px-4 py-3 text-[14px] leading-relaxed text-ink-80">
            {message}
          </p>
        )}

        <p className="mt-8 text-center text-[14px] text-ink-48">
          {mode === "signin" ? "계정이 없나요?" : "이미 계정이 있나요?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setMessage(null);
            }}
            className="text-action"
          >
            {mode === "signin" ? "가입하기" : "로그인"} ›
          </button>
        </p>
      </div>
    </main>
  );
}
