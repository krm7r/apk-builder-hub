import type { ProjectKind } from "./projectDetection";
import { buildSourcePath, BUILDER_WORKFLOW_PATH, buildWorkflowYaml } from "./workflowTemplate";

const API_VERSION = "2022-11-28";
const TOKEN_KEY = "apk-builder.github-token";

export type GithubRepo = { id: number; name: string; full_name: string; private: boolean; default_branch: string; html_url: string };
export type GithubRun = { id: number; status: string; conclusion: string | null; html_url: string; created_at: string; updated_at: string; name: string };
export type GithubStep = { name: string; status: string; conclusion: string | null; number: number };
export type GithubArtifact = { id: number; name: string; size_in_bytes: number; created_at: string; expired: boolean; archive_download_url: string };
type GithubWorkflow = { id: number; path: string; state: string };

function getHeaders(token: string, contentType?: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...getHeaders(token, init?.body ? "application/json" : undefined), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(detail.message ?? `GitHub API error (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getToken() { return sessionStorage.getItem(TOKEN_KEY) ?? ""; }
export function storeToken(value: string) { sessionStorage.setItem(TOKEN_KEY, value.trim()); }
export function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

export async function listPublicRepos(token: string) {
  const repos = await api<GithubRepo[]>(token, "/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&per_page=100&sort=updated");
  return repos.filter((repo) => !repo.private);
}

export async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let output = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) output += String.fromCharCode(...Array.from(bytes.subarray(index, index + chunk)));
  return btoa(output);
}

export async function commitFile(token: string, repo: GithubRepo, path: string, file: Blob, message: string) {
  let sha: string | undefined;
  try {
    const existing = await api<{ sha: string }>(token, `/repos/${repo.full_name}/contents/${path}?ref=${repo.default_branch}`);
    sha = existing.sha;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("not found")) throw error;
  }

  return api(token, `/repos/${repo.full_name}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: await toBase64(file), branch: repo.default_branch, ...(sha ? { sha } : {}) }),
  });
}

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForBuilderWorkflow(token: string, repo: GithubRepo) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await api<{ workflows: GithubWorkflow[] }>(token, `/repos/${repo.full_name}/actions/workflows?per_page=100`);
    const workflow = result.workflows.find((item) => item.path === BUILDER_WORKFLOW_PATH && item.state === "active");
    if (workflow) return workflow.id;
    await delay(1250);
  }

  throw new Error("تم رفع Workflow البناء، لكن GitHub لم يسجّله بعد. انتظر بضع ثوانٍ ثم أعد المحاولة.");
}

export async function prepareAndDispatchBuild(token: string, repo: GithubRepo, project: { blob: Blob; kind: ProjectKind }) {
  const timestamp = Date.now();
  const sourcePath = buildSourcePath(project.kind, timestamp);
  await commitFile(token, repo, sourcePath, project.blob, `build: upload ${project.kind} source`);
  await commitFile(token, repo, BUILDER_WORKFLOW_PATH, new Blob([buildWorkflowYaml()], { type: "text/yaml" }), "build: configure APK workflow");
  const workflowId = await waitForBuilderWorkflow(token, repo);
  await api(token, `/repos/${repo.full_name}/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: repo.default_branch, inputs: { project_type: project.kind, source_path: sourcePath } }),
  });
}

export async function listRuns(token: string, repo: GithubRepo) {
  const result = await api<{ workflow_runs: GithubRun[] }>(token, `/repos/${repo.full_name}/actions/runs?event=workflow_dispatch&per_page=20`);
  return result.workflow_runs.filter((run) => run.name === "Build Android APK");
}

export async function listRunSteps(token: string, repo: GithubRepo, runId: number) {
  const result = await api<{ jobs: { steps: GithubStep[] }[] }>(token, `/repos/${repo.full_name}/actions/runs/${runId}/jobs?per_page=100`);
  return result.jobs.flatMap((job) => job.steps ?? []);
}

export async function listRunArtifacts(token: string, repo: GithubRepo, runId: number) {
  const result = await api<{ artifacts: GithubArtifact[] }>(token, `/repos/${repo.full_name}/actions/runs/${runId}/artifacts`);
  return result.artifacts.filter((artifact) => !artifact.expired);
}

export async function downloadRunLogs(token: string, repo: GithubRepo, runId: number) {
  const response = await fetch(`https://api.github.com/repos/${repo.full_name}/actions/runs/${runId}/logs`, {
    headers: getHeaders(token),
    redirect: "follow",
  });
  if (!response.ok) throw new Error("تعذر استلام سجل البناء من GitHub.");
  return response.blob();
}

export async function downloadApkArtifact(token: string, artifact: GithubArtifact) {
  const response = await fetch(artifact.archive_download_url, { headers: getHeaders(token), redirect: "follow" });
  if (!response.ok) throw new Error("تعذر تنزيل مخرج البناء من GitHub.");
  return response.blob();
}
