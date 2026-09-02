import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/AdminPage";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Área restrita — Celebra 2026" }],
  }),
  component: AdminPage,
});
