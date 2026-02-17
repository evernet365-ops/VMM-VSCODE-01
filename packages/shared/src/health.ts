export type VmsHealth = "OK" | "DEGRADED" | "DOWN" | "BLACKFRAME";

export function mapHealthToSeverity(state: VmsHealth): "normal" | "suspect" | "critical" {
  if (state === "OK") return "normal";
  if (state === "DEGRADED" || state === "BLACKFRAME") return "suspect";
  return "critical";
}
