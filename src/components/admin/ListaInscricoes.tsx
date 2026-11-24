import { useMemo, useState } from "react";
import { ArrowLeftRight, Download, Search } from "lucide-react";
import {
  botaoPrimario,
  cartao,
  dataCurta,
  ehReserva,
  entrada,
  GRUPOS,
  linkWhatsApp,
  NOME_GRUPO,
  normalizar,
  seletor,
  SEM_SETOR,
  type Grupo,
  type Inscricao,
} from "@/components/admin/comum";

export type AcoesInscricao = {
  ocupado: string | null;
  transferirEmpresa: (i: Inscricao, grupo: Grupo) => void;
  mudarSetor: (i: Inscricao, setor: string | null) => void;
  moverReserva: (i: Inscricao) => void;
};

function Convite({ i }: { i: Inscricao }) {
  return i.convite_enviado ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
      <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
      Enviado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
      <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      Na fila
    </span>
  );
}

export function ListaInscricoes({
  lista,
  pessoas,
  posicao,
  setores,
  empresaInicial,
  acoes,
}: {
  lista: "principal" | "reserva";
  pessoas: Inscricao[];
  posicao: Map<string, number>;
  setores: string[];
  empresaInicial: Grupo | null;
  acoes: AcoesInscricao;
}) {
  const [busca, setBusca] = useState("");
  const [empresa, setEmpresa] = useState<"todas" | Grupo>(empresaInicial ?? "todas");
  const [setor, setSetor] = useState("todos");

  const setorDe = (i: Inscricao) => (i.setor && setores.includes(i.setor) ? i.setor : SEM_SETOR);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return pessoas.filter((i) => {
      if (empresa !== "todas" && i.grupo !== empresa) return false;
      if (setor !== "todos" && setorDe(i) !== setor) return false;
      if (!termo) return true;
      return normalizar(`${i.nome_completo} ${i.email} ${i.telefone} ${i.cargo ?? ""}`).includes(
        termo,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas, busca, empresa, setor, setores]);

  const temFiltro = busca.trim() !== "" || empresa !== "todas" || setor !== "todos";

  function limpar() {
    setBusca("");
    setEmpresa("todas");
    setSetor("todos");
  }

  function exportar() {
    const linhas = [
      [
        "Nº",
        "Nome completo",
        "Telefone",
        "E-mail",
        "Empresa",
        "Setor",
        "Cargo",
        "Lista",
        "Convite por e-mail",
        "Data da inscrição",
      ],
      ...visiveis.map((i) => [
        posicao.get(i.id) ?? "",
        i.nome_completo,
        i.telefone,
        i.email,
        NOME_GRUPO[i.grupo],
        i.setor ?? "",
        i.cargo ?? "",
        ehReserva(i) ? "Cadastro reserva" : "Lista principal",
        i.convite_enviado ? "Enviado" : "Na fila",
        new Date(i.created_at).toLocaleString("pt-BR"),
      ]),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${lista === "reserva" ? "cadastro-reserva" : "lista-principal"}-confraternizacao-2026.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const seletorEmpresa = (i: Inscricao) => (
    <select
      value={i.grupo}
      disabled={acoes.ocupado === i.id}
      onChange={(e) => acoes.transferirEmpresa(i, e.target.value as Grupo)}
      aria-label={`Empresa de ${i.nome_completo}`}
      title="Transferir para outra empresa"
      className={`${seletor} -ml-1.5 w-full`}
    >
      {GRUPOS.map((g) => (
        <option key={g} value={g}>
          {NOME_GRUPO[g]}
        </option>
      ))}
    </select>
  );

  const seletorSetor = (i: Inscricao) => (
    <select
      value={setorDe(i)}
      disabled={acoes.ocupado === i.id}
      onChange={(e) => acoes.mudarSetor(i, e.target.value === SEM_SETOR ? null : e.target.value)}
      aria-label={`Setor de ${i.nome_completo}`}
      title="Mudar de setor"
      className={`${seletor} -ml-1.5 w-full ${setorDe(i) === SEM_SETOR ? "text-muted-foreground" : ""}`}
    >
      {[...setores, SEM_SETOR].map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );

  const botaoMover = (i: Inscricao) => (
    <button
      type="button"
      onClick={() => acoes.moverReserva(i)}
      disabled={acoes.ocupado === i.id}
      title={
        lista === "reserva" ? "Passar para a lista principal" : "Mover para o cadastro reserva"
      }
      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
    >
      <ArrowLeftRight className="size-3.5" aria-hidden="true" />
      {lista === "reserva" ? "Passar para a lista" : "Para reserva"}
    </button>
  );

  const telefone = (i: Inscricao) => {
    const whats = linkWhatsApp(i.telefone);
    return whats ? (
      <a
        href={whats}
        target="_blank"
        rel="noreferrer"
        title="Abrir no WhatsApp"
        className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
      >
        {i.telefone}
      </a>
    ) : (
      <span className="text-foreground">{i.telefone}</span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtros e ações */}
      <div className={`${cartao} flex flex-col gap-3 p-3 xl:flex-row xl:items-center`}>
        <div className="relative xl:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, e-mail ou telefone"
            aria-label="Buscar inscrição"
            className={`${entrada} pl-9`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value as "todas" | Grupo)}
            aria-label="Filtrar por empresa"
            className={`${entrada} sm:w-56`}
          >
            <option value="todas">Todas as empresas</option>
            {GRUPOS.map((g) => (
              <option key={g} value={g}>
                {NOME_GRUPO[g]}
              </option>
            ))}
          </select>
          <select
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
            aria-label="Filtrar por setor"
            className={`${entrada} sm:w-44`}
          >
            <option value="todos">Todos os setores</option>
            {[...setores, SEM_SETOR].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 xl:ml-auto">
          <button
            type="button"
            onClick={exportar}
            className={`${botaoPrimario} flex-1 xl:flex-none`}
          >
            <Download className="size-4" aria-hidden="true" />
            Exportar
          </button>
        </div>
      </div>

      <p className="px-1 text-sm text-muted-foreground">
        {temFiltro ? (
          <>
            Mostrando <strong className="font-semibold text-foreground">{visiveis.length}</strong>{" "}
            de {pessoas.length} ·{" "}
            <button
              type="button"
              onClick={limpar}
              className="text-foreground underline underline-offset-2"
            >
              limpar filtros
            </button>
          </>
        ) : (
          <>
            <strong className="font-semibold text-foreground">{pessoas.length}</strong>{" "}
            {lista === "reserva"
              ? "no cadastro reserva"
              : pessoas.length === 1
                ? "pessoa na lista principal"
                : "pessoas na lista principal"}
          </>
        )}
      </p>

      {visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center text-sm text-muted-foreground">
          {pessoas.length === 0
            ? lista === "reserva"
              ? "Ninguém no cadastro reserva."
              : "Nenhuma inscrição ainda."
            : "Nenhuma inscrição encontrada com esses filtros."}
        </div>
      ) : (
        <>
          {/* Computador: tabela */}
          <div className={`${cartao} hidden overflow-x-auto lg:block`}>
            <table className="w-full min-w-[980px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-14" />
                <col />
                <col className="w-48" />
                <col className="w-40" />
                <col className="w-[8.5rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[8.75rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/60 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Nº</th>
                  <th className="px-4 py-2.5 font-semibold">Convidado</th>
                  <th className="px-4 py-2.5 font-semibold">Empresa</th>
                  <th className="px-4 py-2.5 font-semibold">Setor</th>
                  <th className="px-4 py-2.5 font-semibold">Telefone</th>
                  <th className="px-4 py-2.5 font-semibold">Convite</th>
                  <th className="px-4 py-2.5 font-semibold">Inscrição</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visiveis.map((i) => (
                  <tr key={i.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {posicao.get(i.id)}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="truncate font-medium text-foreground">{i.nome_completo}</p>
                      <p className="truncate text-xs text-muted-foreground">{i.email}</p>
                    </td>
                    <td className="px-4 py-2.5">{seletorEmpresa(i)}</td>
                    <td className="px-4 py-2.5">{seletorSetor(i)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{telefone(i)}</td>
                    <td className="px-4 py-2.5">
                      <Convite i={i} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {dataCurta(i.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{botaoMover(i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: cartões */}
          <ul className="space-y-2 lg:hidden">
            {visiveis.map((i) => (
              <li key={i.id} className={`${cartao} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{i.nome_completo}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.email}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    nº {posicao.get(i.id)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border px-2">{seletorEmpresa(i)}</div>
                  <div className="rounded-lg border border-border px-2">{seletorSetor(i)}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  {telefone(i)}
                  <Convite i={i} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {dataCurta(i.created_at)}
                  </span>
                  {botaoMover(i)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
