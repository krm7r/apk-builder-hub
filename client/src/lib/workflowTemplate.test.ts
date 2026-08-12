import { describe, expect, it } from "vitest";
import { buildSourcePath, buildWorkflowYaml } from "./workflowTemplate";

describe("APK workflow template", () => {
  it("contains branches for every supported project type and archives an APK", () => {
    const workflow = buildWorkflowYaml();
    expect(workflow).toContain("expo");
    expect(workflow).toContain("react-native");
    expect(workflow).toContain("flutter");
    expect(workflow).toContain("android-native");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("Sign APK for installation");
    expect(workflow).toContain("apksigner\" verify");
    expect(workflow).toContain("app-release.apk");
  });

  it("creates an isolated source path", () => {
    expect(buildSourcePath("flutter", 123)).toBe("uploads/flutter-123.zip");
  });
});
