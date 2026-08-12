import { describe, expect, it } from "vitest";
import { addBuildToHistory, BUILD_HISTORY_KEY, loadBuildHistory, persistBuildHistory, type StoredBuild } from "./buildHistory";

const entry = (id: number): StoredBuild => ({
  repo: "example/apk-builder-hub",
  kind: "expo",
  updatedAt: "2026-08-12T20:00:00.000Z",
  run: { id, status: "queued", conclusion: null, html_url: "https://github.com/example/run", created_at: "2026-08-12T20:00:00.000Z", updated_at: "2026-08-12T20:00:00.000Z", name: "Build Android APK" },
});

const memoryStorage = (initial: string | null = null) => {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, value: () => value };
};

describe("build history persistence", () => {
  it("drops invalid or corrupted browser history safely", () => {
    expect(loadBuildHistory(memoryStorage("not-json"))).toEqual([]);
    expect(loadBuildHistory(memoryStorage(JSON.stringify([{ invalid: true }, entry(4)])))).toEqual([entry(4)]);
  });

  it("deduplicates, limits, persists, and restores build entries", () => {
    const storage = memoryStorage();
    const initial = Array.from({ length: 20 }, (_, index) => entry(index + 1));
    const next = addBuildToHistory(initial, entry(8));
    expect(next).toHaveLength(20);
    expect(next[0].run.id).toBe(8);
    expect(next.filter((item) => item.run.id === 8)).toHaveLength(1);
    persistBuildHistory(next, storage);
    expect(storage.value()).toContain(BUILD_HISTORY_KEY ? '"repo"' : "");
    expect(loadBuildHistory(storage)).toEqual(next);
  });
});
