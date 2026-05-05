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
  FileCode,
  FolderTree,
  X,
  StopCircle,
  Wand2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { streamWebsiteAI } from "@/lib/websiteAI";
import { VibeLoader } from "@/components/VibeLoader";
import * as Ably from 'ably';
import { appEnv } from "@/lib/env";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Device = "desktop" | "tablet" | "mobile";
type ProjectFile = { path: string; content: string; language: string };

const HTML_SYSTEM = `You are MATRIXBOOK CORE, the world's most advanced neural web architect.

OUTPUT FORMAT — STRICT ADHERENCE REQUIRED:
Return ONLY one fenced code block containing a single-file HTML solution. No preamble or post-text.

\`\`\`html path=index.html
<!DOCTYPE html>
<html lang="en">
...full single-file HTML...
</html>
\`\`\`

CORE ARCHITECTURAL PRINCIPLES:
- UTILITY: Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- ASSETS: You MUST include high-quality, relevant thematic images. Use Unsplash (https://images.unsplash.com/photo-...) with highly descriptive prompts.
- AESTHETICS: Modern premium UI/UX: glassmorphism, depth through layered shadows, smooth Bezier transitions, and sophisticated typography (Inter/Syne).
- RESPONSIVENESS: Pixel-perfect fluid layouts across all breakpoints.
- INTERACTIVITY: Use vanilla JavaScript for high-performance interactive states.
- SEMANTICS: Valid HTML5 structure for optimal SEO and accessibility.

Special Instruction: Lead with visual impact. Every design must feel "custom" and expensive.`;

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
  const [draft, setDraft] = useState((location.state as { prompt?: string })?.prompt ?? "");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const ablyRef = useRef<Ably.Realtime | null>(null);

  const didAutoRun = useRef(false);
  const filesRef = useRef(files);
  const historyRef = useRef(history);
  const docIdRef = useRef(docId);
  const loadingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { docIdRef.current = docId; }, [docId]);

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const p = (location.state as { prompt?: string })?.prompt;
    if (p && !didAutoRun.current) {
      didAutoRun.current = true;
      run(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (appEnv.ably.apiKey) {
      ablyRef.current = new Ably.Realtime({ key: appEnv.ably.apiKey });
    }
    return () => ablyRef.current?.close();
  }, []);

  const previewHtml = useMemo(() => (files.length ? pickPreview(files) : ""), [files]);
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const persistBuild = async (prompt: string, projectFiles: ProjectFile[]) => {
    if (!user) return;
    try {
      const payload = {
        user_id: user.uid,
        prompt,
        mode: "html",
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
    setIsSynthesizing(true);

    const filesContext = isFollowUp
      ? "\n\nCURRENT PROJECT FILES (update them and return ALL files again):\n" +
        currentFiles
          .map((f) => `\`\`\`${f.language} path=${f.path}\n${f.content}\n\`\`\``)
          .join("\n")
      : "";

    const userMsg = isFollowUp
      ? `Apply this change and return ALL files (full content, not diffs):\n\n${prompt}${filesContext}`
      : `Build this as a complete, polished, fully interactive single HTML page.\n\n${prompt}`;

    const messages = [
      { role: "system", content: HTML_SYSTEM },
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
          if (setIsSynthesizing) setIsSynthesizing(false); // Hide synthetic loader once stream starts
        },
        { timeoutMs: 180_000, signal: controller.signal },
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
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      console.error("processPrompt() error:", e);
      const isAbort = err?.name === "AbortError" || /aborted/i.test(String(err?.message));
      toast.error(isAbort ? "Generation stopped" : (err?.message ?? "Generation failed"));
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
    
    // Clear draft to focus on the build process
    setDraft("");
    
    if (loadingRef.current) {
      queueRef.current.push(next);
      setQueuedCount(queueRef.current.length);
      toast.message("Integration queued — will synthesize following current workflow");
      return;
    }

    // Standard run logic
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
          {!isMobile && <span className="font-semibold text-sm tracking-wide">Matrixbook IDE</span>}
          <span className="ml-2 text-[10px] font-mono px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/20">HTML</span>
        </div>

        <div className="flex items-center gap-1">
          <Link
            to="/supernova"
            title="Open Supernova Image Studio"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
          </Link>
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

        <div className="flex-1 flex items-center justify-center overflow-auto p-4 bg-[#050505]">
          {tab === "preview" ? (
            <div className={`bg-white overflow-hidden rounded-xl shadow-[0_0_100px_rgba(0,0,0,0.8)] ${getSize()}`} style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
              {previewHtml && !isSynthesizing ? (
                <iframe srcDoc={previewHtml} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title="Preview" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 bg-[#0a0a0a]">
                  {isSynthesizing ? (
                    <VibeLoader />
                  ) : loading ? (
                    <div className="flex flex-col items-center gap-4">
                       <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                       <p className="text-xs font-mono font-bold tracking-widest text-neutral-500 uppercase">Synchronizing Logic...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-6 max-w-sm text-center">
                       <div className="w-16 h-16 rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/10">
                         <Monitor className="w-6 h-6 text-neutral-500" />
                       </div>
                       <div className="space-y-2">
                         <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest">Awaiting Neural Prompt</h3>
                         <p className="text-xs text-neutral-600 font-sans leading-relaxed">
                           Describe your architectural vision below to start the synthesis process.
                         </p>
                       </div>
                    </div>
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
            placeholder={files.length ? "What should we change next?" : "Describe the website to build…"}
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

      {isMobile && previewHtml && (
        <button onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(previewHtml); w.document.close(); } }} className="fixed bottom-24 right-4 bg-blue-600 hover:bg-blue-500 p-4 rounded-full shadow-xl transition-colors" aria-label="Open preview">
          <Rocket className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
