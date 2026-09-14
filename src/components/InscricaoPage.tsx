import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ConvitePlayer, ConviteEmPreparacao } from "@/components/ConvitePlayer";
import { evento, temVideoConvite } from "@/config/evento";
import { digitosDoTelefone, formatarTelefone } from "@/lib/telefone";
import {
  enviarProgresso,
  iniciarSessao,
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

type Grupo = {
  value: string;
  label: string;
  sigla: string;
  png: string | null;
  webp: string | null;
  /** A logo do Grupo Support é branca: precisa de fundo escuro para aparecer. */
  fundoEscuro: boolean;
};

const grupos: Grupo[] = [
  {
    value: "grupo_support",
    label: "Grupo Support",
    sigla: "GS",
    png: supportPng,
    webp: supportWebp,
    fundoEscuro: true,
  },
  {
    value: "sgroup",
    label: "SGroup Nacional",
    sigla: "SG",
    png: sgroupPng,
    webp: sgroupWebp,
    fundoEscuro: false,
  },
  {
    value: "solys",
    label: "Solys Gestão Administrativa",
    sigla: "SO",
    png: solysPng,
    webp: solysWebp,
    fundoEscuro: false,
  },
  {
    value: "parceiros",
    label: "Parceiros",
    sigla: "PA",
    png: null,
    webp: null,
    fundoEscuro: false,
  },
  {
    value: "convidados",
    label: "Convidados",
    sigla: "CO",
    png: null,
    webp: null,
    fundoEscuro: false,
  },
];

const schema = z.object({
  nome_completo: z.string().trim().min(3, "Informe seu nome completo").max(120),
  telefone: z
    .string()
    .trim()
    .refine((v) => digitosDoTelefone(v).length >= 10, "Informe um telefone com DDD")
    .refine((v) => digitosDoTelefone(v).length <= 11, "Telefone muito longo"),
  email: z.string().trim().email("Informe um e-mail válido").max(255),
  grupo: z.enum(["sgroup", "solys", "grupo_support", "parceiros", "convidados"], {
    message: "Selecione o seu grupo",
  }),
});

const IconeCalendario = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
    <path
      d="M7 3v3m10-3v3M3.5 9.5h17M5 5.5h14a1.5 1.5 0 011.5 1.5v12A1.5 1.5 0 0119 20.5H5A1.5 1.5 0 013.5 19V7A1.5 1.5 0 015 5.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const IconeRelogio = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M12 7.5V12l3 1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const IconeLocal = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
    <path
      d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0012 4.3a6.5 6.5 0 00-6.5 6.5C5.5 15.4 12 21 12 21z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle cx="12" cy="10.6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/** Logo oficial: WebP para quem suporta, PNG como reserva. */
function Logo({
  webp,
  png,
  alt,
  sigla,
  className,
}: {
  webp: string | null;
  png: string | null;
  alt: string;
  sigla: string;
  className: string;
}) {
  const [falhou, setFalhou] = useState(false);
  if (!png) return null;
  if (falhou) {
    return (
      <span className="text-sm font-semibold tracking-wide text-primary" aria-hidden="true">
        {sigla}
      </span>
    );
  }
  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={png}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setFalhou(true)}
      />
    </picture>
  );
}

