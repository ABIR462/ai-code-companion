import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import JSZip from "jszip";
import { streamWebsiteAI } from "@/lib/websiteAI";
import { VibeLoader } from "@/components/VibeLoader";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Device = "desktop" | "tablet" | "mobile";
type ProjectFile = { path: string; content: string; language: string };

// FIX 2: Moved outside component to avoid re-creation on every render
const HTML_SYSTEM = `You are MATRIXBOOK CORE, the world's most advanced neural web architect and product design director.

OUTPUT FORMAT - STRICT ADHERENCE REQUIRED:
Return ONLY one fenced code block for \`index.html\`. No preamble or post-text.

\`\`\`html path=index.html
<!DOCTYPE html>
<html lang="en">
...full single-file HTML...
</html>
\`\`\`

CORE ARCHITECTURAL PRINCIPLES:
- UTILITY: Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- ASSETS: You MUST include multiple high-quality, relevant thematic images unless the user explicitly wants a text-only page. Use stable direct image URLs such as Unsplash (https://images.unsplash.com/photo-...) with descriptive image choices that match the business context.
- AESTHETICS: Create premium UI/UX with intentional art direction. Avoid generic templates. Use strong typography, layered surfaces, visual rhythm, contrast, and a clear brand feel.
- RESPONSIVENESS: Pixel-perfect fluid layouts across all breakpoints.
- INTERACTIVITY: Use vanilla JavaScript for high-performance interactive states, progressive disclosure, tabs, filters, reveal-on-scroll, sliders, or hover states where appropriate.
- SEMANTICS: Valid HTML5 structure for optimal SEO and accessibility.
- UX: Build complete user journeys, not just isolated sections. Include clear navigation, compelling hero, proof or credibility, rich content sections, strong calls to action, and a polished footer.
- CONTENT: Write convincing product-quality copy tailored to the user's prompt. Do not leave placeholder lorem ipsum.
- IMAGERY: Prefer at least 3 distinct images across hero, gallery, product, testimonial, editorial, or feature areas when the concept supports it.
- EXECUTION: Think through layout, spacing, mobile behavior, and interaction before writing code. The final file must be immediately usable in a browser.

OPTIONAL ENHANCEMENTS WHEN RELEVANT:
- Add subtle gradients, mesh backgrounds, patterns, or editorial framing devices instead of flat empty backgrounds.
- Use tasteful animation and transitions, never noisy motion.
- Add useful UI details like sticky nav, active states, cards, badges, metrics, FAQ accordions, comparison tables, testimonial sliders, or galleries when they fit the prompt.

CONSTRAINTS:
- Return ONLY HTML for a single \`index.html\` file.
- Do not mention limitations or describe the code outside the file.
- Do not require a build step.

Special Instruction: Lead with visual impact. Every design must feel custom, expensive, and meaningfully better than a standard AI landing page.`;

function hashString(input: string): string {
  // Fast non-cryptographic hash (djb2-ish) for stable iframe keys.
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
  }
  // force unsigned
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

function langFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  if (["tsx", "jsx"].includes(ext)) return "tsx";
  if (ext === "ts") return "ts";
  if (["js", "mjs", "cjs"].includes(ext)) return "js";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  if (ext === "html") return "html";
  return "text";
}

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

