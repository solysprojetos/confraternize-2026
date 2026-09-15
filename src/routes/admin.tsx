import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/AdminPage";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Inscrições — Confraternização 2026" },
      {
        name: "description",
        content: "Área restrita para acompanhamento das confirmações da Confraternização 2026.",
      },
      { property: "og:title", content: "Inscrições — Confraternização 2026" },
      {
        property: "og:description",
        content: "Área restrita para acompanhamento das confirmações da Confraternização 2026.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});
