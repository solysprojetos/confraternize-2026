import { createFileRoute } from "@tanstack/react-router";
import { InscricaoPage } from "@/components/InscricaoPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inscrição — Confraternização 2026" },
      {
        name: "description",
        content:
          "Garanta sua vaga na Confraternização 2026. Preencha nome, telefone, e-mail e escolha seu grupo: SGroup, Solys ou Grupo Support.",
      },
      { property: "og:title", content: "Inscrição — Confraternização 2026" },
      {
        property: "og:description",
        content: "Preencha o formulário e confirme sua presença na Confraternização 2026.",
      },
    ],
  }),
  component: InscricaoPage,
});
