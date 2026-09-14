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

/** 01 — Assistir ao convite · 02 — Confirmar presença */
function Etapas({ etapa }: { etapa: 1 | 2 }) {
  const itens = [
    { numero: "01", titulo: "Assistir ao convite" },
    { numero: "02", titulo: "Confirmar presença" },
  ];
  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-14">
      {itens.map((item, i) => {
        const indice = (i + 1) as 1 | 2;
        const ativa = etapa >= indice;
        return (
          <li key={item.numero} className="flex items-baseline gap-3">
            <span
              className={`font-display text-[13px] tabular-nums ${ativa ? "text-gold" : "text-white/30"}`}
            >
              {item.numero}
            </span>
            <span
              className={`text-[11px] uppercase tracking-[0.24em] ${
                ativa ? "text-white/85" : "text-white/35"
              }`}
            >
              {item.titulo}
            </span>
            {ativa && <span className="h-px w-6 bg-gold/70 sm:w-10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
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
  const convite = useRef<EstadoConvite | null>(null);
  const filaTrechos = useRef<number[]>([]);
  const duracaoRef = useRef(0);
  const enviandoRef = useRef(false);
  const secaoConfirmacao = useRef<HTMLDivElement>(null);
  const secaoConvite = useRef<HTMLElement>(null);
  const temVideo = temVideoConvite();

  const etapa: 1 | 2 = abriuFormulario || done ? 2 : 1;
  useRevelar(`${etapa}-${done}-${liberado}`);

  function guardar(estado: EstadoConvite) {
    convite.current = estado;
    setAceitaResposta(estado.aceitaResposta);
    salvarEstado(estado);
  }

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

  function abrirConfirmacao() {
    setAbriuFormulario(true);
    window.requestAnimationFrame(() => {
      secaoConfirmacao.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        setLiberado(false);
        setAbriuFormulario(false);
        setErrors({
          form: "Precisamos confirmar que o convite foi assistido até o fim. Reproduza o vídeo novamente.",
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
    window.requestAnimationFrame(() =>
      secaoConfirmacao.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
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
    "mt-2.5 w-full border-0 border-b bg-transparent px-0 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-gold-deep";
  const campoOk = "border-b-border";
  const campoErro = "border-b-destructive/70";

  return (
    <main className="min-h-screen bg-background">
      {/* ================= O CONVITE ================= */}
      <section
        ref={secaoConvite}
        className="sobre-escuro textura-papel relative bg-navy text-white"
      >
        <div className="relative mx-auto w-full max-w-[1240px] px-6 sm:px-10 lg:px-14">
          <header className="flex items-center justify-between border-b border-white/10 py-5">
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">
              Confraternização 2026
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.3em] text-white/45 sm:block">
              Fortaleza · Ceará
            </span>
          </header>

          {/* Abertura */}
          <div className="mx-auto max-w-3xl pb-12 pt-14 text-center sm:pb-16 sm:pt-20">
            <p className="revelar flex items-center justify-center gap-4 text-[10px] font-medium uppercase tracking-[0.42em] text-gold">
              <span className="h-px w-8 bg-gold/50 sm:w-12" aria-hidden="true" />
              Convite oficial
              <span className="h-px w-8 bg-gold/50 sm:w-12" aria-hidden="true" />
            </p>
            <h1
              className="revelar mt-7 font-display text-[clamp(2.3rem,8vw,4.25rem)] font-normal leading-[1.05] tracking-[-0.015em]"
              style={{ "--atraso": "60ms" } as React.CSSProperties}
            >
              Confraternização 2026
            </h1>
            <p
              className="revelar mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-white/65 sm:text-base"
              style={{ "--atraso": "120ms" } as React.CSSProperties}
            >
              Um ano de conquistas. Um encontro para celebrar.
            </p>
            <p
              className="revelar mt-9 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.26em] text-white/70 sm:gap-x-6"
              style={{ "--atraso": "180ms" } as React.CSSProperties}
            >
              <span>19 de dezembro de 2026</span>
              <span className="h-1 w-1 rounded-full bg-gold" aria-hidden="true" />
              <span>16h30</span>
              <span className="h-1 w-1 rounded-full bg-gold" aria-hidden="true" />
              <span>Maraponga, Fortaleza</span>
            </p>
          </div>

          {/* O vídeo, no centro da página */}
          <div
            className="revelar mx-auto w-full max-w-[940px]"
            style={{ "--atraso": "120ms" } as React.CSSProperties}
          >
            {temVideo ? (
              <ConvitePlayer
                onTrechosAssistidos={mandarProgresso}
                onConcluir={concluirConvite}
                onDuracao={abrirSessao}
                concluido={liberado}
              />
            ) : (
              <ConviteEmPreparacao />
            )}
          </div>

          {/* Etapas e chamada para a confirmação */}
          <div className="mx-auto w-full max-w-[940px] pb-16 pt-10 sm:pb-24 sm:pt-12">
            <Etapas etapa={etapa} />

            <p
              className={`mt-8 text-center text-[15px] leading-relaxed ${
                liberado ? "text-white/85" : "text-white/55"
              }`}
              aria-live="polite"
            >
              {!temVideo
                ? "A confirmação de presença será aberta quando o convite em vídeo for publicado."
                : liberado
                  ? "Agora queremos saber se podemos contar com a sua presença."
                  : "Assista ao convite até o fim para abrir a confirmação de presença."}
            </p>

            <div className="mt-7 flex justify-center">
              <button
                type="button"
                disabled={!liberado}
                onClick={abrirConfirmacao}
                className={`w-full max-w-sm px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.26em] transition-colors duration-300 ${
                  liberado
                    ? "border border-gold bg-gold text-navy-deep hover:bg-transparent hover:text-gold"
                    : "cursor-not-allowed border border-white/25 text-white/50"
                }`}
              >
                Confirmar minha presença
              </button>
            </div>

            {errors["form"] && !abriuFormulario && (
              <p className="mt-5 text-center text-sm text-gold" role="alert">
                {errors["form"]}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ================= CONFIRMAÇÃO ================= */}
      <div ref={secaoConfirmacao}>
        {done ? (
          <section className="abrir textura-papel textura-papel--clara relative border-b border-border">
            <div className="mx-auto w-full max-w-[1240px] px-6 py-16 sm:px-10 sm:py-24 lg:px-14">
              <div className="mx-auto max-w-2xl">
                <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-gold-texto">
                  {confirmou ? "Presença confirmada" : "Resposta registrada"}
                </p>
                <h2 className="mt-6 font-display text-[clamp(1.9rem,5vw,2.9rem)] font-normal leading-[1.1] text-foreground">
                  {confirmou ? "Presença confirmada." : "Obrigado por avisar."}
                </h2>
                <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
                  {confirmou
                    ? "Será uma alegria celebrar este momento com você."
                    : "Sentiremos sua falta. Sua resposta foi registrada com a organização."}
                </p>

                <dl className="mt-12 border-t border-border">
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
                    <div
                      key={linha.rotulo}
                      className="flex flex-wrap gap-x-10 gap-y-1 border-b border-border py-4"
                    >
                      <dt className="w-20 shrink-0 pt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        {linha.rotulo}
                      </dt>
                      <dd className="flex-1 text-[15px] leading-relaxed text-foreground">
                        {linha.valor}
                      </dd>
                    </div>
                  ))}
                </dl>

                {confirmou && qrUrl && (
                  <div className="mt-12">
                    <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
                      <img
                        src={qrUrl}
                        alt="QR code do convite"
                        className="h-36 w-36 border border-border bg-white p-2"
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
                            Não conseguimos enviar o e-mail agora, mas sua presença está confirmada.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={baixarQr}
                        className="border border-primary bg-primary px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition-colors hover:bg-transparent hover:text-primary"
                      >
                        Baixar convite
                      </button>
                      <button
                        type="button"
                        onClick={enviarEmail}
                        className="border border-border px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep"
                      >
                        Enviar por e-mail
                      </button>
                      <button
                        type="button"
                        onClick={enviarWhatsApp}
                        className="border border-border px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep"
                      >
                        Enviar no WhatsApp
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    // A sessão do convite é de uso único: outra pessoa precisa
                    // assistir ao convite para que a resposta seja aceita.
                    limparEstado();
                    convite.current = null;
                    filaTrechos.current = [];
                    duracaoRef.current = 0;
                    setForm({ nome_completo: "", grupo: "", telefone: "", email: "" });
                    setResposta("sim");
                    setQrUrl("");
                    setInscricaoId("");
                    setEmailStatus("");
                    setErrors({});
                    setLiberado(false);
                    setAceitaResposta(false);
                    setDone(false);
                    setAbriuFormulario(false);
                    window.requestAnimationFrame(() =>
                      secaoConvite.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }}
                  className="mt-12 text-[11px] uppercase tracking-[0.24em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Responder por outra pessoa
                </button>
              </div>
            </div>
          </section>
        ) : (
          abriuFormulario && (
            <section className="abrir textura-papel textura-papel--clara relative border-b border-border">
              <div className="mx-auto w-full max-w-[1240px] px-6 py-16 sm:px-10 sm:py-24 lg:px-14">
                <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
                  <div className="lg:col-span-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-gold-texto">
                      Etapa 02
                    </p>
                    <h2 className="mt-6 font-display text-[clamp(1.8rem,4.4vw,2.6rem)] font-normal leading-[1.1] text-foreground">
                      Podemos contar com você?
                    </h2>
                    <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                      São quatro informações e uma resposta. Elas garantem o seu lugar e ajudam a
                      organização a preparar a noite.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="lg:col-span-8">
                    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                      <div className="sm:col-span-2">
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
                          aria-describedby={errors["nome_completo"] ? "erro-nome" : undefined}
                          onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                          onBlur={() => validarCampo("nome_completo")}
                        />
                        {errors["nome_completo"] && (
                          <p id="erro-nome" className="mt-2 text-sm text-destructive">
                            {errors["nome_completo"]}
                          </p>
                        )}
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
                          aria-describedby={errors["telefone"] ? "erro-telefone" : undefined}
                          onChange={(e) =>
                            setForm({ ...form, telefone: formatarTelefone(e.target.value) })
                          }
                          onBlur={() => validarCampo("telefone")}
                        />
                        {errors["telefone"] && (
                          <p id="erro-telefone" className="mt-2 text-sm text-destructive">
                            {errors["telefone"]}
                          </p>
                        )}
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
                          aria-describedby={errors["email"] ? "erro-email" : undefined}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          onBlur={() => validarCampo("email")}
                        />
                        {errors["email"] && (
                          <p id="erro-email" className="mt-2 text-sm text-destructive">
                            {errors["email"]}
                          </p>
                        )}
                      </div>
                    </div>

                    <fieldset className="mt-10">
                      <legend className={rotulo}>Empresa</legend>
                      <div
                        className="mt-3 border-t border-border"
                        role="radiogroup"
                        aria-label="Empresa"
                      >
                        {empresas.map((empresa) => {
                          const ativa = form.grupo === empresa.value;
                          return (
                            <button
                              key={empresa.value}
                              type="button"
                              role="radio"
                              aria-checked={ativa}
                              onClick={() => {
                                setForm({ ...form, grupo: empresa.value });
                                setErrors((atuais) => {
                                  const proximos = { ...atuais };
                                  delete proximos["grupo"];
                                  return proximos;
                                });
                              }}
                              className="flex w-full min-h-[56px] items-center gap-4 border-b border-border text-left transition-colors hover:bg-surface"
                            >
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
                            </button>
                          );
                        })}
                      </div>
                      {errors["grupo"] && (
                        <p className="mt-2 text-sm text-destructive">{errors["grupo"]}</p>
                      )}
                    </fieldset>

                    {aceitaResposta && (
                      <fieldset className="mt-10">
                        <legend className={rotulo}>Confirmarei presença</legend>
                        <div
                          className="mt-3 flex gap-3"
                          role="radiogroup"
                          aria-label="Confirmarei presença"
                        >
                          {[
                            { valor: "sim" as const, texto: "Sim, estarei lá" },
                            { valor: "nao" as const, texto: "Não poderei ir" },
                          ].map((opcao) => {
                            const ativa = resposta === opcao.valor;
                            return (
                              <button
                                key={opcao.valor}
                                type="button"
                                role="radio"
                                aria-checked={ativa}
                                onClick={() => setResposta(opcao.valor)}
                                className={`min-h-[56px] flex-1 border px-4 text-[13px] transition-colors ${
                                  ativa
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border text-muted-foreground hover:border-gold-deep hover:text-foreground"
                                }`}
                              >
                                {opcao.texto}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}

                    {errors["form"] && (
                      <p
                        className="mt-8 border-l-2 border-destructive/70 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                        role="alert"
                      >
                        {errors["form"]}
                      </p>
                    )}

                    <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border pt-8">
                      <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="flex min-h-[56px] items-center justify-center gap-3 border border-primary bg-primary px-9 text-[11px] font-semibold uppercase tracking-[0.26em] text-primary-foreground transition-colors hover:bg-transparent hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
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
                          secaoConvite.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "end",
                          });
                        }}
                        className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Voltar ao convite
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          )
        )}
      </div>

      {/* ================= O EVENTO ================= */}
      <section className="textura-papel textura-papel--clara relative">
        <div className="mx-auto w-full max-w-[1240px] px-6 py-16 sm:px-10 sm:py-24 lg:px-14">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-gold-texto">
                O evento
              </p>
              <span
                className="filete mt-6 block h-px w-full max-w-[180px] bg-gold-deep/40"
                aria-hidden="true"
              />
              <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                Uma noite para reunir quem construiu este ano com a gente. Chegue com calma: a
                recepção começa no horário marcado.
              </p>
            </div>

            <dl className="grid gap-y-8 lg:col-span-8 sm:grid-cols-3 sm:gap-x-10">
              <div className="revelar border-t border-border pt-5">
                <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Data
                </dt>
                <dd className="mt-3 font-display text-[1.6rem] leading-tight text-foreground">
                  19 de dezembro
                </dd>
                <dd className="mt-1 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
                  Sábado · 2026
                </dd>
              </div>
              <div
                className="revelar border-t border-border pt-5"
                style={{ "--atraso": "80ms" } as React.CSSProperties}
              >
                <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Início
                </dt>
                <dd className="mt-3 font-display text-[1.6rem] leading-tight text-foreground">
                  16h30
                </dd>
                <dd className="mt-1 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
                  Recepção
                </dd>
              </div>
              <div
                className="revelar border-t border-border pt-5"
                style={{ "--atraso": "160ms" } as React.CSSProperties}
              >
                <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Local
                </dt>
                <dd className="mt-3 text-[15px] leading-relaxed text-foreground">
                  Av. Godofredo Maciel, 1179
                  <br />
                  Maraponga, Fortaleza – CE
                  <br />
                  <span className="text-muted-foreground">60714-175</span>
                </dd>
                <a
                  href={evento.mapa}
                  target="_blank"
                  rel="noreferrer"
                  className="group mt-4 inline-flex min-h-[44px] items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-foreground underline-offset-4 hover:text-gold-texto hover:underline"
                >
                  Ver localização
                  <span
                    className="transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </a>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ================= REALIZAÇÃO ================= */}
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-[1240px] px-6 py-12 sm:px-10 sm:py-14 lg:px-14">
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Uma realização
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
              {logos.map((logo) => (
                <li key={logo.label}>
                  <span
                    className={
                      logo.fundoEscuro
                        ? "flex items-center justify-center bg-navy px-4 py-2.5"
                        : "flex items-center justify-center"
                    }
                  >
                    <Logo
                      webp={logo.webp}
                      png={logo.png}
                      alt={logo.label}
                      className="h-10 w-auto object-contain sm:h-12"
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 border-t border-border pt-6 text-center text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
            Confraternização 2026 · 19 de dezembro · 16h30 · Fortaleza
          </p>
        </div>
      </footer>
    </main>
  );
}
