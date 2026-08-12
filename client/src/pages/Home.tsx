import JSZip from "jszip";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Check, CheckCircle2, CircleDashed, Download,
  FileArchive, FileCode2, FolderOpen, Github, LoaderCircle, PackageCheck, Play,
  RefreshCw, Sparkles, TerminalSquare, UploadCloud, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  clearToken, downloadApkArtifact, downloadRunLogs, getToken, listPublicRepos,
  listRunArtifacts, listRuns, listRunSteps, prepareAndDispatchBuild, storeToken,
  type GithubArtifact, type GithubRepo, type GithubRun, type GithubStep,
} from "@/lib/github";
import { buildFailureAdvice, buildProgress } from "@/lib/buildState";
import { addBuildToHistory, loadBuildHistory, persistBuildHistory, type StoredBuild } from "@/lib/buildHistory";
import { detectProjectFromNames, projectLabel, type DetectionResult, type ProjectKind } from "@/lib/projectDetection";

type PreparedProject = {
  blob: Blob;
  fileName: string;
  source: "zip" | "folder";
  fileCount: number;
  size: number;
  detection: DetectionResult;
};

type ApkPreview = { name: string; size: number; url: string };

const formatSize = (bytes: number) => {
  if (!bytes) return "0 كيلوبايت";
  const units = ["بايت", "كيلوبايت", "ميغابايت", "غيغابايت"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};
const formatDate = (date: string) => new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

export default function Home() {
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState(getToken);
  const [accessToken, setAccessToken] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [repoName, setRepoName] = useState("");
  const [project, setProject] = useState<PreparedProject | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeRun, setActiveRun] = useState<GithubRun | null>(null);
  const [steps, setSteps] = useState<GithubStep[]>([]);
  const [artifacts, setArtifacts] = useState<GithubArtifact[]>([]);
  const [previews, setPreviews] = useState<Record<number, ApkPreview>>({});
  const [rawLogs, setRawLogs] = useState("");
  const [history, setHistory] = useState<StoredBuild[]>(loadBuildHistory);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.full_name === repoName) ?? null, [repos, repoName]);
  const errorCard = buildFailureAdvice(activeRun, rawLogs);
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const progress = buildProgress(activeRun, steps);

  const persistHistory = (entry: StoredBuild) => {
    setHistory((current) => {
      const next = addBuildToHistory(current, entry);
      persistBuildHistory(next);
      return next;
    });
  };

  const loadRepos = async (access: string) => {
    const available = await listPublicRepos(access);
    setRepos(available);
    setRepoName((current) => current || available[0]?.full_name || "");
  };

  const inspectArtifact = async (artifact: GithubArtifact) => {
    if (previews[artifact.id]) return;
    const archive = await JSZip.loadAsync(await downloadApkArtifact(token, artifact));
    const apk = Object.values(archive.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".apk"));
    if (!apk) throw new Error("لا يحتوي ناتج GitHub على ملف APK صالح.");
    const blob = await apk.async("blob");
    setPreviews((current) => ({
      ...current,
      [artifact.id]: { name: apk.name.split("/").pop() || "app-release.apk", size: blob.size, url: URL.createObjectURL(blob) },
    }));
  };

  const loadArtifacts = async (repo: GithubRepo, run: GithubRun) => {
    if (run.status !== "completed") return;
    const available = await listRunArtifacts(token, repo, run.id);
    setArtifacts(available);
    await Promise.all(available.map((artifact) => inspectArtifact(artifact).catch(() => undefined)));
  };

  const refreshRun = async (run?: GithubRun | null, explicitRepo?: GithubRepo | null) => {
    const repo = explicitRepo ?? selectedRepo;
    if (!token || !repo) return;
    try {
      const runs = await listRuns(token, repo);
      const next = runs.find((candidate) => candidate.id === (run ?? activeRun)?.id) ?? runs[0] ?? null;
      setActiveRun(next);
      if (!next) return;
      setSteps(await listRunSteps(token, repo, next.id));
      await loadArtifacts(repo, next);
      if (project?.detection.kind) persistHistory({ run: next, repo: repo.full_name, kind: project.detection.kind, updatedAt: new Date().toISOString() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث حالة البناء.");
    }
  };

  useEffect(() => {
    if (!activeRun || activeRun.status === "completed") return;
    const timer = window.setInterval(() => void refreshRun(activeRun), 8000);
    return () => window.clearInterval(timer);
  }, [activeRun?.id, activeRun?.status, token, selectedRepo?.full_name]);

  useEffect(() => {
    if (activeRun?.conclusion === "failure" && !rawLogs && !logsLoading) void loadRawLogs();
  }, [activeRun?.id, activeRun?.conclusion, rawLogs, logsLoading, token, selectedRepo?.full_name]);

  const prepareZip = async (file: File) => {
    setError("");
    try {
      const archive = await JSZip.loadAsync(file);
      const names = Object.values(archive.files).filter((entry) => !entry.dir).map((entry) => entry.name);
      setProject({ blob: file, fileName: file.name, source: "zip", fileCount: names.length, size: file.size, detection: detectProjectFromNames(names) });
    } catch { setError("لم نتمكن من قراءة ZIP. تأكد أنه أرشيف مشروع صالح وغير تالف."); }
  };

  const prepareFolder = async (files: FileList) => {
    setError("");
    if (!files.length) return;
    const archive = new JSZip();
    const entries = Array.from(files);
    entries.forEach((file) => archive.file((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, file));
    const blob = await archive.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const names = entries.map((file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
    setProject({ blob, fileName: "project-source.zip", source: "folder", fileCount: entries.length, size: blob.size, detection: detectProjectFromNames(names) });
  };

  const connectGithub = async () => {
    setError("");
    try {
      if (!accessToken.trim()) throw new Error("أدخل رمز وصول GitHub أولًا.");
      storeToken(accessToken);
      setToken(accessToken.trim());
      await loadRepos(accessToken.trim());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر الاتصال بـ GitHub."); }
  };

  const startBuild = async () => {
    if (!project?.detection.kind || !selectedRepo || !token) return;
    setLoading(true); setError(""); setRawLogs(""); setArtifacts([]); setPreviews({});
    try {
      const run = await prepareAndDispatchBuild(token, selectedRepo, { blob: project.blob, kind: project.detection.kind });
      setActiveRun(run);
      persistHistory({ run, repo: selectedRepo.full_name, kind: project.detection.kind, updatedAt: new Date().toISOString() });
      void refreshRun(run, selectedRepo);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر بدء البناء على GitHub."); }
    finally { setLoading(false); }
  };

  const loadRawLogs = async () => {
    if (!token || !selectedRepo || !activeRun) return;
    setLogsLoading(true); setError("");
    try {
      const archive = await JSZip.loadAsync(await downloadRunLogs(token, selectedRepo, activeRun.id));
      const files = Object.values(archive.files).filter((entry) => !entry.dir && entry.name.endsWith(".txt"));
      const text = (await Promise.all(files.map((entry) => entry.async("text")))).join("\n");
      setRawLogs(text.slice(-50000) || "لم تصدر GitHub سجلات قابلة للعرض بعد.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل سجل البناء."); }
    finally { setLogsLoading(false); }
  };

  const restoreHistory = async (entry: StoredBuild) => {
    const repo = repos.find((item) => item.full_name === entry.repo);
    if (!token || !repo) { setError("اربط GitHub ثم اختر المستودع المسجل لإعادة تنزيل هذا الناتج."); return; }
    setRepoName(repo.full_name); setActiveRun(entry.run); setRawLogs(""); setArtifacts([]);
    await refreshRun(entry.run, repo);
    window.location.hash = "results";
  };

  const onZipInput = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void prepareZip(file); };
  const onFolderInput = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void prepareFolder(event.target.files); };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((item) => item.name.toLowerCase().endsWith(".zip"));
    if (file) void prepareZip(file); else setError("اسحب ملف ZIP واحدًا، أو استخدم زر اختيار مجلد لرفع بنية المشروع كاملة.");
  };
  const canBuild = Boolean(project?.detection.kind && selectedRepo && token && !loading);

  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#07111c] text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_77%_3%,rgba(26,174,204,0.18),transparent_27%),radial-gradient(circle_at_3%_24%,rgba(56,80,210,0.14),transparent_32%)]" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 lg:px-8">
        <a href="#top" className="flex items-center gap-3 text-right"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-cyan-500 text-slate-950 shadow-[0_10px_35px_rgba(34,211,238,0.28)]"><PackageCheck className="h-6 w-6" /></span><span><strong className="block text-base tracking-tight">APK Builder</strong><span className="text-xs text-slate-400">GitHub-native build desk</span></span></a>
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex"><a href="#how" className="transition hover:text-cyan-200">كيف يعمل</a><a href="#workspace" className="transition hover:text-cyan-200">مساحة البناء</a><a href="#history" className="transition hover:text-cyan-200">السجل</a></nav>
        <a href="#workspace" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:border-cyan-300/40 hover:bg-cyan-300/10">ابدأ البناء <ArrowLeft className="mr-1 inline h-4 w-4" /></a>
      </header>
      <main id="top" className="relative z-10">
        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.06fr_.94fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-20">
          <div className="max-w-3xl"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-100"><Sparkles className="h-3.5 w-3.5" />بناء Android من مستودعك العام</div><h1 className="text-balance text-4xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-6xl">حوّل مشروعك إلى <span className="text-cyan-300">APK</span> بوضوح، لا بتخمين.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">ارفَع المشروع كملف ZIP أو مجلد كامل، دَع الأداة تتحقق من نوعه، ثم شغّل بناءً قابلاً للمراجعة داخل GitHub Actions. ترى كل خطوة قبل تنزيل الناتج.</p><div className="mt-9 flex flex-wrap gap-3">{[["React Native", "RN"], ["Expo", "EX"], ["Flutter", "FL"], ["Android Native", "AN"]].map(([label, tag]) => <span key={tag} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-slate-200"><span className="grid h-6 w-6 place-items-center rounded-md bg-white/10 text-[10px] font-bold text-cyan-200">{tag}</span>{label}</span>)}</div></div>
          <BuildIllustration />
        </section>
        <section id="how" className="border-y border-white/[0.07] bg-[#0a1522]/80 py-8"><div className="mx-auto grid max-w-7xl gap-6 px-5 sm:grid-cols-3 lg:px-8">{[{ n: "01", title: "ارفع المصدر", copy: "ZIP أو مجلد مشروع كامل." }, { n: "02", title: "تحقق ثم اربط", copy: "يكشف النوع ويشغّل Workflow داخل GitHub." }, { n: "03", title: "راجع ونزّل", copy: "تابع الخطوات وملف APK الناتج." }].map((item) => <div key={item.n} className="flex items-start gap-4"><span className="font-mono text-xs text-cyan-300">{item.n}</span><div><h2 className="text-sm font-semibold text-white">{item.title}</h2><p className="mt-1 text-sm text-slate-400">{item.copy}</p></div></div>)}</div></section>
        <section id="workspace" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Build workspace</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">مساحة بناء واحدة، بخطوات قابلة للفحص.</h2></div><p className="max-w-md text-sm leading-6 text-slate-400">لا يُنشأ ملف APK داخل هذه الصفحة؛ التشغيل والنتائج يحدثان داخل GitHub Actions لمستودعك العام.</p></div>
          <div className="grid gap-6 xl:grid-cols-[1.07fr_.93fr]">
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-white">1. أضف مصدر المشروع</p><p className="mt-1 text-xs text-slate-400">يُقرأ محليًا للكشف قبل رفعه.</p></div><span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs text-slate-300">ZIP أو Folder</span></div><div onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} className={`mt-5 grid min-h-48 place-items-center rounded-2xl border border-dashed p-6 text-center transition ${dragging ? "border-cyan-300 bg-cyan-300/10" : "border-white/15 bg-[#07111c]/60 hover:border-cyan-300/40"}`}><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200"><UploadCloud className="h-6 w-6" /></span><p className="mt-3 text-sm font-medium text-white">اسحب ملف ZIP هنا</p><p className="mt-1 text-xs text-slate-400">أو اختر ZIP أو مجلد المصدر الكامل.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button onClick={() => zipInput.current?.click()} variant="outline" className="border-white/15 bg-white/[0.04] text-slate-100 hover:bg-white/10 hover:text-white"><FileArchive className="ml-2 h-4 w-4" />اختيار ZIP</Button><Button onClick={() => folderInput.current?.click()} variant="outline" className="border-white/15 bg-white/[0.04] text-slate-100 hover:bg-white/10 hover:text-white"><FolderOpen className="ml-2 h-4 w-4" />اختيار مجلد</Button></div></div><input ref={zipInput} className="hidden" type="file" accept=".zip,application/zip" onChange={onZipInput} /><input ref={folderInput} className="hidden" type="file" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={onFolderInput} /></div>{project && <ProjectCard project={project} />}</div>
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-white">2. اختر مستودع GitHub</p><p className="mt-1 text-xs text-slate-400">المستودعات العامة فقط في هذا المسار.</p></div><Github className="h-5 w-5 text-slate-400" /></div>{!token ? <div className="mt-5"><label className="mb-2 block text-xs font-medium text-slate-300">GitHub fine-grained access token</label><div className="flex gap-2"><Input value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="github_pat_…" type="password" className="border-white/10 bg-[#07111c] text-left text-sm text-white placeholder:text-slate-600" dir="ltr" /><Button onClick={() => void connectGithub()} className="shrink-0 bg-white text-slate-950 hover:bg-cyan-100"><Github className="ml-2 h-4 w-4" />ربط</Button></div><p className="mt-3 text-xs leading-5 text-slate-500">أنشئ رمزًا محدودًا للمستودع العام المختار بصلاحيات Contents وActions. يبقى في جلسة المتصفح فقط ولا يُرسل إلا إلى GitHub.</p></div> : <div className="mt-5 space-y-4"><div className="flex items-center justify-between rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2.5"><span className="flex items-center gap-2 text-sm text-emerald-100"><CheckCircle2 className="h-4 w-4" />تم ربط GitHub لهذه الجلسة</span><button onClick={() => { clearToken(); setToken(""); setRepos([]); setRepoName(""); }} className="text-xs text-slate-400 hover:text-white">فصل</button></div><select value={repoName} onChange={(event) => setRepoName(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#07111c] px-3 text-sm text-slate-100 outline-none focus:border-cyan-300/60">{repos.length ? repos.map((repo) => <option key={repo.id} value={repo.full_name}>{repo.full_name}</option>) : <option>لا توجد مستودعات عامة متاحة</option>}</select><Button onClick={() => void loadRepos(token)} variant="ghost" className="h-8 px-0 text-xs text-cyan-200 hover:bg-transparent hover:text-cyan-100"><RefreshCw className="ml-1.5 h-3.5 w-3.5" />تحديث قائمة المستودعات</Button></div>}<div className="mt-7 border-t border-white/[0.08] pt-5"><p className="text-sm font-medium text-white">3. شغّل بناء APK</p><p className="mt-1 text-xs leading-5 text-slate-400">يُضاف أرشيف المصدر وWorkflow البناء إلى المستودع المختار ثم يبدأ GitHub Actions.</p><Button disabled={!canBuild} onClick={() => void startBuild()} className="mt-4 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 disabled:bg-slate-700 disabled:text-slate-400">{loading ? <LoaderCircle className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4 fill-current" />}{loading ? "جارٍ بدء البناء…" : "بدء البناء على GitHub"}</Button></div></div>
          </div>{error && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
        </section>
        <section id="results" className="border-y border-white/[0.07] bg-[#091522] py-20"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Live build</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">متابعة النتيجة قبل التنزيل.</h2></div>{activeRun && <Button onClick={() => void refreshRun()} variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white"><RefreshCw className="ml-2 h-4 w-4" />تحديث الحالة</Button>}</div>{activeRun ? <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><div className="rounded-[1.5rem] border border-white/10 bg-[#0b1a29] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-5"><div><p className="text-sm font-medium text-white">{activeRun.name}</p><p className="mt-1 font-mono text-xs text-slate-500">#{activeRun.id} · {selectedRepo?.full_name}</p></div><RunBadge run={activeRun} /></div><div className="mt-5"><div className="mb-2 flex items-center justify-between text-xs text-slate-400"><span>تقدم خطوات GitHub Actions</span><span>{progress}% · {completedSteps}/{steps.length || "?"}</span></div><Progress value={progress} className="h-2 bg-white/10 [&>div]:bg-cyan-300" /></div><div className="mt-5 space-y-3">{steps.length ? steps.map((step) => <div key={`${step.number}-${step.name}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><StepIcon step={step} /><div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-100">{step.name}</p><p className="mt-0.5 text-xs text-slate-500">{step.conclusion || step.status}</p></div></div>) : <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm text-slate-400"><CircleDashed className="h-5 w-5 animate-spin" />GitHub يجهّز خطوات البناء…</div>}</div><div className="mt-5 flex flex-wrap gap-4"><a href={activeRun.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-200 hover:text-cyan-100">فتح السجل الكامل على GitHub <ArrowUpRight className="h-3.5 w-3.5" /></a><button onClick={() => void loadRawLogs()} className="text-xs font-medium text-cyan-200 hover:text-cyan-100">{logsLoading ? "جارٍ تحميل السجل…" : "عرض سجل البناء هنا"}</button></div>{rawLogs && <pre className="mt-4 max-h-72 overflow-auto rounded-xl border border-white/[0.08] bg-[#06101a] p-4 text-left font-mono text-[11px] leading-5 text-slate-300" dir="ltr">{rawLogs}</pre>}</div><ArtifactPreview artifacts={artifacts} previews={previews} loading={loading} onPrepare={inspectArtifact} /></div> : <div className="grid min-h-64 place-items-center rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center"><div><TerminalSquare className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-4 text-sm font-medium text-slate-200">لم يبدأ أي بناء في هذه الجلسة.</p><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">أضف مشروعًا، اربط GitHub، ثم ابدأ البناء لتظهر خطوات التنفيذ ومعاينة الناتج هنا.</p></div></div>}{errorCard && <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-5"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-200" /><div><p className="text-sm font-medium text-amber-100">{errorCard.title}</p><p className="mt-1 text-sm leading-6 text-amber-100/75">{errorCard.detail}</p></div></div></div>}</div></section>
        <section id="history" className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Build history</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">طلبات البناء السابقة.</h2></div><div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.035]">{history.length ? <div className="divide-y divide-white/[0.07]">{history.map((item) => <div key={item.run.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><RunBadge run={item.run} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{item.repo}</p><p className="mt-1 text-xs text-slate-400">{projectLabel(item.kind)} · {formatDate(item.updatedAt)}</p></div><Button disabled={!token} onClick={() => void restoreHistory(item)} variant="ghost" className="h-8 px-2 text-xs text-cyan-200 hover:bg-white/5 hover:text-cyan-100">استعادة النتيجة</Button><a href={item.run.html_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-cyan-200 hover:text-cyan-100">عرض التنفيذ <ArrowUpRight className="mr-1 inline h-3.5 w-3.5" /></a></div>)}</div> : <div className="p-9 text-center"><p className="text-sm text-slate-300">لا توجد طلبات بناء محفوظة في هذا المتصفح حتى الآن.</p><p className="mt-2 text-xs text-slate-500">سيُسجل الموقع حالة كل بناء يبدأ من هذه الصفحة ويمكنك استعادته وتنزيل ناتجه المتاح.</p></div>}</div></section>
      </main><footer className="relative z-10 border-t border-white/[0.07] px-5 py-7 text-center text-xs text-slate-500">APK Builder · تنفيذ البناء وملف APK الناتج يُداران من خلال GitHub Actions في مستودعك العام.</footer>
    </div>
  );
}

function BuildIllustration() { return <div className="relative mx-auto w-full max-w-xl"><div className="absolute -inset-4 rounded-[2rem] bg-cyan-400/10 blur-3xl" /><div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#0d1b2a]/90 p-5 shadow-2xl shadow-black/30 backdrop-blur"><div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4"><div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" /></div><span className="font-mono text-xs text-slate-500">build / status</span></div><div className="space-y-4">{[{ icon: FileArchive, title: "تحليل المصدر", sub: "فحص بنية المشروع", color: "text-cyan-200" }, { icon: TerminalSquare, title: "GitHub Actions", sub: "بناء على runner عام", color: "text-violet-200" }, { icon: PackageCheck, title: "APK جاهز", sub: "تنزيل بعد التحقق", color: "text-emerald-200" }].map((item, index) => <div key={item.title} className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] ${item.color}`}><item.icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-white">{item.title}</p><p className="mt-0.5 text-xs text-slate-400">{item.sub}</p></div><span className={`h-2.5 w-2.5 rounded-full ${index === 1 ? "bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,.9)]" : "bg-emerald-400"}`} /></div>)}</div></div></div>; }

function ProjectCard({ project }: { project: PreparedProject }) { return <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#0a1624] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-cyan-200"><FileCode2 className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{project.fileName}</p><p className="mt-1 text-xs text-slate-400">{project.fileCount} ملفًا · {formatSize(project.size)} · {project.source === "zip" ? "ZIP" : "مجلد مضغوط محليًا"}</p></div></div>{project.detection.kind ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" />{project.detection.label}</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/10 px-2.5 py-1 text-xs text-amber-100"><AlertTriangle className="h-3.5 w-3.5" />غير مدعوم</span>}</div><p className="mt-3 text-xs leading-5 text-slate-400">{project.detection.detail}</p>{project.detection.markers.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{project.detection.markers.map((marker) => <span key={marker} className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[10px] text-slate-300">{marker}</span>)}</div>}</div>; }

function ArtifactPreview({ artifacts, previews, loading, onPrepare }: { artifacts: GithubArtifact[]; previews: Record<number, ApkPreview>; loading: boolean; onPrepare: (artifact: GithubArtifact) => Promise<void> }) { return <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5 sm:p-6"><p className="text-sm font-medium text-white">معاينة ناتج APK</p><p className="mt-1 text-xs text-slate-400">يُستخرج اسم الملف وحجمه قبل التنزيل.</p>{artifacts.length ? <div className="mt-5 space-y-3">{artifacts.map((artifact) => { const preview = previews[artifact.id]; return <div key={artifact.id} className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/15 text-emerald-200"><PackageCheck className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{preview?.name ?? "جارٍ تحضير معلومات APK…"}</p><p className="mt-1 text-xs text-slate-400">{preview ? `${formatSize(preview.size)} · بُني في ${formatDate(artifact.created_at)}` : `${formatSize(artifact.size_in_bytes)} أرشيف GitHub · ${formatDate(artifact.created_at)}`}</p></div></div>{preview ? <><a href={preview.url} download={preview.name} className="mt-4 flex w-full items-center justify-center rounded-md bg-emerald-300 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-200"><Download className="ml-2 h-4 w-4" />تنزيل ملف APK</a><p className="mt-2 text-[11px] leading-4 text-emerald-100/70">رابط APK المباشر صالح لهذه الجلسة فقط. يبقى أرشيف GitHub محفوظًا لمدة سبعة أيام.</p></> : <Button onClick={() => void onPrepare(artifact)} disabled={loading} className="mt-4 w-full bg-emerald-300 text-emerald-950 hover:bg-emerald-200">تحضير معاينة APK</Button>}</div>; })}</div> : <div className="mt-5 grid min-h-48 place-items-center rounded-2xl border border-dashed border-white/10 bg-[#07111c]/50 p-6 text-center"><div><PackageCheck className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm text-slate-300">لا يوجد APK متاح بعد.</p><p className="mt-1 text-xs leading-5 text-slate-500">عند نجاح آخر خطوة، يظهر الاسم والحجم وتاريخ البناء وزر التنزيل هنا.</p></div></div>}</div>; }

function RunBadge({ run }: { run: GithubRun }) { const completed = run.status === "completed"; const successful = run.conclusion === "success"; const failed = completed && !successful; const classes = successful ? "bg-emerald-400/10 text-emerald-200" : failed ? "bg-rose-400/10 text-rose-100" : "bg-cyan-300/10 text-cyan-100"; const label = successful ? "ناجح" : failed ? "فشل" : "قيد التنفيذ"; const Icon = successful ? CheckCircle2 : failed ? XCircle : LoaderCircle; return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${classes}`}><Icon className={`h-3.5 w-3.5 ${!completed ? "animate-spin" : ""}`} />{label}</span>; }
function StepIcon({ step }: { step: GithubStep }) { if (step.status !== "completed") return <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /></span>; if (step.conclusion === "success") return <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-400/10 text-emerald-200"><Check className="h-3.5 w-3.5" /></span>; return <span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-400/10 text-rose-100"><XCircle className="h-3.5 w-3.5" /></span>; }
