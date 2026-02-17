export type DashboardUiVersion = "v1" | "v2";

export function resolveDashboardUiVersion(enabled: boolean): DashboardUiVersion {
  return enabled ? "v2" : "v1";
}