function Etapas({ etapa }: { etapa: 1 | 2 }) {
  const itens = [
    { numero: 1 as const, titulo: "Assistir ao convite" },
    { numero: 2 as const, titulo: "Confirmar presença" },
  ];
  return (
    <ol className="flex items-center gap-3 text-xs sm:text-[13px]">
      {itens.map((item, i) => {
        const concluida = etapa > item.numero;
        const atual = etapa === item.numero;
        return (
          <li key={item.numero} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  concluida
                    ? "bg-gold text-navy-deep"
                    : atual
                      ? "bg-white text-navy"
                      : "border border-white/30 text-white/60"
                }`}
                aria-hidden="true"
              >
                {concluida ? "✓" : item.numero}
              </span>
              <span className={atual || concluida ? "text-white" : "text-white/55"}>
                {item.titulo}
              </span>
            </span>
            {i === 0 && <span className="h-px w-6 bg-white/25 sm:w-10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function FaixaLogos() {
  return (
    <section className="border-t border-border/70">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-7 px-6 py-12 sm:px-8 sm:py-14">
        <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-muted-foreground">
          Uma realização
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16">
          {grupos
            .filter((g) => g.png)
            .map((g) => (
              <li key={g.value} className="flex items-center justify-center">
                {/* A logo do Grupo Support é branca: só aparece sobre fundo escuro */}
                <span
                  className={
                    g.fundoEscuro
                      ? "flex items-center justify-center rounded-md bg-navy px-4 py-2.5"
                      : "flex items-center justify-center"
                  }
                >
                  <Logo
                    webp={g.webp}
                    png={g.png}
                    alt={g.label}
                    sigla={g.sigla}
                    className="h-12 w-auto object-contain sm:h-14"
                  />
                </span>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}

function InformacoesEvento({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <p className="text-sm text-white/75">
        {evento.dataExtenso} · Início às {evento.horario} · {evento.bairro}
      </p>
    );
  }
  const itens = [
    { Icone: IconeCalendario, rotulo: "Data", valor: evento.dataExtenso, destaque: true },
    { Icone: IconeRelogio, rotulo: "Início", valor: evento.horario, destaque: false },
    { Icone: IconeLocal, rotulo: "Local", valor: evento.endereco, destaque: false },
  ];
  return (
    <dl className="divide-y divide-white/10 border-y border-white/10">
      {itens.map(({ Icone, rotulo, valor, destaque }) => (
        <div key={rotulo} className="flex items-start gap-4 py-4">
          <span className="mt-0.5 h-[18px] w-[18px] shrink-0 text-gold/90" aria-hidden="true">
            <Icone />
          </span>
          <dt className="w-16 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
            {rotulo}
          </dt>
          <dd
            className={
              destaque
                ? "font-display text-lg leading-snug text-white sm:text-xl"
                : "text-pretty text-[15px] leading-relaxed text-white/80"
            }
          >
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function InscricaoPage() {
  const [form, setForm] = useState({
    nome_completo: "",
    telefone: "",
    email: "",
    grupo: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [inscricaoId, setInscricaoId] = useState("");
  const [emailStatus, setEmailStatus] = useState<"" | "enviando" | "ok" | "erro">("");

  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [liberado, setLiberado] = useState(false);
  const convite = useRef<EstadoConvite | null>(null);
  const filaTrechos = useRef<number[]>([]);
  const duracaoRef = useRef(0);
  const enviandoRef = useRef(false);
  const tituloFormulario = useRef<HTMLHeadingElement>(null);
  const temVideo = temVideoConvite();

  function guardar(estado: EstadoConvite) {
    convite.current = estado;
    salvarEstado(estado);
  }

  // Retoma a liberação já obtida nesta mesma sessão do navegador
  useEffect(() => {
    const salvo = lerEstadoSalvo();
    if (!salvo) return;
    convite.current = salvo;
    duracaoRef.current = salvo.duracao;
    if (salvo.concluido) setLiberado(true);
  }, []);

  const abrirSessao = useCallback(async (duracao: number) => {
    duracaoRef.current = duracao;
    if (convite.current) return;
    try {
      const estado = await iniciarSessao(duracao);
      // Servidor sem a liberação por vídeo: a trava continua valendo no
      // navegador e a inscrição segue pelo caminho antigo.
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
      const resposta = await enviarProgresso(sessao, lote, duracaoRef.current);
      if (resposta?.concluido && convite.current) {
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

  function irParaFormulario() {
    setEtapa(2);
    window.requestAnimationFrame(() => {
      tituloFormulario.current?.focus();
      tituloFormulario.current?.scrollIntoView({ block: "center" });
    });
  }

  function validarCampo(campo: keyof typeof form) {
    const parsed = schema.safeParse(form);
    const problema = parsed.success
      ? undefined
      : parsed.error.issues.find((i) => i.path[0] === campo);
    setErrors((atuais) => {
      const proximos = { ...atuais };
      if (problema) proximos[campo] = problema.message;
      else delete proximos[campo];
      return proximos;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // proteção contra cliques repetidos
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    if (!liberado) {
      setEtapa(1);
      return;
    }
    setErrors({});
    setLoading(true);
    // O id é gerado aqui para servir de código do convite (QR) sem precisar
    // ler o registro de volta do banco
    const id = crypto.randomUUID();
    const { error } = await registrarInscricao(convite.current?.sessao ?? null, {
      ...parsed.data,
      id,
    });
    setLoading(false);
    if (error) {
      if (error.code === "42501") {
        setLiberado(false);
        setEtapa(1);
        setErrors({
          form: "Precisamos confirmar que o convite foi assistido até o final. Reproduza o vídeo novamente.",
        });
        return;
      }
      setErrors({
        form:
          error.code === "23505"
            ? "Este e-mail já está inscrito."
            : "Não foi possível confirmar sua presença agora. Tente novamente.",
      });
      return;
    }
    setInscricaoId(id);
    // A biblioteca do QR code só é baixada quando a presença é confirmada
    const { default: QRCode } = await import("qrcode");
    const qr = await QRCode.toDataURL(`CONFRA2026:${id}`, { width: 480, margin: 2 });
    setQrUrl(qr);
    setDone(true);
    // Dispara o e-mail de convite com o QR code em segundo plano
    setEmailStatus("enviando");
    supabase.functions
      .invoke("enviar-convite", { body: { id } })
      .then(({ data, error: fnError }) => {
        const ok = !fnError && (data as { ok?: boolean } | null)?.ok === true;
        setEmailStatus(ok ? "ok" : "erro");
      })
      .catch(() => setEmailStatus("erro"));
  }

  const nomeDoGrupo = grupos.find((g) => g.value === form.grupo)?.label ?? "";

  function textoConvite() {
    return [
      "CONFRATERNIZAÇÃO 2026 - Presença confirmada",
      "",
      `Nome: ${form.nome_completo}`,
      `Grupo: ${nomeDoGrupo}`,
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
    const assunto = "Convite - Confraternização 2026";
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

  const rotulo =
    "mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground";
  const campo =
    "w-full rounded-lg border bg-card px-4 py-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-gold-deep focus:ring-2 focus:ring-gold-soft/50";
  const campoErro = "border-destructive/70";
  const campoOk = "border-border";

  const mostrarConvite = !done && etapa === 1;

  return (
    <main className="min-h-screen bg-background">
      {/* ---------------------------------------------------------------
          Abertura: azul-marinho profundo, papel e luzes de celebração
          --------------------------------------------------------------- */}
      <section className="sobre-escuro textura-papel relative overflow-hidden bg-navy text-white">
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 76% 4%, color-mix(in oklab, var(--navy-soft) 90%, transparent) 0%, transparent 62%)",
          }}
          aria-hidden="true"
        />
        <span className="luz-noturna left-[6%] top-[16%] h-40 w-40" aria-hidden="true" />
        <span
          className="luz-noturna right-[10%] top-[8%] h-24 w-24"
          style={{ animationDelay: "2.4s" }}
          aria-hidden="true"
        />
        <span
          className="luz-noturna bottom-[12%] left-[44%] h-20 w-20"
          style={{ animationDelay: "4.1s" }}
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent"
          aria-hidden="true"
        />

        <div
          className={`relative mx-auto w-full max-w-6xl px-6 sm:px-8 ${
            mostrarConvite ? "py-12 sm:py-16 lg:py-24" : "py-10 sm:py-14"
          }`}
        >
          {!done && (
            <div className="entrada">
              <Etapas etapa={etapa} />
            </div>
          )}

          {mostrarConvite ? (
            <div className="mt-12 grid gap-y-10 lg:mt-16 lg:grid-cols-12 lg:grid-rows-[auto_auto] lg:items-start lg:gap-x-16 lg:gap-y-10 lg:content-start">
              {/* Título, chamada e — no celular — a data logo de saída */}
              <div className="entrada lg:col-span-5 lg:col-start-1 lg:row-start-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
                  Convite oficial
                </p>
                <h1 className="mt-5 font-display text-[clamp(2.25rem,6.2vw,3.5rem)] leading-[1.04] tracking-[-0.01em] text-white">
                  {evento.nome}
                </h1>
                <span
                  className="filete-dourado mt-6 block h-px w-24 bg-gradient-to-r from-gold to-transparent"
                  aria-hidden="true"
                />
                <p className="mt-6 font-display text-[1.35rem] leading-snug text-white/90 sm:text-[1.65rem]">
                  {evento.chamada}
                </p>
                <p className="mt-5 text-[15px] text-white/60 lg:hidden">
                  {evento.dataExtenso} · Início às {evento.horario}
                </p>
              </div>

              {/* Convite em vídeo */}
              <div
                className="entrada lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1"
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

                <p
                  className={`mt-7 text-center text-[15px] ${liberado ? "text-gold" : "text-white/65"}`}
                  aria-live="polite"
                >
                  {!temVideo
                    ? "O convite em vídeo será publicado em breve."
                    : liberado
                      ? "Convite assistido. Agora confirme a sua presença."
                      : "Assista ao convite para liberar sua inscrição."}
                </p>

                <div className="mt-5">
                  <button
                    type="button"
                    disabled={!liberado}
                    onClick={irParaFormulario}
                    className={`w-full rounded-full px-7 py-4 text-base font-semibold tracking-wide transition-all duration-300 ${
                      liberado
                        ? "surgir bg-gold text-navy-deep shadow-[0_16px_38px_-18px_rgba(224,190,110,0.95)] hover:brightness-105"
                        : "cursor-not-allowed border border-white/25 bg-white/[0.04] text-white/55"
                    }`}
                  >
                    Confirmar minha presença
                  </button>
                  {!liberado && (
                    <p className="mt-3 text-center text-xs text-white/55">
                      {temVideo
                        ? "Disponível ao final do convite"
                        : "Disponível quando o convite for publicado"}
                    </p>
                  )}
                </div>

                {errors["form"] && (
                  <p className="mt-4 text-center text-sm text-gold" role="alert">
                    {errors["form"]}
                  </p>
                )}
              </div>

              {/* Texto de convite e informações do evento */}
              <div
                className="entrada lg:col-span-5 lg:col-start-1 lg:row-start-2"
                style={{ "--atraso": "220ms" } as React.CSSProperties}
              >
                <p className="max-w-md text-[15px] leading-relaxed text-white/65">
                  Chegamos ao fim de mais um ano de trabalho lado a lado. Preparamos um encontro
                  para celebrar o caminho que percorremos juntos e agradecer a cada pessoa que faz
                  parte dele.
                </p>
                <div className="mt-8">
                  <InformacoesEvento />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <h1 className="font-display text-2xl leading-tight text-white sm:text-3xl">
                {evento.nome}
              </h1>
              <div className="mt-2">
                <InformacoesEvento compacto />
              </div>
            </div>
          )}
        </div>
      </section>

      {mostrarConvite && <FaixaLogos />}

      {/* ---------------------------------------------------------------
          Confirmação de presença
          --------------------------------------------------------------- */}
      {!done && etapa === 2 && (
        <section className="textura-papel textura-papel--clara relative">
          <div className="surgir relative mx-auto w-full max-w-2xl px-6 py-14 sm:px-8 sm:py-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold-texto">
              Etapa 2
            </p>
            <h2
              ref={tituloFormulario}
              tabIndex={-1}
              className="mt-4 font-display text-[clamp(1.85rem,4.6vw,2.5rem)] leading-tight text-foreground"
            >
              Vamos confirmar sua presença?
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Preencha seus dados e selecione o grupo do qual você faz parte.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-8">
              <div className="grid gap-6 sm:grid-cols-2">
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
                    Telefone
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

              <fieldset>
                <legend className={rotulo}>Você faz parte de qual grupo?</legend>
                <div
                  className="mt-1 grid gap-2.5 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Grupo"
                >
                  {grupos.map((g, indice) => {
                    const ativo = form.grupo === g.value;
                    const ultimoSozinho = indice === grupos.length - 1 && grupos.length % 2 === 1;
                    return (
                      <button
                        key={g.value}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        onClick={() => {
                          setForm({ ...form, grupo: g.value });
                          setErrors((atuais) => {
                            const proximos = { ...atuais };
                            delete proximos["grupo"];
                            return proximos;
                          });
                        }}
                        className={`relative flex min-h-[68px] items-center gap-4 rounded-lg border px-4 py-3 text-left transition-all duration-200 ${
                          ultimoSozinho ? "sm:col-span-2" : ""
                        } ${
                          ativo
                            ? "border-primary/70 bg-card shadow-[0_1px_0_0_var(--gold)_inset,0_10px_24px_-20px_rgba(16,36,64,0.8)]"
                            : "border-border/80 bg-transparent hover:border-gold-soft hover:bg-card/60"
                        }`}
                      >
                        {g.png ? (
                          <span
                            className={`flex h-11 w-[70px] shrink-0 items-center justify-center ${
                              g.fundoEscuro ? "rounded-md bg-navy px-2.5 py-1.5" : ""
                            }`}
                          >
                            <Logo
                              webp={g.webp}
                              png={g.png}
                              alt={g.label}
                              sigla={g.sigla}
                              className="max-h-9 w-auto max-w-full object-contain"
                            />
                          </span>
                        ) : (
                          <span
                            className="flex h-11 w-[70px] shrink-0 items-center justify-center font-display text-lg text-muted-foreground"
                            aria-hidden="true"
                          >
                            {g.sigla}
                          </span>
                        )}
                        <span className="text-[15px] font-medium leading-snug text-foreground">
                          {g.label}
                        </span>
                        <span
                          className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                            ativo
                              ? "border-gold-deep bg-gold-deep text-white"
                              : "border-border text-transparent"
                          }`}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors["grupo"] && (
                  <p className="mt-2 text-sm text-destructive">{errors["grupo"]}</p>
                )}
              </fieldset>

              {errors["form"] && (
                <p
                  className="border-l-2 border-destructive/70 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  {errors["form"]}
                </p>
              )}

              <div className="border-t border-border/70 pt-8">
                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full bg-gold px-7 py-4 text-base font-semibold tracking-wide text-navy-deep shadow-[0_16px_38px_-20px_rgba(224,190,110,0.95)] transition-all duration-300 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {loading && (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-navy-deep/35 border-t-navy-deep"
                      aria-hidden="true"
                    />
                  )}
                  {loading ? "Confirmando presença..." : "Confirmar minha presença"}
                </button>

                <button
                  type="button"
                  onClick={() => setEtapa(1)}
                  className="mx-auto mt-5 block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Voltar ao convite
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------
          Presença confirmada
          --------------------------------------------------------------- */}
      {done && (
        <section className="textura-papel textura-papel--clara relative">
          <div className="surgir relative mx-auto w-full max-w-2xl px-6 py-14 sm:px-8 sm:py-20">
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/45 text-gold-deep">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <h2 className="mt-6 font-display text-[clamp(1.85rem,4.6vw,2.5rem)] leading-tight text-foreground">
                Presença confirmada!
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                Obrigado, {form.nome_completo.split(" ")[0]}. Guardamos o seu lugar na {evento.nome}
                .
              </p>
            </div>

            <dl className="mt-12 divide-y divide-border/70 border-y border-border/70">
              {[
                { rotulo: "Nome", valor: form.nome_completo },
                { rotulo: "Grupo", valor: nomeDoGrupo },
                { rotulo: "Data", valor: evento.dataExtenso },
                { rotulo: "Início", valor: evento.horario },
                { rotulo: "Local", valor: evento.endereco },
              ].map((linha) => (
                <div key={linha.rotulo} className="flex flex-wrap gap-x-8 gap-y-1 py-4">
                  <dt className="w-16 shrink-0 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {linha.rotulo}
                  </dt>
                  <dd className="flex-1 text-[15px] leading-relaxed text-foreground">
                    {linha.valor}
                  </dd>
                </div>
              ))}
            </dl>

            {qrUrl && (
              <div className="mt-12 flex flex-col items-center gap-3">
                <img
                  src={qrUrl}
                  alt="QR code do convite"
                  className="h-40 w-40 bg-white p-2 ring-1 ring-border"
                />
                <p className="text-center text-xs text-muted-foreground">
                  Este é o seu convite. Salve e apresente o QR code na entrada.
                </p>
                {emailStatus === "enviando" && (
                  <p className="text-xs text-muted-foreground">Enviando o convite por e-mail...</p>
                )}
                {emailStatus === "ok" && (
                  <p className="text-xs font-medium text-foreground">
                    Convite enviado para {form.email}.
                  </p>
                )}
                {emailStatus === "erro" && (
                  <p className="text-xs text-muted-foreground">
                    Não conseguimos enviar o e-mail agora, mas sua presença está confirmada.
                  </p>
                )}
              </div>
            )}

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={baixarQr}
                className="rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Baixar QR code
              </button>
              <button
                type="button"
                onClick={enviarEmail}
                className="rounded-full border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-gold-soft hover:bg-card"
              >
                Enviar por e-mail
              </button>
              <button
                type="button"
                onClick={enviarWhatsApp}
                className="rounded-full border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-gold-soft hover:bg-card"
              >
                Enviar no WhatsApp
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setForm({ nome_completo: "", telefone: "", email: "", grupo: "" });
                setQrUrl("");
                setInscricaoId("");
                setEmailStatus("");
                setDone(false);
                setEtapa(1);
              }}
              className="mx-auto mt-10 block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Inscrever outra pessoa
            </button>
          </div>
        </section>
      )}

      <footer className="border-t border-border/70">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs tracking-wide text-muted-foreground sm:px-8">
          {evento.nome} · {evento.dataExtenso} · Início às {evento.horario}
        </div>
      </footer>
    </main>
  );
}