function recoverSingleHtml(text: string): ProjectFile | null {
  const idx = text.toLowerCase().indexOf("<!doctype");
  if (idx === -1) return null;
  return {
    path: "index.html",
    content: text.slice(idx).replace(/```$/g, "").trim(),
    language: "html",
  };
}

function pickPreview(files: ProjectFile[]): string {
  const preview = files.find((f) => f.path === "preview.html");
  if (preview) return preview.content;
  const indexHtml = files.find((f) => f.path === "index.html");
  if (
    indexHtml &&
    /<!doctype/i.test(indexHtml.content) &&
    /<body/i.test(indexHtml.content)
  ) {
    return indexHtml.content;
  }
  return `<!doctype html><html><body style="font-family:ui-sans-serif;background:#0a0a0a;color:#e5e5e5;display:grid;place-items:center;height:100vh;margin:0">
  <div style="text-align:center"><h1>Preview will appear once generation completes</h1></div></body></html>`;
}

function fallbackHTMLProject(prompt: string): ProjectFile[] {
  return [
    {
      path: "index.html",
      language: "html",
      content: `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-black text-white flex items-center justify-center h-screen">
<div class="text-center"><h1 class="text-3xl font-bold mb-4">⚡ MATRIX AI</h1>
<p class="text-gray-400">${prompt.replace(/</g, "&lt;")}</p>
<p class="mt-4 text-sm text-red-400">AI generation fallback activated</p></div></body></html>`,
    },
  ];
}

export default function Build() {
  const { user } = useAuth();
  const location = useLocation();

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activePath, setActivePath] = useState<string>("");
  const [draft, setDraft] = useState(
    (location.state as { prompt?: string })?.prompt ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 768
  );
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [codeFontPx, setCodeFontPx] = useState(12);
  const [wrapCode, setWrapCode] = useState(false);

  const didAutoRun = useRef(false);
  const filesRef = useRef<ProjectFile[]>(files);
  const historyRef = useRef<ChatTurn[]>(history);
  const docIdRef = useRef<string | null>(docId);
  const loadingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    docIdRef.current = docId;
  }, [docId]);

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const previewHtml = useMemo(
    () => (files.length ? pickPreview(files) : ""),
    [files]
  );
  const previewKey = useMemo(
    () => hashString(files.map((f) => `${f.path}\n${f.content}`).join("\n\n---\n\n")),
    [files]
  );
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const persistBuild = useCallback(
    async (prompt: string, projectFiles: ProjectFile[]) => {
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
          await updateDoc(
            doc(db, "generations", docIdRef.current),
            payload
          );
        }
      } catch (saveErr) {
        console.warn("Firestore save failed:", saveErr);
      }
    },
    [user]
  );

  // FIX 5: Wrapped in useCallback so it's stable for useEffect dependency
  const processPrompt = useCallback(
    async (prompt: string) => {
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
            .map(
              (f) => `\`\`\`${f.language} path=${f.path}\n${f.content}\n\`\`\``
            )
            .join("\n")
        : "";

      const userMsg = isFollowUp
        ? `Apply this change and return ALL files (full content, not diffs):\n\n${prompt}${filesContext}`
        : `Build this as a complete, polished, fully interactive single HTML page.\n\n${prompt}`;

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: HTML_SYSTEM },
        { role: "user", content: userMsg },
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const streamingHistory: ChatTurn[] = [
          ...baseHistory,
          { role: "assistant", content: "▍" },
        ];
        historyRef.current = streamingHistory;
        setHistory(streamingHistory);
        setTab("code");

        const result = await streamWebsiteAI(
          messages,
          (_chunk: string, full: string) => {
            setStreamBuffer(full);
            const preview = full.length > 800 ? `…${full.slice(-800)}` : full;
            const updated: ChatTurn[] = [
              ...baseHistory,
              { role: "assistant", content: preview + "▍" },
            ];
            historyRef.current = updated;
            setHistory(updated);
            // FIX 7: Removed redundant `if (setIsSynthesizing)` check
            setIsSynthesizing(false);
          },
          { timeoutMs: 180_000, signal: controller.signal }
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
        const firstUi =
          parsed.find((f) =>
            /preview\.html|index\.html|App\.(t|j)sx|page\.tsx/.test(f.path)
          ) ?? parsed[0];
        setActivePath(firstUi.path);
        setTab("preview");

        const summary = `✓ ${result.provider} · ${parsed.length} file${
          parsed.length > 1 ? "s" : ""
        }\n\n${parsed.map((f) => `• \`${f.path}\``).join("\n")}`;
        const doneHistory: ChatTurn[] = [
          ...baseHistory,
          { role: "assistant", content: summary },
        ];
        historyRef.current = doneHistory;
        setHistory(doneHistory);

        void persistBuild(prompt, parsed).catch(() => {});
        toast.success(isFollowUp ? "Updated" : "Build ready");
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        console.error("processPrompt() error:", e);
        const isAbort =
          err?.name === "AbortError" ||
          /aborted/i.test(String(err?.message ?? ""));
        toast.error(
          isAbort ? "Generation stopped" : (err?.message ?? "Generation failed")
        );
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
        setIsSynthesizing(false);
        setStreamBuffer("");
      }
    },
    [persistBuild]
  );

  const drainQueue = useCallback(
    async (first: string) => {
      loadingRef.current = true;
      setLoading(true);
      try {
        let next: string | undefined = first;
        while (next) {
          await processPrompt(next);
          next = queueRef.current.shift();
          setQueuedCount(queueRef.current.length);
          if (!next) break;
        }
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setQueuedCount(queueRef.current.length);
      }
    },
    [processPrompt]
  );

  // FIX 8: run wrapped in useCallback so the auto-run useEffect can safely depend on it
  const run = useCallback(
    async (prompt: string) => {
      const next = prompt.trim();
      if (!next) return;
      setDraft("");
      if (loadingRef.current) {
        queueRef.current.push(next);
        setQueuedCount(queueRef.current.length);
        toast.message(`Queued · ${queueRef.current.length} pending`);
        return;
      }
      await drainQueue(next);
    },
    [drainQueue]
  );

  // FIX 9: auto-run effect now correctly lists `run` as a dependency
  useEffect(() => {
    const p = (location.state as { prompt?: string })?.prompt;
    if (p && !didAutoRun.current) {
      didAutoRun.current = true;
      run(p);
    }
  }, [run, location.state]);

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      toast.message("Stopping generation…");
    }
    queueRef.current = [];
    setQueuedCount(0);
  };

  const downloadZip = async () => {
    if (!files.length) return;
    if (files.length === 1) {
      const f = files[0];
      const blob = new Blob([f.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.path.split("/").pop() || "file";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      const zip = new JSZip();
      for (const f of files) {
        zip.file(f.path.replace(/^\/+/, ""), f.content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "matrix-project.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded zip");
    } catch (e) {
      console.error(e);
      toast.error("Could not build zip — try copying files instead");
    }
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

  const codeToShow =
    streaming && streamBuffer ? streamBuffer : activeFile?.content ?? "";

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {!isMobile && (
            <span className="font-semibold text-sm tracking-wide">
              Matrixbook IDE
            </span>
          )}
          <span className="ml-2 text-[10px] font-mono px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/20">
            HTML
          </span>
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
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowHistory((v) => !v)}
              title="Chat history"
              className="text-white/70 hover:text-white relative"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-mono">
                {history.filter((h) => h.role === "user").length}
              </span>
            </Button>
          )}
          {files.length > 0 && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={copyActive}
                title="Copy active file"
                className="text-white/70 hover:text-white"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={downloadZip}
                title="Download project"
                className="text-white/70 hover:text-white"
              >
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
          {!isMobile && previewHtml && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white ml-1"
              onClick={() => {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(previewHtml);
                  w.document.close();
                }
              }}
            >
              <Rocket className="w-3.5 h-3.5 mr-1" /> Preview
            </Button>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex justify-between items-center px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex gap-1">
          {(["preview", "code"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {t === "preview" ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <Code2 className="w-3.5 h-3.5" />
              )}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "preview" && (
          <div className="flex gap-1">
            {(
              [
                { d: "desktop", Icon: Monitor },
                { d: "tablet", Icon: Tablet },
                { d: "mobile", Icon: Smartphone },
              ] as const
            ).map(({ d, Icon }) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`p-1.5 rounded-md transition-colors ${
                  device === d
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
                aria-label={d}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "preview" && (
        <div className="px-3 py-1.5 flex items-center gap-2 text-xs text-white/50 border-b border-white/5 shrink-0">
          <span>Zoom</span>
          <input
            type="range"
            min="0.3"
            max="1.2"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-24 accent-blue-500"
          />
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
        {tab === "code" && files.length > 0 && !isMobile && (
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
                      activeFile?.path === f.path
                        ? "bg-blue-600/20 text-blue-200 border-l-2 border-blue-400"
                        : "text-white/60 hover:bg-white/5 hover:text-white border-l-2 border-transparent"
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
            <div
              className={`bg-white overflow-hidden rounded-xl shadow-[0_0_100px_rgba(0,0,0,0.8)] ${getSize()}`}
              style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
            >
              {previewHtml && !isSynthesizing ? (
                <iframe
                  key={previewKey}
                  srcDoc={previewHtml}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title="Preview"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 bg-[#0a0a0a]">
                  {isSynthesizing ? (
                    <VibeLoader />
                  ) : loading ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                      <p className="text-xs font-mono font-bold tracking-widest text-neutral-500 uppercase">
                        Synchronizing Logic...
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-6 max-w-sm text-center">
                      <div className="w-16 h-16 rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/10">
                        <Monitor className="w-6 h-6 text-neutral-500" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-widest">
                          Awaiting Neural Prompt
                        </h3>
                        <p className="text-xs text-neutral-600 font-sans leading-relaxed">
                          Describe your architectural vision below to start the
                          synthesis process.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col min-h-0">
              {activeFile && (
                <div className="px-3 py-1.5 text-[11px] font-mono text-white/50 border-b border-white/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {isMobile ? (
                      <select
                        value={activeFile.path}
                        onChange={(e) => setActivePath(e.target.value)}
                        className="max-w-[60vw] truncate text-[11px] font-mono bg-zinc-950 border border-white/10 rounded-md px-2 py-1 text-white/80"
                      >
                        {files.map((f) => (
                          <option key={f.path} value={f.path}>
                            {f.path}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="truncate">{activeFile.path}</span>
                    )}
                    <span className="text-white/25 text-[10px] truncate">
                      {activeFile.language}
                      {!streaming && " · editable"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex items-center gap-2 text-white/40">
                      <span className="text-[10px]">A</span>
                      <input
                        type="range"
                        min="10"
                        max="18"
                        step="1"
                        value={codeFontPx}
                        onChange={(e) => setCodeFontPx(Number(e.target.value))}
                        className="w-24 accent-blue-500"
                        aria-label="Code font size"
                      />
                      <span className="text-[10px]">A</span>
                    </div>
                    <button
                      onClick={() => setWrapCode((v) => !v)}
                      className={`text-[10px] font-mono px-2 py-1 rounded-md border transition ${
                        wrapCode ? "bg-blue-600/15 border-blue-400/40 text-blue-200" : "border-white/10 text-white/45 hover:text-white/75 hover:border-white/30"
                      }`}
                      title="Toggle line wrap"
                    >
                      {wrapCode ? "Wrap" : "No wrap"}
                    </button>
                  </div>
                </div>
              )}
              {streaming ? (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <VibeLoader />
                </div>
              ) : (
                <>
                  {/* Mobile font slider */}
                  <div className="sm:hidden px-3 py-2 border-b border-white/10 text-[10px] text-white/55 flex items-center gap-2 shrink-0">
                    <span className="font-mono">Size</span>
                    <input
                      type="range"
                      min="10"
                      max="18"
                      step="1"
                      value={codeFontPx}
                      onChange={(e) => setCodeFontPx(Number(e.target.value))}
                      className="flex-1 accent-blue-500"
                      aria-label="Code font size"
                    />
                    <span className="font-mono w-8 text-right">{codeFontPx}px</span>
                  </div>

                  <textarea
                    className="flex-1 min-h-0 w-full p-4 font-mono text-green-300 bg-transparent border-0 outline-none resize-none focus-visible:ring-0"
                    style={{
                      fontSize: `${codeFontPx}px`,
                      lineHeight: 1.55,
                      whiteSpace: wrapCode ? "pre-wrap" : "pre",
                      overflowWrap: wrapCode ? "anywhere" : "normal",
                    }}
                    value={activeFile?.content ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const path = activePath || activeFile?.path;
                      if (!path) return;
                      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content: v } : f)));
                    }}
                    spellCheck={false}
                    placeholder="// Code will appear here after generation — you can edit freely"
                    disabled={!activeFile}
                  />
                </>
              )}
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                run(draft);
              }
            }}
            placeholder={
              files.length
                ? "What should we change next?"
                : "Describe the website to build…"
            }
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30"
          />
          {queuedCount > 0 && (
            <span className="text-[10px] font-mono text-blue-300 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
              {queuedCount} queued
            </span>
          )}
          {loading ? (
            <Button
              onClick={stop}
              size="icon"
              className="bg-red-600 hover:bg-red-500 text-white rounded-xl shrink-0"
              title="Stop"
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={() => run(draft)}
              disabled={!draft.trim()}
              size="icon"
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl shrink-0 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Chat history */}
      {showHistory && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
          onClick={() => setShowHistory(false)}
        >
          <aside
            className="w-full max-w-md h-full bg-zinc-950 border-l border-white/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-semibold text-sm">Conversation</span>
              <button
                onClick={() => setShowHistory(false)}
                className="text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {history.length === 0 ? (
                <p className="text-xs text-white/40 text-center mt-8">
                  No messages yet
                </p>
              ) : (
                history.map((m, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded-xl px-3 py-2 ${
                      m.role === "user"
                        ? "bg-blue-600/20 border border-blue-500/30 ml-6"
                        : "bg-white/5 border border-white/10 mr-6"
                    }`}
                  >
                    <p className="text-[10px] font-mono text-white/40 mb-1">
                      {m.role === "user" ? "You" : "MATRIX-AI"}
                    </p>
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
        <button
          onClick={() => {
            const w = window.open("", "_blank");
            if (w) {
              w.document.write(previewHtml);
              w.document.close();
            }
          }}
          className="fixed bottom-24 right-4 bg-blue-600 hover:bg-blue-500 p-4 rounded-full shadow-xl transition-colors"
          aria-label="Open preview"
        >
          <Rocket className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
