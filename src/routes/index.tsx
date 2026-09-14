import { createFileRoute } from "@tanstack/react-router";
import { InscricaoPage } from "@/components/InscricaoPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Confraternização 2026 — Convite oficial" },
      {
        name: "description",
        content:
          "Convite oficial da Confraternização 2026: sábado, 19 de dezembro, às 16h30, na Av. Godofredo Maciel, 1179, Maraponga, Fortaleza. Assista ao convite e confirme sua presença.",
      },
      { name: "theme-color", content: "#0d2440" },
      { property: "og:title", content: "Confraternização 2026 — Convite oficial" },
      {
        property: "og:description",
        content:
          "Convite oficial da Confraternização 2026: sábado, 19 de dezembro, às 16h30, na Av. Godofredo Maciel, 1179, Maraponga, Fortaleza. Assista ao convite e confirme sua presença.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
    ],
  }),
  component: InscricaoPage,
});
