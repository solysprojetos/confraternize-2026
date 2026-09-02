import { createFileRoute } from "@tanstack/react-router";
import { InscricaoPage } from "@/components/InscricaoPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inscrição — Celebra 2026" },
      {
        name: "description",
        content:
          "Garanta sua vaga na Celebra 2026. Preencha nome, telefone, e-mail e escolha seu grupo: SGroup, Solys ou Grupo Support.",
      },
      { property: "og:title", content: "Inscrição — Celebra 2026" },
      {
        property: "og:description",
        content: "Preencha o formulário e confirme sua presença na Celebra 2026.",
      },
    ],
  }),
  component: InscricaoPage,
});
