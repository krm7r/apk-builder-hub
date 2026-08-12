import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareAndDispatchBuild, type GithubRepo } from "./github";
import { BUILDER_WORKFLOW_PATH } from "./workflowTemplate";

const repo: GithubRepo = {
  id: 7,
  name: "apk-builder-hub",
  full_name: "example/apk-builder-hub",
  private: false,
  default_branch: "main",
  html_url: "https://github.com/example/apk-builder-hub",
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("prepareAndDispatchBuild", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads source, waits for the active builder workflow, then dispatches it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: "Not Found" }, 404))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ sha: "existing-workflow" }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ workflows: [{ id: 99, path: BUILDER_WORKFLOW_PATH, state: "active" }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await prepareAndDispatchBuild("test-token", repo, { blob: new Blob(["source"]), kind: "expo" });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    const sourceUpload = fetchMock.mock.calls[1];
    expect(sourceUpload?.[0]).toMatch(/\/contents\/uploads\/expo-\d+\.zip$/);
    expect(sourceUpload?.[1]).toMatchObject({ method: "PUT" });
    const dispatch = fetchMock.mock.calls[5];
    expect(dispatch?.[0]).toBe("https://api.github.com/repos/example/apk-builder-hub/actions/workflows/99/dispatches");
    expect(dispatch?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(dispatch?.[1]?.body as string)).toMatchObject({ ref: "main", inputs: { project_type: "expo" } });
  });

  it("explains the contents permission required when GitHub rejects the source upload", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ message: "Resource not accessible by personal access token" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(prepareAndDispatchBuild("test-token", repo, { blob: new Blob(["source"]), kind: "expo" }))
      .rejects.toThrow("Contents: Read and write");
  });
});
