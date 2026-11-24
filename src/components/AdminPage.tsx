import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Hourglass,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  UserCog,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evento, setores as setoresPadrao } from "@/config/evento";
import { CoordenadoresAba } from "@/components/CoordenadoresAba";
import { VisaoGeral } from "@/components/admin/VisaoGeral";
import { ListaInscricoes } from "@/components/admin/ListaInscricoes";
import { SetoresAba } from "@/components/admin/SetoresAba";
import {
  botao,
  db,
  ehReserva,
  naListaPrincipal,
  NOME_GRUPO,
  vaiComparecer,
  type Grupo,
  type Inscricao,
} from "@/components/admin/comum";

export type { Inscricao } from "@/components/admin/comum";

type Secao = "visao" | "principal" | "reserva" | "setores" | "coordenadores";

const SECOES: Record<Secao, { titulo: string; descricao: string }> = {
  visao: {
    titulo: "Visão geral",
    descricao: "Os números da confraternização em um só lugar.",
  },
  principal: {
    titulo: "Lista principal",
    descricao: "Presenças confirmadas, por ordem de inscrição.",
  },
  reserva: {
    titulo: "Cadastro reserva",
    descricao: "Quem se inscreveu depois do fechamento da lista principal.",
  },
  setores: {
    titulo: "Setores",
    descricao: "Crie, renomeie ou remova setores e mude as pessoas de setor.",
  },
  coordenadores: {
    titulo: "Coordenadores",
    descricao: "Coordenadores de cada empresa e as pessoas sob cada um.",
  },
};

const campoLogin =
  "w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

