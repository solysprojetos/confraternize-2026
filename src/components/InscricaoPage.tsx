import { useState } from "react";
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

// Sigla para grupos sem logo (Parceiros/Convidados) e como reserva caso a
// imagem não carregue
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
  if (!src || failed) {
    return (
      <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-accent text-lg font-bold tracking-wide text-primary">
        {sigla}
      </span>
    );
  }
  // Logos maiores e sem caixa de fundo; só o Grupo Support (logo branco)
  // mantém o cartão dourado
  return (
    <span
      className={`flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden ${
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
    const { error } = await supabase.from("inscricoes").insert(parsed.data);
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
    setDone(true);
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
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Celebra 2026
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Preencha seus dados para confirmar sua presença.
          </p>
        </header>

        {done ? (
          <div className="mt-10 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-foreground">Inscrição confirmada!</h2>
            <p className="mt-2 text-muted-foreground">
              Obrigado, {form.nome_completo.split(" ")[0]}. Nos vemos na Celebra 2026.
            </p>
            <button
              type="button"
              onClick={() => {
                setForm({
                  nome_completo: "",
                  telefone: "",
                  email: "",
                  grupo: "",
                });
                setDone(false);
              }}
              className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
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
