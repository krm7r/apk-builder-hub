import { describe, expect, it } from "vitest";
import { detectProjectFromNames } from "./projectDetection";

describe("detectProjectFromNames", () => {
  it("detects Flutter from pubspec.yaml", () => {
    expect(detectProjectFromNames(["my_app/pubspec.yaml", "my_app/lib/main.dart"]).kind).toBe("flutter");
  });

  it("detects Expo before generic React Native markers", () => {
    expect(detectProjectFromNames(["package.json", "app.json", "android/build.gradle"]).kind).toBe("expo");
  });

  it("detects Android Gradle projects", () => {
    expect(detectProjectFromNames(["settings.gradle.kts", "app/build.gradle.kts"]).kind).toBe("android-native");
  });

  it("explains unsupported structures", () => {
    expect(detectProjectFromNames(["notes/readme.txt"]).kind).toBeNull();
  });
});
