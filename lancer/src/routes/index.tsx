import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/features/shell/app-shell";

export const Route = createFileRoute("/")({
  component: AppShell,
});
