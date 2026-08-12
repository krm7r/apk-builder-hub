import type { GithubRun } from "./github";
import type { ProjectKind } from "./projectDetection";

export type StoredBuild = { run: GithubRun; repo: string; kind: ProjectKind; updatedAt: string };

export const BUILD_HISTORY_KEY = "apk-builder.build-history";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isStoredBuild(value: unknown): value is StoredBuild {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<StoredBuild>;
  return typeof entry.repo === "string"
    && typeof entry.kind === "string"
    && typeof entry.updatedAt === "string"
    && typeof entry.run?.id === "number"
    && typeof entry.run?.name === "string";
}

export function loadBuildHistory(storage: StorageLike = localStorage): StoredBuild[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(BUILD_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isStoredBuild).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function addBuildToHistory(current: StoredBuild[], entry: StoredBuild) {
  return [entry, ...current.filter((item) => item.run.id !== entry.run.id)].slice(0, 20);
}

export function persistBuildHistory(entries: StoredBuild[], storage: StorageLike = localStorage) {
  storage.setItem(BUILD_HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
}
