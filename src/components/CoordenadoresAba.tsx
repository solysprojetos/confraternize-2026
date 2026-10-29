import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setores } from "@/config/evento";
import type { Inscricao } from "@/components/AdminPage";

type Grupo = Inscricao["grupo"];

type Coordenador = {
  id: string;
  nome: string;
  grupo: Grupo;
  created_at: string;
};

// A tabela coordenadores e as funções de transferência vivem nas migrações
// 20261029120000_coordenadores.sql e 20261029140000_transferir_setor.sql e
// ainda não constam no arquivo de tipos gerado pelo Supabase — daí o cliente
// sem tipagem.
const db = supabase as unknown as SupabaseClient;

const botaoSecundario =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent";

const seletor =
  "h-9 max-w-full rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60";

const SEM_COORDENADOR = "";
/** Valor do filtro por coordenador que mostra só quem não tem nenhum. */
const FILTRO_SEM = "sem";

/** Quem não tem setor (convidados, parceiros, cadastros antigos) entra em "Outros". */
const OUTROS = "Outros";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const setorDe = (i: Inscricao) => (i.setor && setores.includes(i.setor) ? i.setor : OUTROS);

export function CoordenadoresAba({
  inscricoes,
  nomeGrupo,
  onTransferido,
  onSetorAlterado,
}: {
  /** Só as pessoas com presença confirmada. */
  inscricoes: Inscricao[];
  nomeGrupo: Record<Grupo, string>;
  onTransferido: (inscricaoId: string, coordenadorId: string | null) => void;
  onSetorAlterado: (inscricaoId: string, setor: string | null) => void;
}) {
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Grupo>("todos");
  const [novoNome, setNovoNome] = useState<Partial<Record<Grupo, string>>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  /** Coordenador escolhido no filtro de cada empresa (ou "" para ver todos). */
  const [coordFiltro, setCoordFiltro] = useState<Partial<Record<Grupo, string>>>({});

  const grupos = Object.keys(nomeGrupo) as Grupo[];
  const colunas = [...setores, OUTROS];

  async function carregar() {
    setErro("");
    setCarregando(true);
    const { data, error } = await db
      .from("coordenadores")
      .select("*")
      .order("created_at", { ascending: true });
    setCarregando(false);
    if (error) {
      setErro("Não foi possível carregar os coordenadores.");
      return;
    }
    setCoordenadores((data ?? []) as Coordenador[]);
  }

  useEffect(() => {
    carregar();
  }, []);

  const porId = useMemo(() => new Map(coordenadores.map((c) => [c.id, c])), [coordenadores]);

  /** Coordenador válido da pessoa, ou null se ela aponta para um já apagado. */
  const coordenadorDe = (i: Inscricao) =>
    i.coordenador_id && porId.has(i.coordenador_id) ? i.coordenador_id : null;

  async function criarCoordenador(nome: string, grupo: Grupo, chave: string) {
    setErro("");
    setSalvando(chave);
    const { data, error } = await db
      .from("coordenadores")
      .insert({ nome, grupo })
      .select()
      .single();
    setSalvando(null);
    if (error) {
      setErro("Não foi possível adicionar o coordenador.");
      return null;
    }
    const novo = data as Coordenador;
    setCoordenadores((atual) => [...atual, novo]);
    return novo;
  }

  async function adicionar(grupo: Grupo) {
    const nome = (novoNome[grupo] ?? "").trim();
    if (nome.length < 2) return;
    if (await criarCoordenador(nome, grupo, `novo-${grupo}`)) {
      setNovoNome((atual) => ({ ...atual, [grupo]: "" }));
    }
  }

  /** Transforma uma pessoa confirmada em coordenador da empresa dela. */
  async function tornarCoordenador(i: Inscricao) {
    const novo = await criarCoordenador(i.nome_completo.trim(), i.grupo, `coord-${i.id}`);
    // A própria pessoa passa a ficar sob a sua coordenação
    if (novo) await transferir(i, novo.id);
  }

  const ehCoordenador = (i: Inscricao) =>
    coordenadores.some(
      (c) => c.grupo === i.grupo && normalizar(c.nome) === normalizar(i.nome_completo),
    );

  async function remover(c: Coordenador) {
    const quantos = inscricoes.filter((i) => coordenadorDe(i) === c.id).length;
    const aviso =
      quantos > 0
        ? `Remover ${c.nome}? ${quantos} ${quantos === 1 ? "pessoa fica" : "pessoas ficam"} sem coordenador.`
        : `Remover ${c.nome}?`;
    if (!window.confirm(aviso)) return;
    setErro("");
    setSalvando(c.id);
    const { error } = await db.from("coordenadores").delete().eq("id", c.id);
    setSalvando(null);
    if (error) {
      setErro("Não foi possível remover o coordenador.");
      return;
    }
    setCoordenadores((atual) => atual.filter((x) => x.id !== c.id));
    setCoordFiltro((atual) => (atual[c.grupo] === c.id ? { ...atual, [c.grupo]: "" } : atual));
    // O banco já soltou as pessoas (ON DELETE SET NULL); a tela acompanha
    for (const i of inscricoes) if (coordenadorDe(i) === c.id) onTransferido(i.id, null);
  }

  async function transferir(i: Inscricao, destino: string) {
    const coordenadorId = destino === SEM_COORDENADOR ? null : destino;
    if (coordenadorDe(i) === coordenadorId) return;
    setErro("");
    setSalvando(i.id);
    const { error } = await db.rpc("admin_transferir_coordenador", {
      p_inscricao: i.id,
      p_coordenador: coordenadorId,
    });
    setSalvando(null);
    if (error) {
      setErro(`Não foi possível transferir ${i.nome_completo}.`);
      return;
    }
    onTransferido(i.id, coordenadorId);
  }

  async function mudarSetor(i: Inscricao, destino: string) {
    const setor = destino === OUTROS ? null : destino;
    if (setorDe(i) === (setor ?? OUTROS)) return;
    setErro("");
    setSalvando(i.id);
    const { error } = await db.rpc("admin_transferir_setor", {
      p_inscricao: i.id,
      p_setor: setor,
    });
    setSalvando(null);
    if (error) {
      setErro(`Não foi possível mudar o setor de ${i.nome_completo}.`);
      return;
    }
    onSetorAlterado(i.id, setor);
  }

  function seletorSetor(i: Inscricao) {
    return (
      <select
        value={setorDe(i)}
        disabled={salvando === i.id}
        onChange={(e) => mudarSetor(i, e.target.value)}
        aria-label={`Setor de ${i.nome_completo}`}
        title="Mudar de setor"
        className={`${seletor} w-full sm:w-40`}
      >
        {colunas.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    );
  }

  function seletorCoordenador(i: Inscricao) {
    if (coordenadores.length === 0) {
      return (
        <span className="text-xs text-muted-foreground">
          Cadastre um coordenador para transferir
        </span>
      );
    }
    // Coordenadores da própria empresa primeiro, depois os demais
    const ordem = [i.grupo, ...grupos.filter((g) => g !== i.grupo)];
    const atual = coordenadorDe(i) ?? SEM_COORDENADOR;
    return (
      <select
        value={atual}
        disabled={salvando === i.id}
        onChange={(e) => transferir(i, e.target.value)}
        aria-label={`Coordenador de ${i.nome_completo}`}
        title="Transferir para outro coordenador"
        className={`${seletor} w-full sm:w-52`}
      >
        <option value={SEM_COORDENADOR}>{atual ? "Tirar do coordenador" : "Coordenador…"}</option>
        {ordem.map((g) => {
          const doGrupo = coordenadores.filter((c) => c.grupo === g);
          if (doGrupo.length === 0) return null;
          return (
            <optgroup key={g} label={nomeGrupo[g]}>
              {doGrupo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    );
  }

  function linhaPessoa(i: Inscricao) {
    return (
      <li
        key={i.id}
        className="flex flex-col gap-2 py-2.5 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{i.nome_completo}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[i.cargo && i.cargo !== i.setor ? i.cargo : null, i.telefone]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {seletorSetor(i)}
          {seletorCoordenador(i)}
          {!ehCoordenador(i) && (
            <button
              type="button"
              onClick={() => tornarCoordenador(i)}
              disabled={salvando === `coord-${i.id}`}
              title="Cadastra esta pessoa como coordenador da empresa dela"
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-gold-deep hover:bg-accent/60 disabled:opacity-50"
            >
              Tornar coordenador
            </button>
          )}
        </div>
      </li>
    );
  }

  const gruposVisiveis = filtro === "todos" ? grupos : [filtro];

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["todos", ...grupos] as const).map((g) => {
            const ativo = filtro === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setFiltro(g)}
                aria-pressed={ativo}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-gold-deep hover:bg-accent/60"
                }`}
              >
                {g === "todos" ? "Todas as empresas" : nomeGrupo[g]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className={`${botaoSecundario} disabled:opacity-60`}
        >
          {carregando ? "Atualizando..." : "Atualizar coordenadores"}
        </button>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Em cada empresa as pessoas aparecem por setor. Ao lado de cada uma dá para mudar o setor,
        escolher o coordenador ou torná-la coordenadora.
      </p>

      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}

      <div className="mt-4 space-y-4">
        {gruposVisiveis.map((g) => {
          const pessoasDoGrupo = inscricoes.filter((i) => i.grupo === g);
          const coordsDoGrupo = coordenadores.filter((c) => c.grupo === g);
          const nome = novoNome[g] ?? "";
          const coordAtivo = coordFiltro[g] ?? "";
          const pessoasVisiveis =
            coordAtivo === ""
              ? pessoasDoGrupo
              : coordAtivo === FILTRO_SEM
                ? pessoasDoGrupo.filter((i) => !coordenadorDe(i))
                : pessoasDoGrupo.filter((i) => coordenadorDe(i) === coordAtivo);
          const semCoordenador = pessoasDoGrupo.filter((i) => !coordenadorDe(i)).length;
          return (
            <div key={g} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-2xl uppercase leading-none text-foreground">
                    {nomeGrupo[g]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {coordsDoGrupo.length}{" "}
                    {coordsDoGrupo.length === 1 ? "coordenador" : "coordenadores"} ·{" "}
                    {pessoasDoGrupo.length} {pessoasDoGrupo.length === 1 ? "pessoa" : "pessoas"}
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    adicionar(g);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNovoNome((atual) => ({ ...atual, [g]: e.target.value }))}
                    placeholder="Nome do coordenador"
                    aria-label={`Novo coordenador de ${nomeGrupo[g]}`}
                    maxLength={120}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 sm:w-56"
                  />
                  <button
                    type="submit"
                    disabled={nome.trim().length < 2 || salvando === `novo-${g}`}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                </form>
              </div>

              {/* Coordenadores da empresa: clique para ver só as pessoas de um */}
              <ul className="mt-4 flex flex-wrap gap-2">
                <li>
                  <button
                    type="button"
                    onClick={() => setCoordFiltro((a) => ({ ...a, [g]: "" }))}
                    aria-pressed={coordAtivo === ""}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      coordAtivo === ""
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-gold-deep hover:bg-accent/60"
                    }`}
                  >
                    Todos
                  </button>
                </li>
                {coordsDoGrupo.map((c) => {
                  const quantos = pessoasDoGrupo.filter((i) => coordenadorDe(i) === c.id).length;
                  const ativo = coordAtivo === c.id;
                  return (
                    <li key={c.id} className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => setCoordFiltro((a) => ({ ...a, [g]: ativo ? "" : c.id }))}
                        aria-pressed={ativo}
                        className={`flex items-baseline gap-2 rounded-l-lg border px-3 py-1.5 transition-colors ${
                          ativo
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-gold-deep hover:bg-accent/60"
                        }`}
                      >
                        <span className={`text-sm ${ativo ? "" : "text-foreground"}`}>
                          {c.nome}
                        </span>
                        <span
                          className={`text-xs tabular-nums ${ativo ? "" : "text-muted-foreground"}`}
                        >
                          {quantos}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(c)}
                        disabled={salvando === c.id}
                        aria-label={`Remover ${c.nome}`}
                        title="Remover coordenador"
                        className="rounded-r-lg border border-l-0 border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-50"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
                {coordsDoGrupo.length > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        setCoordFiltro((a) => ({
                          ...a,
                          [g]: coordAtivo === FILTRO_SEM ? "" : FILTRO_SEM,
                        }))
                      }
                      aria-pressed={coordAtivo === FILTRO_SEM}
                      className={`flex items-baseline gap-2 rounded-lg border border-dashed px-3 py-1.5 transition-colors ${
                        coordAtivo === FILTRO_SEM
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-gold-deep hover:bg-accent/60"
                      }`}
                    >
                      <span className="text-sm">Sem coordenador</span>
                      <span className="text-xs tabular-nums">{semCoordenador}</span>
                    </button>
                  </li>
                )}
              </ul>

              {/* Pessoas por setor */}
              {pessoasDoGrupo.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nenhuma presença confirmada nesta empresa.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {colunas.map((s) => {
                    const pessoas = pessoasVisiveis.filter((i) => setorDe(i) === s);
                    const total = pessoasDoGrupo.filter((i) => setorDe(i) === s).length;
                    if (total === 0) return null;
                    return (
                      <details key={s} open className="rounded-xl border border-border px-4">
                        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-3">
                          <span className="text-sm font-semibold text-foreground">
                            {s}{" "}
                            <span className="font-normal tabular-nums text-muted-foreground">
                              · {coordAtivo === "" ? total : `${pessoas.length} de ${total}`}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">mostrar/ocultar</span>
                        </summary>
                        {pessoas.length === 0 ? (
                          <p className="pb-3 text-sm text-muted-foreground">
                            Ninguém deste setor neste coordenador.
                          </p>
                        ) : (
                          <ul className="divide-y divide-border border-t border-border">
                            {pessoas.map(linhaPessoa)}
                          </ul>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
