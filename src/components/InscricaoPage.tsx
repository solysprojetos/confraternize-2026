import { useState } from "react";
import QRCode from "qrcode";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import sgroupLogo from "@/assets/logos/sgroup.png";
import solysLogo from "@/assets/logos/solys.png";
import supportLogo from "@/assets/logos/support.png";

const grupos = [
  {
    value: "grupo_support",
    label: "Grupo Support",
    sigla: "GS",
    logo: supportLogo,
    // Logo todo branco: fundo dourado para aparecer
    bg: "bg-gradient-to-br from-[#d4af37] to-[#a5761c]",
  },
  { value: "sgroup", label: "SGroup Nacional", sigla: "SG", logo: sgroupLogo, bg: "" },
  {
    value: "solys",
    label: "Solys Gestão Administrativa",
    sigla: "SO",
    logo: solysLogo,
    bg: "",
  },
  { value: "parceiros", label: "Parceiros", sigla: "PA", logo: null, bg: "" },
  { value: "convidados", label: "Convidados", sigla: "CO", logo: null, bg: "" },
];

const schema = z.object({
  nome_completo: z.string().trim().min(3, "Informe seu nome completo").max(120),
  telefone: z.string().trim().min(10, "Informe um telefone válido com DDD").max(20),
  email: z.string().trim().email("E-mail inválido").max(255),
  grupo: z.enum(["sgroup", "solys", "grupo_support", "parceiros", "convidados"], {
    message: "Selecione seu grupo",
  }),
});

// Grupos sem logo (Parceiros/Convidados) mostram apenas o nome; a sigla é a
// reserva caso a imagem não carregue
function GroupLogo({
  src,
  alt,
  sigla,
  bg,
}: {
  src: string | null;
  alt: string;
  sigla: string;
  bg: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src) return null;
  if (failed) {
    return (
      <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-accent text-lg font-bold tracking-wide text-primary">
        {sigla}
      </span>
    );
  }
  // Sem caixa de fundo; só o Grupo Support (logo branco) mantém o cartão dourado
  return (
    <span
      className={`flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden ${
        bg ? `rounded-lg p-2 ${bg}` : ""
      }`}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0])] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setLoading(true);
    // O id é gerado aqui para servir de código do convite (QR) sem precisar
    // ler o registro de volta do banco
    const id = crypto.randomUUID();
    const { error } = await supabase.from("inscricoes").insert({ ...parsed.data, id });
    setLoading(false);
    if (error) {
      setErrors({
        form:
          error.code === "23505"
            ? "Este e-mail já está inscrito."
            : "Não foi possível enviar. Tente novamente.",
      });
      return;
    }
    setInscricaoId(id);
    const qr = await QRCode.toDataURL(`CONFRA2026:${id}`, { width: 480, margin: 2 });
    setQrUrl(qr);
    setDone(true);
  }

  function textoConvite() {
    const grupoNome = grupos.find((g) => g.value === form.grupo)?.label ?? "";
    return [
      "CONFRATERNIZAÇÃO 2026 - Convite confirmado",
      "",
      `Nome: ${form.nome_completo}`,
      `Grupo: ${grupoNome}`,
      "",
      "Local: Av. Godofredo Maciel, 1179 - Maraponga, Fortaleza - CE, 60714-175",
      "Início às 16:30",
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

  const field =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40";

  return (
    <main className="min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-accent to-transparent" />
      <div className="relative mx-auto w-full max-w-xl px-5 py-14">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
            Inscrição oficial
          </p>
          <h1 className="mt-3 text-4xl font-bold uppercase tracking-tight text-foreground sm:text-5xl">
            Confraternização 2026
          </h1>
          <div className="mt-4 space-y-1 text-sm text-foreground">
            <p>Av. Godofredo Maciel, 1179 - Maraponga, Fortaleza - CE, 60714-175</p>
            <p className="font-medium">Início às 16:30</p>
          </div>
          <p className="mt-3 text-base text-muted-foreground">
            Preencha seus dados para confirmar sua presença.
          </p>
        </header>

        {done ? (
          <div className="mt-10 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-foreground">Inscrição confirmada!</h2>
            <p className="mt-2 text-muted-foreground">
              Obrigado, {form.nome_completo.split(" ")[0]}. Nos vemos na Confraternização 2026.
            </p>

            {qrUrl && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <img
                  src={qrUrl}
                  alt="QR code do convite"
                  className="h-44 w-44 rounded-xl border border-border bg-white p-2"
                />
                <p className="text-xs text-muted-foreground">
                  Este é o seu convite. Salve e apresente o QR code na entrada.
                </p>
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={baixarQr}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Baixar QR code
              </button>
              <button
                type="button"
                onClick={enviarEmail}
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Enviar por e-mail
              </button>
              <button
                type="button"
                onClick={enviarWhatsApp}
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Enviar no WhatsApp
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setForm({
                  nome_completo: "",
                  telefone: "",
                  email: "",
                  grupo: "",
                });
                setQrUrl("");
                setInscricaoId("");
                setDone(false);
              }}
              className="mt-6 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Inscrever outra pessoa
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          >
            <div>
              <label htmlFor="nome" className="mb-2 block text-sm font-medium text-foreground">
                Nome completo
              </label>
              <input
                id="nome"
                className={field}
                value={form.nome_completo}
                maxLength={120}
                placeholder="Seu nome completo"
                onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
              />
              {errors["nome_completo"] && (
                <p className="mt-1 text-sm text-destructive">{errors["nome_completo"]}</p>
              )}
            </div>

            <div>
              <label htmlFor="telefone" className="mb-2 block text-sm font-medium text-foreground">
                Telefone
              </label>
              <input
                id="telefone"
                type="tel"
                className={field}
                value={form.telefone}
                maxLength={20}
                placeholder="(11) 99999-9999"
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
              {errors["telefone"] && (
                <p className="mt-1 text-sm text-destructive">{errors["telefone"]}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                className={field}
                value={form.email}
                maxLength={255}
                placeholder="voce@empresa.com.br"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {errors["email"] && (
                <p className="mt-1 text-sm text-destructive">{errors["email"]}</p>
              )}
            </div>

            <fieldset>
              <legend className="mb-3 text-sm font-medium text-foreground">
                Você faz parte de qual grupo?
              </legend>
              <div className="grid gap-3">
                {grupos.map((g) => {
                  const active = form.grupo === g.value;
                  return (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setForm({ ...form, grupo: g.value })}
                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-primary bg-accent ring-2 ring-ring/40"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      <GroupLogo src={g.logo} alt={g.label} sigla={g.sigla} bg={g.bg} />
                      <span className="text-sm font-medium text-foreground">{g.label}</span>
                    </button>
                  );
                })}
              </div>
              {errors["grupo"] && (
                <p className="mt-1 text-sm text-destructive">{errors["grupo"]}</p>
              )}
            </fieldset>

            {errors["form"] && <p className="text-sm text-destructive">{errors["form"]}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Enviando..." : "Confirmar inscrição"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
