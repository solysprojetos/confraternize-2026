import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { evento } from "@/config/evento";

type Inscricao = {
  id: string;
  nome_completo: string;
  telefone: string;
  email: string;
  grupo: "sgroup" | "solys" | "grupo_support" | "parceiros" | "convidados";
  created_at: string;
  /** Só existe depois da migração 20260914120000_resposta_do_convite. */
  comparecera?: boolean | null;
  cargo?: string | null;
  setor?: string | null;
  convite_enviado?: boolean | null;
  lembrete_semana_enviado?: boolean | null;
  lembrete_vespera_enviado?: boolean | null;
};

type FiltroPresenca = "todas" | "confirmadas" | "nao_irao";

/** Quem não respondeu "não" conta como presença confirmada. */
const vaiComparecer = (i: Inscricao) => i.comparecera !== false;

const NOME_GRUPO: Record<Inscricao["grupo"], string> = {
  grupo_support: "Grupo Support",
  sgroup: "SGroup Nacional",
  solys: "Solys Gestão Administrativa",
  parceiros: "Parceiros",
  convidados: "Convidados",
};

const field =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40";

const botaoSecundario =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent";

/** Tira acentos e caixa para a busca achar "joao" em "João". */
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Link do WhatsApp para o telefone digitado no formulário (DDD + número). */
function linkWhatsApp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.length <= 11 ? "55" + digitos : digitos}`;
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diasParaOEvento(): number {
  const ms = new Date(evento.inicioIso).getTime() - Date.now();
  // Arredonda para baixo, como a contagem regressiva do site
  return Math.max(0, Math.floor(ms / 86400000));
}

function Presenca({ i }: { i: Inscricao }) {
  return vaiComparecer(i) ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
      Confirmada
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
      Não irá
    </span>
  );
}

function StatusEmail({ i }: { i: Inscricao }) {
  if (!vaiComparecer(i)) return <span className="text-muted-foreground">—</span>;
  return i.convite_enviado ? (
    <span className="text-foreground">Enviado</span>
  ) : (
    <span className="text-amber-700">Na fila</span>
  );
}

export function AdminPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [listError, setListError] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Inscricao["grupo"]>("todos");
  const [presenca, setPresenca] = useState<FiltroPresenca>("todas");
  const [busca, setBusca] = useState("");

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
    setCarregando(true);
    const { data, error } = await supabase
      .from("inscricoes")
      .select("*")
      .order("created_at", { ascending: false });
    setCarregando(false);
    if (error) {
      setListError("Não foi possível carregar as inscrições.");
      return;
    }
    setInscricoes((data ?? []) as Inscricao[]);
    setAtualizadoEm(new Date());
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

  const resumo = useMemo(() => {
    const confirmadas = inscricoes.filter(vaiComparecer);
    return {
      total: inscricoes.length,
      confirmadas: confirmadas.length,
      naoIrao: inscricoes.length - confirmadas.length,
      emailsEnviados: confirmadas.filter((i) => i.convite_enviado).length,
      lembreteSemana: confirmadas.filter((i) => i.lembrete_semana_enviado).length,
      lembreteVespera: confirmadas.filter((i) => i.lembrete_vespera_enviado).length,
    };
  }, [inscricoes]);

  // Confirmados por empresa: é o número que importa para o buffet
  const porEmpresa = useMemo(() => {
    const conta: Record<Inscricao["grupo"], number> = {
      grupo_support: 0,
      sgroup: 0,
      solys: 0,
      parceiros: 0,
      convidados: 0,
    };
    for (const i of inscricoes) if (vaiComparecer(i)) conta[i.grupo] += 1;
    return conta;
  }, [inscricoes]);
  const maiorEmpresa = Math.max(1, ...Object.values(porEmpresa));

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return inscricoes.filter((i) => {
      if (filtro !== "todos" && i.grupo !== filtro) return false;
      if (presenca === "confirmadas" && !vaiComparecer(i)) return false;
      if (presenca === "nao_irao" && vaiComparecer(i)) return false;
      if (!termo) return true;
      return normalizar(`${i.nome_completo} ${i.email} ${i.telefone} ${i.cargo ?? ""}`).includes(
        termo,
      );
    });
  }, [inscricoes, filtro, presenca, busca]);

  // Quantas pessoas por setor, dentro do que está filtrado na tela
  const porSetor = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of visiveis) {
      if (!i.setor) continue;
      conta.set(i.setor, (conta.get(i.setor) ?? 0) + 1);
    }
    return [...conta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  }, [visiveis]);

  const temFiltro = filtro !== "todos" || presenca !== "todas" || busca.trim() !== "";

  function limparFiltros() {
    setFiltro("todos");
    setPresenca("todas");
    setBusca("");
  }

  function exportarCsv() {
    const linhas = [
      [
        "Nome completo",
        "Telefone",
        "E-mail",
        "Grupo",
        "Setor",
        "Cargo",
        "Presença",
        "Convite por e-mail",
        "Data da resposta",
      ],
      ...visiveis.map((i) => [
        i.nome_completo,
        i.telefone,
        i.email,
        NOME_GRUPO[i.grupo],
        i.setor ?? "",
        i.cargo ?? "",
        vaiComparecer(i) ? "Confirmada" : "Não irá",
        !vaiComparecer(i) ? "" : i.convite_enviado ? "Enviado" : "Na fila",
        new Date(i.created_at).toLocaleString("pt-BR"),
      ]),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inscricoes-confraternizacao-2026.csv";
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gold-texto">
              Área restrita
            </p>
            <h1 className="mt-3 font-display text-4xl uppercase leading-none text-foreground">
              Confraternização <span className="normal-case italic text-gold-texto">2026</span>
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

  const dias = diasParaOEvento();

  return (
    <main className="min-h-screen bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ============ Cabeçalho ============ */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gold-texto">
              Área restrita · Inscrições
            </p>
            <h1 className="mt-2 font-display text-4xl uppercase leading-none text-foreground sm:text-5xl">
              Confraternização <span className="normal-case italic text-gold-texto">2026</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {evento.dataExtenso} · {evento.horario}
              {dias > 0 && (
                <>
                  {" · "}
                  <span className="text-foreground">
                    faltam {dias} {dias === 1 ? "dia" : "dias"}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">{sessionEmail}</p>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className={botaoSecundario}
            >
              Sair
            </button>
          </div>
        </header>

        {/* ============ Números principais ============ */}
        <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="col-span-2 rounded-2xl bg-primary p-5 text-primary-foreground lg:col-span-1">
            <p className="text-sm text-primary-foreground/70">Presenças confirmadas</p>
            <p className="mt-1 font-display text-6xl leading-none">{resumo.confirmadas}</p>
            <p className="mt-2 text-xs text-primary-foreground/60">
              de {resumo.total} {resumo.total === 1 ? "resposta" : "respostas"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Não irão</p>
            <p className="mt-1 font-display text-5xl leading-none text-foreground">
              {resumo.naoIrao}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Convites por e-mail</p>
            <p className="mt-1 font-display text-5xl leading-none text-foreground">
              {resumo.emailsEnviados}
              <span className="text-2xl text-muted-foreground">/{resumo.confirmadas}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {resumo.confirmadas - resumo.emailsEnviados > 0
                ? `${resumo.confirmadas - resumo.emailsEnviados} na fila de reenvio`
                : "todos enviados"}
            </p>
          </div>
          <div className="col-span-2 rounded-2xl border border-border bg-card p-5 lg:col-span-1">
            <p className="text-sm text-muted-foreground">Lembretes automáticos</p>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {(
                [
                  ["12/12", "Uma semana antes", resumo.lembreteSemana],
                  ["18/12", "Véspera", resumo.lembreteVespera],
                ] as const
              ).map(([dia, texto, enviados]) => (
                <li key={dia} className="flex items-baseline justify-between gap-3">
                  <span>
                    {dia} · {texto}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {enviados > 0 ? `${enviados} enviados` : "agendado"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Por e-mail, a quem confirmou.</p>
          </div>
        </section>

        {/* ============ Por empresa e por setor ============ */}
        <section className="mt-3 grid gap-3 lg:grid-cols-5">
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-foreground">Confirmados por empresa</p>
              <p className="text-xs text-muted-foreground">Clique para filtrar</p>
            </div>
            <ul className="mt-4 space-y-1">
              {(Object.keys(NOME_GRUPO) as Inscricao["grupo"][]).map((g) => {
                const ativo = filtro === g;
                return (
                  <li key={g}>
                    <button
                      type="button"
                      onClick={() => setFiltro(ativo ? "todos" : g)}
                      aria-pressed={ativo}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_4.5rem_2rem] sm:grid-cols-[13rem_1fr_2.5rem] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                        ativo ? "bg-accent" : "hover:bg-accent/60"
                      }`}
                    >
                      <span
                        className={`truncate text-sm ${ativo ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      >
                        {NOME_GRUPO[g]}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-gold"
                          style={{ width: `${(porEmpresa[g] / maiorEmpresa) * 100}%` }}
                        />
                      </span>
                      <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                        {porEmpresa[g]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <p className="text-sm font-medium text-foreground">
              Por setor
              {filtro !== "todos" && (
                <span className="font-normal text-muted-foreground"> · {NOME_GRUPO[filtro]}</span>
              )}
            </p>
            {porSetor.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum setor informado{temFiltro ? " neste filtro" : " ainda"}.
              </p>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-2">
                {porSetor.map(([setor, quantos]) => (
                  <li
                    key={setor}
                    className="flex items-baseline gap-2 rounded-lg border border-border px-3 py-1.5"
                  >
                    <span className="font-semibold tabular-nums text-foreground">{quantos}</span>
                    <span className="text-sm text-muted-foreground">{setor}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ============ Lista ============ */}
        <section className="mt-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nome, e-mail ou telefone"
                aria-label="Buscar inscrição"
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 sm:w-72"
              />
              <div
                role="group"
                aria-label="Filtrar por presença"
                className="inline-flex h-10 rounded-lg border border-border bg-card p-1"
              >
                {(
                  [
                    ["todas", "Todas"],
                    ["confirmadas", "Confirmadas"],
                    ["nao_irao", "Não irão"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setPresenca(valor)}
                    aria-pressed={presenca === valor}
                    className={`flex-1 rounded-md px-3 text-sm transition-colors sm:flex-none ${
                      presenca === valor
                        ? "bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={carregar}
                disabled={carregando}
                className={`${botaoSecundario} flex-1 disabled:opacity-60 lg:flex-none`}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
              <button
                type="button"
                onClick={exportarCsv}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 lg:flex-none"
              >
                Exportar planilha
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {temFiltro ? (
              <>
                Mostrando {visiveis.length} de {inscricoes.length}
                {filtro !== "todos" && ` · ${NOME_GRUPO[filtro]}`} ·{" "}
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="text-foreground underline underline-offset-2"
                >
                  limpar filtros
                </button>
              </>
            ) : (
              `${inscricoes.length} ${inscricoes.length === 1 ? "inscrição" : "inscrições"}`
            )}
            {atualizadoEm && (
              <span className="text-muted-foreground/70">
                {" "}
                · atualizado às{" "}
                {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>

          {listError && <p className="mt-3 text-sm text-destructive">{listError}</p>}

          {visiveis.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
              {inscricoes.length === 0
                ? "Nenhuma inscrição ainda."
                : "Nenhuma inscrição encontrada com esses filtros."}
            </div>
          ) : (
            <>
              {/* Computador: tabela */}
              <div className="mt-3 hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Convidado</th>
                      <th className="px-4 py-3 font-medium">Empresa</th>
                      <th className="px-4 py-3 font-medium">Telefone</th>
                      <th className="px-4 py-3 font-medium">Presença</th>
                      <th className="px-4 py-3 font-medium">E-mail</th>
                      <th className="px-4 py-3 text-right font-medium">Resposta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visiveis.map((i) => {
                      const whats = linkWhatsApp(i.telefone);
                      return (
                        <tr key={i.id} className="align-top transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{i.nome_completo}</p>
                            <p className="text-muted-foreground">{i.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-foreground">{NOME_GRUPO[i.grupo]}</p>
                            {(i.setor || i.cargo) && (
                              <p className="text-muted-foreground">
                                {[i.setor, i.cargo && i.cargo !== i.setor ? i.cargo : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {whats ? (
                              <a
                                href={whats}
                                target="_blank"
                                rel="noreferrer"
                                className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                                title="Abrir no WhatsApp"
                              >
                                {i.telefone}
                              </a>
                            ) : (
                              <span className="text-foreground">{i.telefone}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Presenca i={i} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusEmail i={i} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {dataCurta(i.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Celular: cartões */}
              <ul className="mt-3 space-y-2 md:hidden">
                {visiveis.map((i) => {
                  const whats = linkWhatsApp(i.telefone);
                  return (
                    <li key={i.id} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{i.nome_completo}</p>
                          <p className="text-sm text-muted-foreground">
                            {NOME_GRUPO[i.grupo]}
                            {i.setor ? ` · ${i.setor}` : ""}
                          </p>
                        </div>
                        <Presenca i={i} />
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        <p className="truncate text-muted-foreground">{i.email}</p>
                        <p className="flex items-center justify-between gap-3">
                          {whats ? (
                            <a
                              href={whats}
                              target="_blank"
                              rel="noreferrer"
                              className="text-foreground underline decoration-border underline-offset-4"
                            >
                              {i.telefone}
                            </a>
                          ) : (
                            <span className="text-foreground">{i.telefone}</span>
                          )}
                          <span className="tabular-nums text-muted-foreground">
                            {dataCurta(i.created_at)}
                          </span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
