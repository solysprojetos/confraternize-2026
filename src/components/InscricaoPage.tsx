import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ConvitePlayer, ConviteEmPreparacao } from "@/components/ConvitePlayer";
import { evento, temVideoConvite } from "@/config/evento";
import { useRevelar } from "@/hooks/useRevelar";
import { digitosDoTelefone, formatarTelefone } from "@/lib/telefone";
import {
  enviarProgresso,
  iniciarSessao,
  limparEstado,
  lerEstadoSalvo,
  registrarInscricao,
  salvarEstado,
  type EstadoConvite,
} from "@/lib/conviteSessao";
import sgroupPng from "@/assets/logos/sgroup.png";
import sgroupWebp from "@/assets/logos/sgroup.webp";
import solysPng from "@/assets/logos/solys.png";
import solysWebp from "@/assets/logos/solys.webp";
import supportPng from "@/assets/logos/support.png";
import supportWebp from "@/assets/logos/support.webp";

/** Rola até o elemento e leva o foco junto, respeitando movimento reduzido. */
function irAte(elemento: HTMLElement | null | undefined) {
  if (!elemento) return;
  const semMovimento =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elemento.scrollIntoView({ behavior: semMovimento ? "auto" : "smooth", block: "start" });
  elemento.focus({ preventScroll: true });
}

/** As empresas continuam gravadas na coluna "grupo" do banco. */
const empresas = [
  { value: "grupo_support", label: "Grupo Support" },
  { value: "sgroup", label: "SGroup Nacional" },
  { value: "solys", label: "Solys Gestão Administrativa" },
  { value: "parceiros", label: "Parceiros" },
  { value: "convidados", label: "Convidados" },
];

/** Só três das empresas têm logo oficial; a do Grupo Support é branca. */
const logos = [
  { label: "Grupo Support", png: supportPng, webp: supportWebp, fundoEscuro: true },
  { label: "SGroup Nacional", png: sgroupPng, webp: sgroupWebp, fundoEscuro: false },
  { label: "Solys Gestão Administrativa", png: solysPng, webp: solysWebp, fundoEscuro: false },
];

const schema = z.object({
  nome_completo: z.string().trim().min(3, "Informe seu nome completo").max(120),
  grupo: z.enum(["sgroup", "solys", "grupo_support", "parceiros", "convidados"], {
    message: "Selecione a sua empresa",
  }),
  telefone: z
    .string()
    .trim()
    .refine((v) => digitosDoTelefone(v).length >= 10, "Informe um telefone com DDD")
    .refine((v) => digitosDoTelefone(v).length <= 11, "Telefone muito longo"),
  email: z.string().trim().email("Informe um e-mail válido").max(255),
});

function Logo({
  webp,
  png,
  alt,
  className,
}: {
  webp: string;
  png: string;
  alt: string;
  className: string;
}) {
  return (
    <picture>
      <source srcSet={webp} type="image/webp" />
      <img src={png} alt={alt} className={className} loading="lazy" decoding="async" />
    </picture>
  );
}

