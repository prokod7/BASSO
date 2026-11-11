"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/utils";
import { VendraAssinatura } from "@/components/shared/Vendra";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function signIn() {
    const client = createClient();
    if (!client) throw new Error("Supabase não configurado.");
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

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
      await signIn();

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
      <div className="w-full max-w-md">
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
      <div className="mt-6 flex justify-center"><VendraAssinatura variante="escuro" altura={16} /></div>
      </div>
    </main>
  );
}

