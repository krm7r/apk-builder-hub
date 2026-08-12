import { describe, expect, it } from "vitest";
import { buildFailureAdvice, buildProgress } from "./buildState";
import type { GithubRun, GithubStep } from "./github";

const pendingRun = { id: 1, name: "Build APK", status: "in_progress", conclusion: null, html_url: "https://example.test/run", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" } as GithubRun;
const completedRun = { ...pendingRun, status: "completed", conclusion: "success" } as GithubRun;
const failedRun = { ...pendingRun, status: "completed", conclusion: "failure" } as GithubRun;
const steps = [{ number: 1, name: "Checkout", status: "completed", conclusion: "success" }, { number: 2, name: "Build", status: "in_progress", conclusion: null }] as GithubStep[];

describe("buildState", () => {
  it("derives a bounded progress value from visible build steps", () => {
    expect(buildProgress(null, [])).toBe(0);
    expect(buildProgress(pendingRun, [])).toBe(8);
    expect(buildProgress(pendingRun, steps)).toBe(50);
    expect(buildProgress(completedRun, steps)).toBe(100);
  });

  it("offers a useful recovery message only for failed builds", () => {
    expect(buildFailureAdvice(pendingRun)).toBeNull();
    expect(buildFailureAdvice(failedRun)).toMatchObject({ title: "لم يكتمل البناء" });
  });

  it("identifies a missing Expo asset and returns its configured path", () => {
    const logs = "Error: ENOENT: no such file or directory, open './assets/images/android-icon-foreground.png'";
    expect(buildFailureAdvice(failedRun, logs)).toMatchObject({
      title: "ملف مطلوب في إعداد Expo غير موجود",
      detail: expect.stringContaining("assets/images/android-icon-foreground.png"),
    });
  });

  it("explains how to recover from a non-executable Gradle wrapper", () => {
    expect(buildFailureAdvice(failedRun, "./gradlew: Permission denied")).toMatchObject({
      title: "ملف Gradle غير قابل للتنفيذ",
      detail: expect.stringContaining("chmod +x android/gradlew"),
    });
  });
});