export function InscricaoPage() {
  const [form, setForm] = useState({
    nome_completo: "",
    grupo: "",
    telefone: "",
    email: "",
  });
  const [resposta, setResposta] = useState<"sim" | "nao">("sim");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmou, setConfirmou] = useState(true);
  const [qrUrl, setQrUrl] = useState("");
  const [inscricaoId, setInscricaoId] = useState("");
  const [emailStatus, setEmailStatus] = useState<"" | "enviando" | "ok" | "erro">("");

  const [liberado, setLiberado] = useState(false);
  // Só perguntamos "sim ou não" quando o banco sabe registrar a recusa
  const [aceitaResposta, setAceitaResposta] = useState(false);
  const [abriuFormulario, setAbriuFormulario] = useState(false);
  // Muda a cada convite novo: força o player a recomeçar do zero
  const [tentativa, setTentativa] = useState(0);
  const convite = useRef<EstadoConvite | null>(null);
  const filaTrechos = useRef<number[]>([]);
  const duracaoRef = useRef(0);
  const enviandoRef = useRef(false);
  const secaoConfirmacao = useRef<HTMLDivElement>(null);
  const destinoConfirmacao = useRef<HTMLDivElement>(null);
  const secaoConvite = useRef<HTMLElement>(null);
  const temVideo = temVideoConvite();

  useRevelar(`${abriuFormulario}-${done}-${liberado}`);

  function guardar(estado: EstadoConvite) {
    convite.current = estado;
    setAceitaResposta(estado.aceitaResposta);
    salvarEstado(estado);
  }

  // Leva o foco para a seção certa quando a página troca de momento. Precisa
  // ser um efeito: no clique, o destino ainda não foi montado pelo React.
  const momentoAnterior = useRef({ done: false, abriu: false });
  useEffect(() => {
    const antes = momentoAnterior.current;
    if (done && !antes.done) irAte(destinoConfirmacao.current);
    else if (!done && antes.done) irAte(secaoConvite.current);
    else if (!abriuFormulario && antes.abriu) irAte(secaoConvite.current);
    momentoAnterior.current = { done, abriu: abriuFormulario };
  }, [done, abriuFormulario]);

  // Retoma a liberação já obtida nesta mesma sessão do navegador
  useEffect(() => {
    const salvo = lerEstadoSalvo();
    if (!salvo) return;
    convite.current = salvo;
    duracaoRef.current = salvo.duracao;
    setAceitaResposta(salvo.aceitaResposta);
    if (salvo.concluido) setLiberado(true);
  }, []);

  const abrirSessao = useCallback(async (duracao: number) => {
    duracaoRef.current = duracao;
    if (convite.current) return;
    try {
      const estado = await iniciarSessao(duracao);
      if (estado) guardar(estado);
    } catch {
      /* o progresso é reenviado nas próximas chamadas */
    }
  }, []);

  const mandarProgresso = useCallback(async (trechos: number[], duracao: number) => {
    duracaoRef.current = duracao || duracaoRef.current;
    filaTrechos.current.push(...trechos);
    const sessao = convite.current?.sessao;
    if (!sessao || enviandoRef.current || filaTrechos.current.length === 0) return;
    enviandoRef.current = true;
    const lote = filaTrechos.current;
    filaTrechos.current = [];
    try {
      const retorno = await enviarProgresso(sessao, lote, duracaoRef.current);
      if (retorno?.concluido && convite.current) {
        guardar({ ...convite.current, concluido: true });
      }
    } catch {
      filaTrechos.current = [...lote, ...filaTrechos.current];
    } finally {
      enviandoRef.current = false;
    }
  }, []);

  const concluirConvite = useCallback(
    async (duracao: number) => {
      duracaoRef.current = duracao || duracaoRef.current;
      setLiberado(true);
      if (!convite.current?.sessao) return;
      await mandarProgresso([], duracaoRef.current);
      if (convite.current) {
        guardar({ ...convite.current, concluido: true, duracao: duracaoRef.current });
      }
    },
    [mandarProgresso],
  );

  /** Recomeça o convite do zero: sessão nova no servidor e player remontado. */
  function reiniciarConvite() {
    limparEstado();
    convite.current = null;
    filaTrechos.current = [];
    duracaoRef.current = 0;
    setLiberado(false);
    setAceitaResposta(false);
    setAbriuFormulario(false);
    setTentativa((n) => n + 1);
  }

  function abrirConfirmacao() {
    setAbriuFormulario(true);
    window.requestAnimationFrame(() => {
      secaoConfirmacao.current?.scrollIntoView({
        behavior:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        block: "start",
      });
      secaoConfirmacao.current?.querySelector<HTMLInputElement>("#nome")?.focus({
        preventScroll: true,
      });
    });
  }

  function validarCampo(campo: keyof typeof form) {
    const analise = schema.safeParse(form);
    const problema = analise.success
      ? undefined
      : analise.error.issues.find((i) => i.path[0] === campo);
    setErrors((atuais) => {
      const proximos = { ...atuais };
      if (problema) proximos[campo] = problema.message;
      else delete proximos[campo];
      return proximos;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // protege contra cliques repetidos
    const analise = schema.safeParse(form);
    if (!analise.success) {
      const proximos: Record<string, string> = {};
      for (const issue of analise.error.issues) proximos[String(issue.path[0])] = issue.message;
      setErrors(proximos);
      // Leva o foco ao primeiro campo com problema
      const ordem = ["nome_completo", "telefone", "email", "grupo"] as const;
      const primeiro = ordem.find((campo) => proximos[campo]);
      const seletor =
        primeiro === "grupo"
          ? 'input[name="empresa"]'
          : primeiro === "nome_completo"
            ? "#nome"
            : `#${primeiro}`;
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(seletor)?.focus({ preventScroll: false }),
      );
      return;
    }
    if (!liberado) {
      setAbriuFormulario(false);
      return;
    }
    setErrors({});
    setLoading(true);
    const comparecera = !aceitaResposta || resposta === "sim";
    // O id é gerado aqui para virar o código do convite (QR) sem precisar ler
    // o registro de volta do banco
    const id = crypto.randomUUID();
    const { error } = await registrarInscricao(convite.current?.sessao ?? null, {
      ...analise.data,
      id,
      comparecera,
    });
    setLoading(false);
    if (error) {
      if (error.code === "42501") {
        const jaUsada = /já registrou/i.test(error.message ?? "");
        reiniciarConvite();
        setErrors({
          form: jaUsada
            ? "Este convite já registrou uma resposta. Para responder por outra pessoa, assista ao convite novamente."
            : "Precisamos confirmar que o convite foi assistido até o fim. Reproduza o vídeo novamente.",
        });
        return;
      }
      setErrors({
        form:
          error.code === "23505"
            ? "Este e-mail já respondeu ao convite."
            : error.code === "SEM_COLUNA_RESPOSTA"
              ? "Não conseguimos registrar sua resposta agora. Avise a organização por outro caminho."
              : "Não foi possível registrar sua resposta agora. Tente novamente.",
      });
      return;
    }
    setInscricaoId(id);
    setConfirmou(comparecera);
    // A sessão do convite é de uso único: depois de aceita, não serve de novo
    limparEstado();
    if (comparecera) {
      // A biblioteca do QR code só é baixada quando há presença confirmada
      const { default: QRCode } = await import("qrcode");
      setQrUrl(await QRCode.toDataURL(`CONFRA2026:${id}`, { width: 480, margin: 2 }));
      setEmailStatus("enviando");
      supabase.functions
        .invoke("enviar-convite", { body: { id } })
        .then(({ data, error: erroFn }) => {
          const ok = !erroFn && (data as { ok?: boolean } | null)?.ok === true;
          setEmailStatus(ok ? "ok" : "erro");
        })
        .catch(() => setEmailStatus("erro"));
    }
    setDone(true);
  }

  const nomeDaEmpresa = empresas.find((e) => e.value === form.grupo)?.label ?? "";

  function textoConvite() {
    return [
      "CONFRATERNIZAÇÃO 2026 — Presença confirmada",
      "",
      `Nome: ${form.nome_completo}`,
      `Empresa: ${nomeDaEmpresa}`,
      "",
      `Data: ${evento.dataExtenso}`,
      `Início às ${evento.horario}`,
      `Local: ${evento.endereco}`,
      "",
      `Código do convite: ${inscricaoId}`,
      "Apresente o QR code na entrada.",
    ].join("\n");
  }

  function enviarEmail() {
    const assunto = "Convite — Confraternização 2026";
    window.location.href = `mailto:${encodeURIComponent(form.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(textoConvite())}`;
  }

  function enviarWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(textoConvite())}`, "_blank");
  }

  function baixarQr() {
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `convite-confraternizacao-2026-${(form.nome_completo.split(" ")[0] ?? "convidado").toLowerCase()}.png`;
    a.click();
  }

  const rotulo = "block text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground";
  const campo =
    "mt-2.5 w-full border-0 border-b bg-transparent px-0 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/75 focus:border-gold-deep";
  const campoOk = "border-b-border";
  const campoErro = "border-b-destructive/70";

  return (
    <main className="relative min-h-screen bg-background">
      {/* Halo claro no topo, como na primeira versão do convite */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-accent to-transparent"
        aria-hidden="true"
      />

      {/* O convite é uma peça só, no formato de quem abre pelo celular */}
      <div className="relative mx-auto w-full max-w-[560px] px-3 pb-12 pt-4 sm:px-6 sm:pb-16 sm:pt-10">
        <article className="border border-border bg-card shadow-[0_26px_60px_-48px_rgba(16,36,64,0.7)]">
          {/* ================= ABERTURA ================= */}
          <section
            ref={secaoConvite}
            tabIndex={-1}
            className="px-5 pb-7 pt-9 text-center outline-none sm:px-9 sm:pb-8 sm:pt-12"
          >
            <span
              className="filete mx-auto block h-px w-14 bg-gold-deep/55 sm:w-16"
              aria-hidden="true"
            />
            <p className="revelar mt-6 text-[10px] font-medium uppercase tracking-[0.4em] text-gold-texto">
              Convite oficial
            </p>
            <h1
              className="revelar mt-5 font-display text-[clamp(1.85rem,8vw,2.7rem)] font-normal leading-[1.08] tracking-[-0.015em] text-foreground"
              style={{ "--atraso": "60ms" } as React.CSSProperties}
            >
              Confraternização 2026
            </h1>
            <p
              className="revelar mx-auto mt-4 max-w-[19rem] font-display text-[clamp(1rem,4.4vw,1.2rem)] leading-snug text-muted-foreground sm:max-w-none"
              style={{ "--atraso": "120ms" } as React.CSSProperties}
            >
              <span className="block sm:inline">Um ano de conquistas.</span>{" "}
              <span className="block sm:inline">Um encontro para celebrar.</span>
            </p>
            <p
              className="revelar mt-7 text-[11px] uppercase leading-[1.9] tracking-[0.16em] text-muted-foreground sm:text-[12px]"
              style={{ "--atraso": "180ms" } as React.CSSProperties}
            >
              <span className="block">19 de dezembro de 2026</span>
              <span className="block">
                <span className="whitespace-nowrap">16h30</span>
                <span className="mx-2.5" aria-hidden="true">
                  ·
                </span>
                <span className="whitespace-nowrap">Maraponga, Fortaleza</span>
              </span>
            </p>
          </section>

          {/* ================= O VÍDEO ================= */}
          <div className="px-5 sm:px-9">
            {temVideo ? (
              <ConvitePlayer
                key={tentativa}
                onTrechosAssistidos={mandarProgresso}
                onConcluir={concluirConvite}
                onDuracao={abrirSessao}
                concluido={liberado}
              />
            ) : (
              <ConviteEmPreparacao />
            )}
          </div>

          {/* ================= A CHAMADA ================= */}
          <div className="px-5 pb-8 pt-6 sm:px-9 sm:pb-10 sm:pt-7">
            {(liberado || done) && (
              <p
                className="mb-6 text-center text-[15px] leading-relaxed text-foreground"
                aria-live="polite"
              >
                {done
                  ? confirmou
                    ? "Sua presença está confirmada. O convite fica logo abaixo."
                    : "Sua resposta foi registrada. Obrigado por avisar."
                  : "Agora queremos saber se podemos contar com a sua presença."}
              </p>
            )}

            <button
              type="button"
              aria-disabled={!liberado}
              aria-label={
                liberado
                  ? undefined
                  : "Confirmar minha presença. Disponível depois de assistir ao convite."
              }
              onClick={() => {
                if (!liberado) return;
                if (done) irAte(destinoConfirmacao.current);
                else abrirConfirmacao();
              }}
              className={`flex min-h-[56px] w-full items-center justify-center px-6 text-[11px] font-semibold uppercase tracking-[0.24em] transition-colors duration-300 ${
                done
                  ? "border border-border text-muted-foreground hover:border-gold-deep hover:text-foreground"
                  : liberado
                    ? "border border-primary bg-primary text-primary-foreground hover:bg-transparent hover:text-primary"
                    : "cursor-not-allowed border border-border bg-surface text-muted-foreground"
              }`}
            >
              {done ? "Ver minha resposta" : "Confirmar minha presença"}
            </button>

            {errors["form"] && !abriuFormulario && (
              <p className="mt-5 text-center text-sm text-destructive" role="alert">
                {errors["form"]}
              </p>
            )}
          </div>

          {/* ================= RESPOSTA ================= */}
          <div ref={secaoConfirmacao}>
            {done ? (
              <section className="abrir textura-papel textura-papel--clara border-t border-border">
                <div
                  ref={destinoConfirmacao}
                  tabIndex={-1}
                  className="px-5 py-9 outline-none sm:px-9 sm:py-11"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-gold-texto">
                    {confirmou ? "Presença confirmada" : "Resposta registrada"}
                  </p>
                  <span
                    className="filete mt-5 block h-px w-full max-w-[120px] bg-gold-deep/40"
                    aria-hidden="true"
                  />
                  <h2 className="mt-5 font-display text-[clamp(1.6rem,6.5vw,2.1rem)] font-normal leading-[1.12] text-foreground">
                    {confirmou ? "Presença confirmada." : "Obrigado por avisar."}
                  </h2>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                    {confirmou
                      ? "Será uma alegria celebrar este momento com você."
                      : "Sentiremos sua falta. Sua resposta foi registrada com a organização."}
                  </p>

                  <dl className="mt-8 border-t border-border">
                    {[
                      { rotulo: "Nome", valor: form.nome_completo },
                      { rotulo: "Empresa", valor: nomeDaEmpresa },
                      ...(confirmou
                        ? [
                            { rotulo: "Data", valor: evento.dataExtenso },
                            { rotulo: "Início", valor: evento.horario },
                            { rotulo: "Local", valor: evento.endereco },
                          ]
                        : []),
                    ].map((linha) => (
                      <div key={linha.rotulo} className="border-b border-border py-4">
                        <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                          {linha.rotulo}
                        </dt>
                        <dd className="mt-1.5 text-[15px] leading-relaxed text-foreground">
                          {linha.valor}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {confirmou && qrUrl && (
                    <div className="mt-9">
                      <div className="flex flex-col items-center gap-5 text-center">
                        <img
                          src={qrUrl}
                          alt="QR code do convite"
                          className="h-40 w-40 border border-border bg-white p-2"
                        />
                        <div className="text-[13px] leading-relaxed text-muted-foreground">
                          <p className="text-foreground">Este é o seu convite.</p>
                          <p className="mt-1">Salve a imagem e apresente o código na entrada.</p>
                          {emailStatus === "enviando" && (
                            <p className="mt-3">Enviando o convite por e-mail...</p>
                          )}
                          {emailStatus === "ok" && (
                            <p className="mt-3 text-foreground">
                              Enviamos uma cópia para {form.email}.
                            </p>
                          )}
                          {emailStatus === "erro" && (
                            <p className="mt-3">
                              Não conseguimos enviar o e-mail agora, mas sua presença está
                              confirmada.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-8 grid gap-3">
                        <button
                          type="button"
                          onClick={baixarQr}
                          className="flex min-h-[56px] items-center justify-center border border-primary bg-primary px-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition-colors hover:bg-transparent hover:text-primary"
                        >
                          Baixar convite
                        </button>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={enviarEmail}
                            className="flex min-h-[56px] items-center justify-center border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition-colors hover:border-gold-deep"
                          >
                            E-mail
                          </button>
                          <button
                            type="button"
                            onClick={enviarWhatsApp}
                            className="flex min-h-[56px] items-center justify-center border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition-colors hover:border-gold-deep"
                          >
                            WhatsApp
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      // A sessão do convite é de uso único: quem responde agora
                      // precisa assistir ao convite outra vez.
                      reiniciarConvite();
                      setForm({ nome_completo: "", grupo: "", telefone: "", email: "" });
                      setResposta("sim");
                      setQrUrl("");
                      setInscricaoId("");
                      setEmailStatus("");
                      setErrors({});
                      setDone(false);
                    }}
                    className="mt-9 flex min-h-[44px] w-full items-center justify-center text-[11px] uppercase tracking-[0.24em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Responder por outra pessoa
                  </button>
                </div>
              </section>
            ) : (
              abriuFormulario && (
                <section className="abrir textura-papel textura-papel--clara border-t border-border">
                  <div className="px-5 py-9 sm:px-9 sm:py-11">
                    <span
                      className="filete block h-px w-full max-w-[120px] bg-gold-deep/40"
                      aria-hidden="true"
                    />
                    <h2 className="mt-5 font-display text-[clamp(1.6rem,6.5vw,2.1rem)] font-normal leading-[1.12] text-foreground">
                      Podemos contar com você?
                    </h2>

                    <form onSubmit={handleSubmit} noValidate className="mt-8">
                      <div className="grid gap-7">
                        <div>
                          <label htmlFor="nome" className={rotulo}>
                            Nome completo
                          </label>
                          <input
                            id="nome"
                            className={`${campo} ${errors["nome_completo"] ? campoErro : campoOk}`}
                            value={form.nome_completo}
                            maxLength={120}
                            autoComplete="name"
                            placeholder="Como você quer ser chamado no convite"
                            aria-invalid={Boolean(errors["nome_completo"])}
                            aria-describedby="erro-nome"
                            onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                            onBlur={() => validarCampo("nome_completo")}
                          />
                          <p
                            id="erro-nome"
                            role="alert"
                            className="mt-2 min-h-[1.25rem] text-sm text-destructive"
                          >
                            {errors["nome_completo"] ?? ""}
                          </p>
                        </div>

                        <div>
                          <label htmlFor="telefone" className={rotulo}>
                            Telefone ou WhatsApp
                          </label>
                          <input
                            id="telefone"
                            type="tel"
                            inputMode="tel"
                            className={`${campo} ${errors["telefone"] ? campoErro : campoOk}`}
                            value={form.telefone}
                            maxLength={16}
                            autoComplete="tel"
                            placeholder="(85) 99999-8888"
                            aria-invalid={Boolean(errors["telefone"])}
                            aria-describedby="erro-telefone"
                            onChange={(e) =>
                              setForm({ ...form, telefone: formatarTelefone(e.target.value) })
                            }
                            onBlur={() => validarCampo("telefone")}
                          />
                          <p
                            id="erro-telefone"
                            role="alert"
                            className="mt-2 min-h-[1.25rem] text-sm text-destructive"
                          >
                            {errors["telefone"] ?? ""}
                          </p>
                        </div>

                        <div>
                          <label htmlFor="email" className={rotulo}>
                            E-mail
                          </label>
                          <input
                            id="email"
                            type="email"
                            className={`${campo} ${errors["email"] ? campoErro : campoOk}`}
                            value={form.email}
                            maxLength={255}
                            autoComplete="email"
                            placeholder="voce@empresa.com.br"
                            aria-invalid={Boolean(errors["email"])}
                            aria-describedby="erro-email"
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            onBlur={() => validarCampo("email")}
                          />
                          <p
                            id="erro-email"
                            role="alert"
                            className="mt-2 min-h-[1.25rem] text-sm text-destructive"
                          >
                            {errors["email"] ?? ""}
                          </p>
                        </div>
                      </div>

                      <fieldset className="mt-8">
                        <legend className={rotulo}>Empresa</legend>
                        <div className="mt-3 border-t border-border">
                          {empresas.map((empresa) => {
                            const ativa = form.grupo === empresa.value;
                            return (
                              <label
                                key={empresa.value}
                                className="flex min-h-[56px] cursor-pointer items-center gap-4 border-b border-border transition-colors hover:bg-surface has-[:focus-visible]:bg-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-gold-deep"
                              >
                                <input
                                  type="radio"
                                  name="empresa"
                                  value={empresa.value}
                                  checked={ativa}
                                  onChange={() => {
                                    setForm({ ...form, grupo: empresa.value });
                                    setErrors((atuais) => {
                                      const proximos = { ...atuais };
                                      delete proximos["grupo"];
                                      return proximos;
                                    });
                                  }}
                                  className="sr-only"
                                />
                                <span
                                  className={`h-px transition-all duration-300 ${
                                    ativa ? "w-8 bg-gold-deep" : "w-3 bg-border"
                                  }`}
                                  aria-hidden="true"
                                />
                                <span
                                  className={`py-4 text-[15px] transition-colors ${
                                    ativa ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                >
                                  {empresa.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <p role="alert" className="mt-2 min-h-[1.25rem] text-sm text-destructive">
                          {errors["grupo"] ?? ""}
                        </p>
                      </fieldset>

                      {aceitaResposta && (
                        <fieldset className="mt-6">
                          <legend className={rotulo}>Confirmarei presença</legend>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            {[
                              { valor: "sim" as const, texto: "Sim, estarei lá" },
                              { valor: "nao" as const, texto: "Não poderei ir" },
                            ].map((opcao) => {
                              const ativa = resposta === opcao.valor;
                              return (
                                <label
                                  key={opcao.valor}
                                  className={`flex min-h-[56px] cursor-pointer items-center justify-center border px-3 text-center text-[13px] leading-snug transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-deep ${
                                    ativa
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border text-muted-foreground hover:border-gold-deep hover:text-foreground"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="presenca"
                                    value={opcao.valor}
                                    checked={ativa}
                                    onChange={() => setResposta(opcao.valor)}
                                    className="sr-only"
                                  />
                                  {opcao.texto}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}

                      {errors["form"] && (
                        <p
                          className="mt-7 border-l-2 border-destructive/70 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                          role="alert"
                        >
                          {errors["form"]}
                        </p>
                      )}

                      <div className="mt-8 border-t border-border pt-7">
                        <button
                          type="submit"
                          disabled={loading}
                          aria-busy={loading}
                          className="flex min-h-[56px] w-full items-center justify-center gap-3 border border-primary bg-primary px-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition-colors hover:bg-transparent hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loading && (
                            <span
                              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                              aria-hidden="true"
                            />
                          )}
                          {loading
                            ? "Registrando..."
                            : !aceitaResposta || resposta === "sim"
                              ? "Enviar confirmação"
                              : "Enviar resposta"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAbriuFormulario(false);
                          }}
                          className="mt-4 flex min-h-[44px] w-full items-center justify-center text-[11px] uppercase tracking-[0.24em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Voltar ao convite
                        </button>
                      </div>
                    </form>
                  </div>
                </section>
              )
            )}
          </div>

          {/* ================= O EVENTO ================= */}
          <section className="border-t border-border bg-surface/70 px-5 py-9 sm:px-9 sm:py-10">
            <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-gold-texto">
              O evento
            </p>

            <dl className="mt-6">
              <div className="revelar border-t border-border py-5">
                <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Data
                </dt>
                <dd className="mt-2.5 font-display text-[1.45rem] leading-tight text-foreground">
                  19 de dezembro
                </dd>
                <dd className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Sábado · 2026
                </dd>
              </div>

              <div
                className="revelar border-t border-border py-5"
                style={{ "--atraso": "80ms" } as React.CSSProperties}
              >
                <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Início
                </dt>
                <dd className="mt-2.5 font-display text-[1.45rem] leading-tight text-foreground">
                  16h30
                </dd>
                <dd className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Recepção
                </dd>
              </div>

              <div
                className="revelar border-y border-border py-5"
                style={{ "--atraso": "160ms" } as React.CSSProperties}
              >
                <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Local
                </dt>
                <dd className="mt-2.5 text-[15px] leading-relaxed text-foreground">
                  Av. Godofredo Maciel, 1179
                  <br />
                  Maraponga, Fortaleza – CE
                  <br />
                  <span className="text-muted-foreground">60714-175</span>
                </dd>
              </div>
            </dl>

            <a
              href={evento.mapa}
              target="_blank"
              rel="noreferrer"
              className="group mt-5 flex min-h-[56px] items-center justify-center gap-2 border border-border bg-card text-[11px] uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep hover:text-gold-texto"
            >
              Ver localização
              <span
                className="transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </a>
          </section>

          {/* ================= REALIZAÇÃO ================= */}
          <div className="border-t border-border px-5 py-8 text-center sm:px-9">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Uma realização
            </p>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-4">
              {logos.map((logo) => (
                <li key={logo.label}>
                  {/* A logo do Grupo Support é branca: só aparece sobre fundo escuro */}
                  <span
                    className={`flex h-[52px] w-[92px] items-center justify-center px-3 sm:h-[60px] sm:w-[112px] ${
                      logo.fundoEscuro ? "bg-navy" : ""
                    }`}
                  >
                    <Logo
                      webp={logo.webp}
                      png={logo.png}
                      alt={logo.label}
                      className="max-h-7 w-auto max-w-full object-contain sm:max-h-8"
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-8 border-t border-border pt-6 text-[10px] uppercase leading-[2] tracking-[0.24em] text-muted-foreground">
              Confraternização 2026
              <span className="block">19 de dezembro · 16h30 · Fortaleza</span>
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}
