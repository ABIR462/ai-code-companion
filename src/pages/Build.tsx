import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Code2,
  Eye,
  Loader2,
  Download,
  Copy,
  Send,
  Smartphone,
  Monitor,
  Tablet,
  Rocket,
  MessageSquare,
  Sparkles,
  Image as ImageIcon,
  Settings,
  FileCode,
  FolderTree,
  X,
  StopCircle,
  Wand2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { streamWebsiteAI } from "@/lib/websiteAI";
import { getStoredSambaNovaKey, saveStoredSambaNovaKey } from "@/lib/sambanova";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Device = "desktop" | "tablet" | "mobile";
type Mode = "html" | "react" | "nextjs";
type ProjectFile = { path: string; content: string; language: string };

const MODE_LABELS: Record<Mode, string> = {
  html: "Single HTML",
  react: "React (Vite)",
  nextjs: "Next.js",
};

const HTML_SYSTEM = `You are MATRIX-AI, an expert web developer powered by Mistral Codestral.

OUTPUT FORMAT — VERY STRICT:
Return ONLY one fenced code block, nothing else:

\`\`\`html path=index.html
<!DOCTYPE html>
...full single-file HTML...
\`\`\`

RULES:
- Embed CSS in <style> tag and use Tailwind via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Modern UI: glassmorphism, gradients, smooth transitions, semantic HTML5
- Mobile-first responsive
- Include realistic placeholder content, hover states, micro-interactions
- Use vanilla JavaScript for interactivity (no build step)
- Persist state via localStorage when relevant`;

const REACT_SYSTEM = `You are MATRIX-AI, an expert React engineer powered by Mistral Codestral.

OUTPUT FORMAT — VERY STRICT:
Return ONE OR MORE fenced code blocks. Every block MUST start with: \`\`\`<lang> path=<relative/path>
No prose between blocks. Example:

\`\`\`html path=index.html
<!doctype html><html>...</html>
\`\`\`
\`\`\`tsx path=src/App.tsx
export default function App(){ return <div/> }
\`\`\`

REQUIRED FILES for a React + Vite + TypeScript + Tailwind project:
- index.html (with <div id="root"></div> and <script type="module" src="/src/main.tsx"></script>)
- package.json (vite, react, react-dom, typescript, tailwindcss)
- vite.config.ts
- tailwind.config.js + postcss.config.js
- src/main.tsx (renders <App/>)
- src/App.tsx (the page)
- src/index.css (with @tailwind directives)

For PREVIEW, also include a self-contained \`preview.html\` that renders the same UI using React + Babel + Tailwind via CDN so it can run in an iframe without a build:

\`\`\`html path=preview.html
<!doctype html><html><head>
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
  // inline App component here, then ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
</script></body></html>
\`\`\`

Modern UI: Tailwind, semantic HTML, smooth animations. Mobile-first.`;

const NEXT_SYSTEM = `You are MATRIX-AI, an expert Next.js (App Router) engineer powered by Mistral Codestral.

OUTPUT FORMAT — VERY STRICT:
Return multiple fenced code blocks; every block MUST start with: \`\`\`<lang> path=<relative/path>
No prose between blocks.

REQUIRED FILES (Next.js 14 App Router + Tailwind + TypeScript):
- package.json
- next.config.mjs
- tsconfig.json
- tailwind.config.ts + postcss.config.js
- app/layout.tsx
- app/page.tsx
- app/globals.css (with @tailwind directives)
- Any extra components under app/components/*.tsx

Also include preview.html — a self-contained HTML file using React + Babel + Tailwind CDN that mirrors the home page so users can preview without running a Next dev server:

\`\`\`html path=preview.html
<!doctype html><html><head>
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
  // home page UI then ReactDOM.createRoot(...).render(<Page/>)
</script></body></html>
\`\`\`

Modern UI, responsive, accessible.`;

function systemFor(mode: Mode) {
  if (mode === "react") return REACT_SYSTEM;
  if (mode === "nextjs") return NEXT_SYSTEM;
  return HTML_SYSTEM;
}

