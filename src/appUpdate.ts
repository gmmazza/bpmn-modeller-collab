import { compareVersions } from "./version";

export interface UpdateFeed {
  version: string;
  url: string;
  asset?: string;
  notes?: string;
}
export interface UpdateResult {
  updateAvailable: boolean;
  latest: string;
  url: string;
  /** Direct download URL of the portable .zip, when the feed exposes it (enables in-place self-update). */
  asset: string;
}

export function evaluateUpdate(currentVersion: string, feed: unknown): UpdateResult {
  const none: UpdateResult = { updateAvailable: false, latest: currentVersion, url: "", asset: "" };
  if (!feed || typeof feed !== "object") return none;
  const f = feed as Record<string, unknown>;
  if (typeof f.version !== "string" || typeof f.url !== "string") return none;
  return {
    updateAvailable: compareVersions(f.version, currentVersion) > 0,
    latest: f.version,
    url: f.url,
    asset: typeof f.asset === "string" ? f.asset : "",
  };
}
