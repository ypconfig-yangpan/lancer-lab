import { StatusBadge, type StatusTone } from "@lancer/ui";
import type { PodPhase } from "@/entities/pod/types";

function phaseTone(phase: PodPhase): StatusTone {
  switch (phase) {
    case "Running":
      return "running";
    case "Succeeded":
      return "success";
    case "Pending":
    case "Terminating":
      return "warning";
    case "Failed":
      return "danger";
    default:
      return "neutral";
  }
}

/** Soft status for Pod phase — Spec §11 StatusBadge, not bordered Tag. */
export function PodPhaseBadge({ phase }: { phase: PodPhase }) {
  return <StatusBadge tone={phaseTone(phase)} label={phase} />;
}
