"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("gestor@laforneriabasso.com.br");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function signIn() {
    const client = createClient();
    if (!client) throw new Error("Supabase não configurado.");
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }

  async function bootstrapFirstAccess() {
    const response = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      code?: string;
    };
    if (!response.ok) {
      throw new Error(body.error || "Não foi possível preparar o primeiro acesso.");
    }
    setMessage(body.message || "Acesso inicial criado. Entrando no painel...");
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (isDemoMode()) {
      router.push("/painel");
      return;
    }

    if (!password) {
      setError("Informe a senha de acesso.");
      return;
    }

    setSubmitting(true);
    try {
      try {
        await signIn();
      } catch (signInError) {
        const signInMessage = signInError instanceof Error ? signInError.message : "Falha no login.";
        const looksLikeMissingAccount = /invalid login|invalid credentials|email not confirmed/i.test(
          signInMessage,
        );
        if (!looksLikeMissingAccount) throw signInError;

        await bootstrapFirstAccess();
        await signIn();
      }

      router.replace("/painel");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar no painel.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-basso-black p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-4xl border border-white/10 bg-white p-7 shadow-premium"
      >
        <div className="text-center">
          <Image
            src="/assets/brand/logo.png"
            alt="La Forneria Basso"
            width={84}
            height={84}
            className="mx-auto rounded-full"
          />
          <h1 className="mt-4 font-display text-3xl font-bold">Acesso da equipe</h1>
          <p className="mt-2 text-sm text-black/45">PedidoPro • operação interna</p>
        </div>

        <label className="mt-6 block">
          <span className="label">E-mail</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
          />
        </label>

        <label className="mt-4 block">
          <span className="label">Senha</span>
          <div className="relative">
            <input
              className="input pr-11"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Digite sua senha"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {message && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-5 w-full" disabled={submitting}>
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
          {submitting ? "Validando acesso..." : "Entrar"}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-black/40">
          <LockKeyhole size={13} /> Sessão protegida e ações auditadas
        </p>
        <Link href="/" className="btn-ghost mt-2 w-full">
          Voltar ao cardápio
        </Link>
      </form>
    </main>
  );
}