function diasParaOEvento(): number {
  const ms = new Date(evento.inicioIso).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function AdminPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [setores, setSetores] = useState<string[]>(setoresPadrao);
  const [carregando, setCarregando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [erro, setErro] = useState("");
  const [secao, setSecao] = useState<Secao>("visao");
  const [menuAberto, setMenuAberto] = useState(false);
  /** Empresa que a lista deve abrir filtrada (vinda de um clique na visão geral). */
  const [empresaInicial, setEmpresaInicial] = useState<Grupo | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

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

  async function carregarSetores() {
    const { data, error } = await db
      .from("convite_setores")
      .select("nome, ordem")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    // Sem a migração dos setores (ou sem linhas), vale a lista do site
    if (!error && data && data.length > 0) {
      setSetores((data as { nome: string }[]).map((s) => s.nome));
    }
  }

  async function carregar() {
    setErro("");
    setCarregando(true);
    const [{ data, error }] = await Promise.all([
      supabase.from("inscricoes").select("*").order("created_at", { ascending: true }),
      carregarSetores(),
    ]);
    setCarregando(false);
    if (error) {
      setErro("Não foi possível carregar as inscrições.");
      return;
    }
    setInscricoes((data ?? []) as Inscricao[]);
    setAtualizadoEm(new Date());
  }

  useEffect(() => {
    if (sessionEmail) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Posição de cada pessoa na ordem de inscrição (1 = primeira). */
  const posicao = useMemo(() => {
    const ordenadas = [...inscricoes].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
    return new Map(ordenadas.map((i, n) => [i.id, n + 1]));
  }, [inscricoes]);

  const principal = useMemo(() => inscricoes.filter(naListaPrincipal), [inscricoes]);
  const reserva = useMemo(
    () => inscricoes.filter((i) => vaiComparecer(i) && ehReserva(i)),
    [inscricoes],
  );

  function alterar(id: string, mudanca: Partial<Inscricao>) {
    setInscricoes((atual) => atual.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }

  /** Chama uma função do banco para uma pessoa e reflete o resultado na tela. */
  async function executar(
    i: Inscricao,
    funcao: string,
    parametros: Record<string, unknown>,
    mudanca: Partial<Inscricao>,
    falha: string,
  ) {
    setErro("");
    setOcupado(i.id);
    const { error } = await db.rpc(funcao, { p_inscricao: i.id, ...parametros });
    setOcupado(null);
    if (error) {
      setErro(`${falha} ${i.nome_completo}.`);
      return;
    }
    alterar(i.id, mudanca);
  }

  const acoes = {
    ocupado,
    transferirEmpresa(i: Inscricao, grupo: Grupo) {
      if (grupo === i.grupo) return;
      if (!window.confirm(`Transferir ${i.nome_completo} para ${NOME_GRUPO[grupo]}?`)) return;
      void executar(
        i,
        "admin_transferir_grupo",
        { p_grupo: grupo },
        { grupo },
        "Não foi possível transferir",
      );
    },
    mudarSetor(i: Inscricao, setor: string | null) {
      if ((i.setor ?? null) === setor) return;
      void executar(
        i,
        "admin_transferir_setor",
        { p_setor: setor },
        { setor },
        "Não foi possível mudar o setor de",
      );
    },
    moverReserva(i: Inscricao) {
      const paraReserva = !ehReserva(i);
      const destino = paraReserva ? "o cadastro reserva" : "a lista principal";
      if (!window.confirm(`Mover ${i.nome_completo} para ${destino}?`)) return;
      void executar(
        i,
        "admin_definir_reserva",
        { p_reserva: paraReserva },
        { cadastro_reserva: paraReserva },
        "Não foi possível mover",
      );
    },
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </main>
    );
  }

  if (!sessionEmail) {
    return (
      <main className="grid min-h-screen bg-surface lg:grid-cols-[1fr_1.1fr]">
        <aside className="hidden flex-col justify-between bg-navy-deep p-12 text-primary-foreground lg:flex">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">
            Painel da organização
          </p>
          <div>
            <h1 className="font-display text-6xl uppercase leading-[0.95]">
              Confraternização <span className="normal-case italic text-gold">2026</span>
            </h1>
            <p className="mt-5 text-sm text-primary-foreground/70">
              {evento.dataExtenso} · {evento.horario}
            </p>
          </div>
          <p className="text-xs text-primary-foreground/50">Acesso restrito à organização.</p>
        </aside>
        <div className="flex items-center justify-center px-5 py-16">
          <div className="w-full max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-texto lg:hidden">
              Confraternização 2026
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Entrar no painel
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Use o e-mail e a senha da organização.
            </p>
            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <div>
                <label
                  htmlFor="admin-email"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  E-mail
                </label>
                <input
                  id="admin-email"
                  type="email"
                  className={campoLogin}
                  value={email}
                  autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="admin-senha"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Senha
                </label>
                <input
                  id="admin-senha"
                  type="password"
                  className={campoLogin}
                  value={senha}
                  autoComplete="current-password"
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
              {loginError && <p className="text-sm text-destructive">{loginError}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-5 py-2.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const dias = diasParaOEvento();
  const itens = [
    { chave: "visao", rotulo: "Visão geral", icone: LayoutDashboard, numero: null },
    {
      chave: "principal",
      rotulo: "Lista principal",
      icone: ClipboardList,
      numero: principal.length,
    },
    { chave: "reserva", rotulo: "Cadastro reserva", icone: Hourglass, numero: reserva.length },
    { chave: "setores", rotulo: "Setores", icone: Layers, numero: setores.length },
    { chave: "coordenadores", rotulo: "Coordenadores", icone: UserCog, numero: null },
  ] as const;

  function irPara(destino: Secao, empresa: Grupo | null = null) {
    setEmpresaInicial(empresa);
    setSecao(destino);
    setMenuAberto(false);
    window.scrollTo({ top: 0 });
  }

  const menu = (
    <div className="flex h-full flex-col bg-navy-deep text-primary-foreground">
      <div className="px-6 pb-6 pt-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">Painel</p>
        <p className="mt-2 font-display text-[1.7rem] uppercase leading-none">
          Confraternização <span className="normal-case italic text-gold">2026</span>
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Seções do painel">
        {itens.map(({ chave, rotulo, icone: Icone, numero }) => {
          const ativa = secao === chave;
          return (
            <button
              key={chave}
              type="button"
              onClick={() => irPara(chave)}
              aria-current={ativa ? "page" : undefined}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                ativa
                  ? "bg-white/10 font-semibold text-white"
                  : "text-primary-foreground/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icone
                className={`size-[18px] shrink-0 ${ativa ? "text-gold" : "text-primary-foreground/50 group-hover:text-primary-foreground/80"}`}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{rotulo}</span>
              {numero !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                    ativa ? "bg-gold text-navy-deep" : "bg-white/10 text-primary-foreground/80"
                  }`}
                >
                  {numero}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-lg border border-white/10 bg-white/5 px-3.5 py-3">
        <p className="flex items-center gap-2 text-xs font-medium text-white">
          <span className="size-1.5 rounded-full bg-gold" aria-hidden="true" />
          Inscrições encerradas
        </p>
        <p className="mt-1 text-xs text-primary-foreground/60">
          {evento.diaCurto}/{evento.mesCurto} · {evento.horario}
          {dias > 0 && ` · faltam ${dias} ${dias === 1 ? "dia" : "dias"}`}
        </p>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-primary-foreground/50">Conectado como</p>
          <p className="truncate text-xs text-primary-foreground/90">{sessionEmail}</p>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          title="Sair"
          aria-label="Sair"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-primary-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Menu lateral fixo (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{menu}</aside>

      {/* Menu lateral em gaveta (celular) */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMenuAberto(false)}
            className="absolute inset-0 bg-navy-deep/60"
          />
          <div className="relative h-full w-72 max-w-[85vw] shadow-2xl">
            {menu}
            <button
              type="button"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-lg text-primary-foreground/70 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Barra do topo */}
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3.5 sm:px-8">
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {SECOES[secao].titulo}
              </h1>
              <p className="hidden truncate text-sm text-muted-foreground sm:block">
                {SECOES[secao].descricao}
              </p>
            </div>
            {atualizadoEm && (
              <p className="hidden text-xs text-muted-foreground md:block">
                Atualizado às{" "}
                {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <button type="button" onClick={carregar} disabled={carregando} className={botao}>
              <RefreshCw
                className={`size-4 ${carregando ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
          {erro && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <span>{erro}</span>
              <button type="button" onClick={() => setErro("")} aria-label="Fechar aviso">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {secao === "visao" && (
            <VisaoGeral
              principal={principal}
              reserva={reserva}
              setores={setores}
              dias={dias}
              onAbrirLista={irPara}
            />
          )}
          {(secao === "principal" || secao === "reserva") && (
            <ListaInscricoes
              key={`${secao}-${empresaInicial ?? ""}`}
              lista={secao}
              pessoas={secao === "principal" ? principal : reserva}
              posicao={posicao}
              setores={setores}
              empresaInicial={empresaInicial}
              acoes={acoes}
            />
          )}
          {secao === "setores" && (
            <SetoresAba
              pessoas={[...principal, ...reserva]}
              setores={setores}
              acoes={acoes}
              onErro={setErro}
              onSetoresAlterados={carregar}
            />
          )}
          {secao === "coordenadores" && (
            <CoordenadoresAba
              inscricoes={principal}
              nomeGrupo={NOME_GRUPO}
              setores={setores}
              onTransferido={(id, coordenadorId) => alterar(id, { coordenador_id: coordenadorId })}
              onSetorAlterado={(id, setor) => alterar(id, { setor })}
            />
          )}
        </main>
      </div>
    </div>
  );
}