function langFromPath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  if (["tsx", "jsx"].includes(ext)) return "tsx";
  if (["ts"].includes(ext)) return "ts";
  if (["js", "mjs", "cjs"].includes(ext)) return "js";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  if (ext === "html") return "html";
  return "text";
}

/** Parse fenced code blocks of the form ```<lang> path=foo/bar.ext\n...``` */
function parseFiles(text: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const re = /```([a-zA-Z0-9_+-]*)?\s+path=([^\s`]+)\s*\n([\s\S]*?)(?:```|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const lang = m[1] || langFromPath(m[2]);
    const path = m[2].trim();
    const content = m[3].replace(/\n$/, "");
    if (path && content !== undefined) files.push({ path, content, language: lang });
  }
  return files;
}

/** If model didn't follow fences, try to recover a single HTML file. */
function recoverSingleHtml(text: string): ProjectFile | null {
  const idx = text.toLowerCase().indexOf("<!doctype");
  if (idx === -1) return null;
  return { path: "index.html", content: text.slice(idx).replace(/```$/g, "").trim(), language: "html" };
}

function pickPreview(files: ProjectFile[]): string {
  const preview = files.find((f) => f.path === "preview.html");
  if (preview) return preview.content;
  const indexHtml = files.find((f) => f.path === "index.html");
  if (indexHtml && /<!doctype/i.test(indexHtml.content) && /<body/i.test(indexHtml.content)) {
    return indexHtml.content;
  }
  // fallback placeholder
  return `<!doctype html><html><body style="font-family:ui-sans-serif;background:#0a0a0a;color:#e5e5e5;display:grid;place-items:center;height:100vh;margin:0">
  <div style="text-align:center"><h1>Preview will appear once generation completes</h1></div></body></html>`;
}

function fallbackHTMLProject(prompt: string): ProjectFile[] {
  return [{
    path: "index.html",
    language: "html",
    content: `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-black text-white flex items-center justify-center h-screen">
<div class="text-center"><h1 class="text-3xl font-bold mb-4">⚡ MATRIX AI</h1>
<p class="text-gray-400">${prompt.replace(/</g, "&lt;")}</p>
<p class="mt-4 text-sm text-red-400">AI generation fallback activated</p></div></body></html>`,
  }];
}

