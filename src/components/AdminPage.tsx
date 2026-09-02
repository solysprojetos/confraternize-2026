import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Inscricao = {
  id: string;
  nome_completo: string;
  telefone: string;
  email: string;
  grupo: "sgroup" | "solys" | "grupo_support";
  created_at: string;
};

const NOME_GRUPO: Record<Inscricao["grupo"], string> = {
  sgroup: "SGroup Nacional",
  solys: "Solys Gestão Administrativa",
  grupo_support: "Grupo Support",
};

const field =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40";

export function AdminPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [listError, setListError] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Inscricao["grupo"]>("todos");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user.email ?? null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function carregar() {
    setListError("");
    const { data, error } = await supabase
      .from("inscricoes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setListError("Não foi possível carregar as inscrições.");
      return;
    }
    setInscricoes((data ?? []) as Inscricao[]);
  }

  useEffect(() => {
    if (sessionEmail) carregar();
  }, [sessionEmail]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    setLoading(false);
    if (error) setLoginError("E-mail ou senha incorretos.");
  }

  const totais = useMemo(() => {
    const t: Record<string, number> = { sgroup: 0, solys: 0, grupo_support: 0 };
    for (const i of inscricoes) t[i.grupo] = (t[i.grupo] ?? 0) + 1;
    return t;
  }, [inscricoes]);

  const visiveis = useMemo(
    () => (filtro === "todos" ? inscricoes : inscricoes.filter((i) => i.grupo === filtro)),
    [inscricoes, filtro],
  );

  function exportarCsv() {
    const linhas = [
      ["Nome completo", "Telefone", "E-mail", "Grupo", "Data da inscrição"],
      ...visiveis.map((i) => [
        i.nome_completo,
        i.telefone,
        i.email,
        NOME_GRUPO[i.grupo],
        new Date(i.created_at).toLocaleString("pt-BR"),
      ]),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inscricoes-celebra-2026.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </main>
    );
  }

  if (!sessionEmail) {
    return (
      <main className="min-h-screen bg-background">
        <div className="relative mx-auto w-full max-w-md px-5 py-20">
          <header className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
              Área restrita
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
              Celebra 2026
            </h1>
            <p className="mt-3 text-base text-muted-foreground">Entre para ver as inscrições.</p>
          </header>
          <form
            onSubmit={handleLogin}
            className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <div>
              <label
                htmlFor="admin-email"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                E-mail
              </label>
              <input
                id="admin-email"
                type="email"
                className={field}
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="admin-senha"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Senha
              </label>
              <input
                id="admin-senha"
                type="password"
                className={field}
                value={senha}
                autoComplete="current-password"
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-5 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
              Área restrita
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
              Inscrições — Celebra 2026
            </h1>
          </div>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Sair
          </button>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              filtro === "todos"
                ? "border-primary bg-accent"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-3xl font-bold text-foreground">{inscricoes.length}</p>
          </button>
          {(Object.keys(NOME_GRUPO) as Inscricao["grupo"][]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setFiltro(g)}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                filtro === g ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent"
              }`}
            >
              <p className="text-sm text-muted-foreground">{NOME_GRUPO[g]}</p>
              <p className="text-3xl font-bold text-foreground">{totais[g]}</p>
            </button>
          ))}
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {filtro === "todos"
                ? `Mostrando todas as ${visiveis.length} inscrições`
                : `Mostrando ${visiveis.length} de ${NOME_GRUPO[filtro]}`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={carregar}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={exportarCsv}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Exportar CSV
              </button>
            </div>
          </div>

          {listError && <p className="mt-3 text-sm text-destructive">{listError}</p>}

          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Grupo</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma inscrição ainda.
                    </td>
                  </tr>
                ) : (
                  visiveis.map((i) => (
                    <tr key={i.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{i.nome_completo}</td>
                      <td className="px-4 py-3 text-foreground">{i.telefone}</td>
                      <td className="px-4 py-3 text-foreground">{i.email}</td>
                      <td className="px-4 py-3 text-foreground">{NOME_GRUPO[i.grupo]}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(i.created_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