export default function Build() {
  const { user } = useAuth();
  const location = useLocation();

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activePath, setActivePath] = useState<string>("");
  const [mode, setMode] = useState<Mode>("html");
  const [draft, setDraft] = useState((location.state as any)?.prompt ?? "");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [sambaKeyDraft, setSambaKeyDraft] = useState(() => getStoredSambaNovaKey());
  const [streamBuffer, setStreamBuffer] = useState("");

  const didAutoRun = useRef(false);
  const filesRef = useRef(files);
  const historyRef = useRef(history);
  const docIdRef = useRef(docId);
  const loadingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const modeRef = useRef(mode);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { docIdRef.current = docId; }, [docId]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const p = (location.state as any)?.prompt;
    if (p && !didAutoRun.current) {
      didAutoRun.current = true;
      run(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewHtml = useMemo(() => (files.length ? pickPreview(files) : ""), [files]);
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const persistBuild = async (prompt: string, projectFiles: ProjectFile[]) => {
    if (!user) return;
    try {
      const payload = {
        user_id: user.uid,
        prompt,
        mode: modeRef.current,
        files: projectFiles.map((f) => ({ path: f.path, content: f.content })),
        html: pickPreview(projectFiles),
        title: prompt.slice(0, 60),
        updated_at: new Date().toISOString(),
      };
      if (!docIdRef.current) {
        const created = await addDoc(collection(db, "generations"), {
          ...payload,
          created_at: new Date().toISOString(),
        });
        docIdRef.current = created.id;
        setDocId(created.id);
      } else {
        await updateDoc(doc(db, "generations", docIdRef.current), payload);
      }
    } catch (saveErr) {
      console.warn("Firestore save failed:", saveErr);
    }
  };

  const processPrompt = async (prompt: string) => {
    const currentFiles = filesRef.current;
    const isFollowUp = currentFiles.length > 0;
    const userTurn: ChatTurn = { role: "user", content: prompt };
    const baseHistory = [...historyRef.current, userTurn];
    historyRef.current = baseHistory;
    setHistory(baseHistory);
    setStreamBuffer("");
    setStreaming(true);

    const filesContext = isFollowUp
      ? "\n\nCURRENT PROJECT FILES (update them and return ALL files again):\n" +
        currentFiles
          .map((f) => `\`\`\`${f.language} path=${f.path}\n${f.content}\n\`\`\``)
          .join("\n")
      : "";

    const userMsg = isFollowUp
      ? `Apply this change and return ALL files (full content, not diffs):\n\n${prompt}${filesContext}`
      : `Build this as a complete, polished, fully interactive ${MODE_LABELS[modeRef.current]} project.\n\n${prompt}`;

    const messages = [
      { role: "system", content: systemFor(modeRef.current) },
      { role: "user", content: userMsg },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Streaming: live chat bubble + live buffer
      const streamingHistory: ChatTurn[] = [...baseHistory, { role: "assistant", content: "▍" }];
      historyRef.current = streamingHistory;
      setHistory(streamingHistory);
      setTab("code");

      const result = await streamWebsiteAI(
        messages,
        (_chunk, full) => {
          setStreamBuffer(full);
          const preview = full.length > 800 ? `…${full.slice(-800)}` : full;
          const updated: ChatTurn[] = [...baseHistory, { role: "assistant", content: preview + "▍" }];
          historyRef.current = updated;
          setHistory(updated);
        },
        { prefer: "mistral", timeoutMs: 180_000 },
      );

      let parsed = parseFiles(result.content);
      if (parsed.length === 0) {
        const recovered = recoverSingleHtml(result.content);
        if (recovered) parsed = [recovered];
      }
      if (parsed.length === 0) {
        parsed = isFollowUp ? currentFiles : fallbackHTMLProject(prompt);
        toast.error("Model returned no parseable files — showing fallback");
      }

      filesRef.current = parsed;
      setFiles(parsed);
      const firstUi = parsed.find((f) => /preview\.html|index\.html|App\.(t|j)sx|page\.tsx/.test(f.path)) ?? parsed[0];
      setActivePath(firstUi.path);
      setTab("preview");

      const summary = `✓ ${result.provider} · ${parsed.length} file${parsed.length > 1 ? "s" : ""}\n\n${parsed.map((f) => `• \`${f.path}\``).join("\n")}`;
      const doneHistory: ChatTurn[] = [...baseHistory, { role: "assistant", content: summary }];
      historyRef.current = doneHistory;
      setHistory(doneHistory);

      await persistBuild(prompt, parsed);
      toast.success(isFollowUp ? "Updated" : "Build ready");
    } catch (e: any) {
      console.error("processPrompt() error:", e);
      const isAbort = e?.name === "AbortError" || /aborted/i.test(String(e?.message));
      toast.error(isAbort ? "Generation stopped" : (e?.message ?? "Generation failed"));
      historyRef.current = baseHistory;
      setHistory(baseHistory);
      if (currentFiles.length === 0 && !isAbort) {
        const fb = fallbackHTMLProject(prompt);
        filesRef.current = fb;
        setFiles(fb);
        setActivePath(fb[0].path);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setStreamBuffer("");
    }
  };

  const drainQueue = async (first: string) => {
    loadingRef.current = true;
    setLoading(true);
    try {
      await processPrompt(first);
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        setQueuedCount(queueRef.current.length);
        await processPrompt(next);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setQueuedCount(0);
    }
  };

  const run = async (prompt: string) => {
    const next = prompt.trim();
    if (!next) return;
    setDraft("");
    if (loadingRef.current) {
      queueRef.current.push(next);
      setQueuedCount(queueRef.current.length);
      toast.message("Queued — will run after current generation");
      return;
    }
    await drainQueue(next);
  };

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      toast.message("Stopping generation…");
    }
    queueRef.current = [];
    setQueuedCount(0);
  };

  const downloadZip = async () => {
    // Simple multi-file download as a single combined .txt if no JSZip; else per-file.
    if (files.length === 1) {
      const f = files[0];
      const blob = new Blob([f.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = f.path.split("/").pop() || "file"; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // Concatenated bundle
    const bundle = files.map((f) => `// ===== ${f.path} =====\n${f.content}\n`).join("\n");
    const blob = new Blob([bundle], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "matrix-project.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  const copyActive = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    toast.success(`Copied ${activeFile.path}`);
  };

  const getSize = () => {
    if (device === "mobile") return "w-[360px] h-[740px]";
    if (device === "tablet") return "w-[768px] h-[1000px]";
    return "w-full h-full";
  };

  const codeToShow = streaming && streamBuffer ? streamBuffer : (activeFile?.content ?? "");

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Link to="/" aria-label="Back to home"><ArrowLeft className="w-5 h-5" /></Link>
          {!isMobile && <span className="font-semibold text-sm tracking-wide">Matrix AI</span>}
          <div className="ml-2 flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-md p-0.5">
            {(["html", "react", "nextjs"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => !loading && setMode(m)}
                disabled={loading}
                className={`text-[10px] font-mono px-2 py-1 rounded transition ${
                  mode === m ? "bg-blue-600 text-white" : "text-white/50 hover:text-white"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                title={MODE_LABELS[m]}
              >
                {m === "html" ? "HTML" : m === "react" ? "React" : "Next"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            to="/supernova"
            title="Open Supernova Image Studio"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
          </Link>
          <Button size="icon" variant="ghost" onClick={() => setSettingsOpen(true)} title="AI settings" className="text-white/70 hover:text-white">
            <Settings className="w-4 h-4" />
          </Button>
          {history.length > 0 && (
            <Button size="icon" variant="ghost" onClick={() => setShowHistory((v) => !v)} title="Chat history" className="text-white/70 hover:text-white relative">
              <MessageSquare className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-mono">
                {history.filter((h) => h.role === "user").length}
              </span>
            </Button>
          )}
          {files.length > 0 && (
            <>
              <Button size="icon" variant="ghost" onClick={copyActive} title="Copy active file" className="text-white/70 hover:text-white">
                <Copy className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={downloadZip} title="Download project" className="text-white/70 hover:text-white">
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
          {!isMobile && previewHtml && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white ml-1" onClick={() => {
              const w = window.open("", "_blank");
              if (w) { w.document.write(previewHtml); w.document.close(); }
            }}>
              <Rocket className="w-3.5 h-3.5 mr-1" /> Preview
            </Button>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex justify-between items-center px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex gap-1">
          {(["preview", "code"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"}`}>
              {t === "preview" ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "preview" && (
          <div className="flex gap-1">
            {([{ d: "desktop", Icon: Monitor }, { d: "tablet", Icon: Tablet }, { d: "mobile", Icon: Smartphone }] as const).map(({ d, Icon }) => (
              <button key={d} onClick={() => setDevice(d)} className={`p-1.5 rounded-md transition-colors ${device === d ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`} aria-label={d}>
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "preview" && (
        <div className="px-3 py-1.5 flex items-center gap-2 text-xs text-white/50 border-b border-white/5 shrink-0">
          <span>Zoom</span>
          <input type="range" min="0.3" max="1.2" step="0.05" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-24 accent-blue-500" />
          <span className="font-mono">{Math.round(scale * 100)}%</span>
          {streaming && (
            <span className="ml-auto text-blue-300 font-mono inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Streaming…
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File tree (only for code view + multi-file) */}
        {tab === "code" && files.length > 0 && (
          <aside className="w-52 shrink-0 border-r border-white/10 bg-zinc-950/50 overflow-auto">
            <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1.5 border-b border-white/10">
              <FolderTree className="w-3 h-3" /> Files · {files.length}
            </div>
            <ul className="py-1">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => setActivePath(f.path)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 transition-colors ${
                      (activeFile?.path === f.path) ? "bg-blue-600/20 text-blue-200 border-l-2 border-blue-400" : "text-white/60 hover:bg-white/5 hover:text-white border-l-2 border-transparent"
                    }`}
                  >
                    <FileCode className="w-3 h-3 shrink-0" />
                    <span className="truncate">{f.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="flex-1 flex items-center justify-center overflow-auto p-4">
          {tab === "preview" ? (
            <div className={`bg-white overflow-hidden rounded-xl shadow-2xl shadow-black/50 ${getSize()}`} style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
              {previewHtml ? (
                <iframe srcDoc={previewHtml} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title="Preview" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  {loading ? (
                    <><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><p className="text-sm font-mono">Building…</p></>
                  ) : (
                    <><div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><Monitor className="w-6 h-6 text-gray-400" /></div><p className="text-sm">Describe what to build below</p></>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              {activeFile && !streaming && (
                <div className="px-3 py-1.5 text-[11px] font-mono text-white/50 border-b border-white/10 flex items-center justify-between">
                  <span>{activeFile.path}</span>
                  <span className="text-white/30">{activeFile.content.length.toLocaleString()} chars · {activeFile.language}</span>
                </div>
              )}
              <pre className="p-4 text-xs font-mono text-green-300 overflow-auto flex-1 whitespace-pre-wrap leading-relaxed">
                {codeToShow || <span className="text-white/30">// Code will appear here as the AI generates it</span>}
                {streaming && <span className="animate-pulse text-blue-400">▍</span>}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Floating prompt input */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        {files.length > 0 && !loading && (
          <p className="text-center text-[11px] text-white/40 mb-2 font-mono">
            <Sparkles className="w-3 h-3 inline mr-1 text-blue-400" />
            Iterate — try "make the hero darker" or "add a contact form"
          </p>
        )}
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-lg rounded-2xl px-4 py-3 border border-white/10 focus-within:border-blue-500/50 transition-colors max-w-2xl mx-auto">
          <Wand2 className="w-4 h-4 text-blue-400 shrink-0" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(draft); } }}
            placeholder={files.length ? "What should we change next?" : `Describe the ${MODE_LABELS[mode]} app to build…`}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30"
          />
          {queuedCount > 0 && (
            <span className="text-[10px] font-mono text-blue-300 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
              {queuedCount} queued
            </span>
          )}
          {loading ? (
            <Button onClick={stop} size="icon" className="bg-red-600 hover:bg-red-500 text-white rounded-xl shrink-0" title="Stop">
              <StopCircle className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={() => run(draft)} disabled={!draft.trim()} size="icon" className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl shrink-0 disabled:opacity-40">
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Chat history */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end" onClick={() => setShowHistory(false)}>
          <aside className="w-full max-w-md h-full bg-zinc-950 border-l border-white/10 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-semibold text-sm">Conversation</span>
              <button onClick={() => setShowHistory(false)} className="text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
            </header>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {history.length === 0 ? (
                <p className="text-xs text-white/40 text-center mt-8">No messages yet</p>
              ) : (
                history.map((m, i) => (
                  <div key={i} className={`text-sm rounded-xl px-3 py-2 ${m.role === "user" ? "bg-blue-600/20 border border-blue-500/30 ml-6" : "bg-white/5 border border-white/10 mr-6"}`}>
                    <p className="text-[10px] font-mono text-white/40 mb-1">{m.role === "user" ? "You" : "MATRIX-AI"}</p>
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:my-1 prose-pre:bg-black/40 prose-code:text-blue-300 text-white/90">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="glass-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> AI settings</DialogTitle>
            <DialogDescription>Optional SambaNova fallback key (Mistral is primary).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={sambaKeyDraft} onChange={(e) => setSambaKeyDraft(e.target.value)} placeholder="SambaNova API key (optional)" className="bg-white/5 border-white/10 text-white" />
            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" onClick={() => { saveStoredSambaNovaKey(sambaKeyDraft); setSettingsOpen(false); toast.success("Saved"); }}>
              Save AI key
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isMobile && previewHtml && (
        <button onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(previewHtml); w.document.close(); } }} className="fixed bottom-24 right-4 bg-blue-600 hover:bg-blue-500 p-4 rounded-full shadow-xl transition-colors" aria-label="Open preview">
          <Rocket className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
