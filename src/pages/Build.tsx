import { useEffect, useRef, useState } from "react";
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
  Upload,
  Wand2,
  Settings,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { completeWebsiteAI } from "@/lib/websiteAI";
import { getStoredSambaNovaKey, saveStoredSambaNovaKey } from "@/lib/sambanova";

type ChatTurn = { role: "user" | "assistant"; content: string };

type Device = "desktop" | "tablet" | "mobile";

const BASE_SYSTEM = `You are MATRIX-AI, an expert web developer powered by Mistral.

STRICT OUTPUT RULES:
- Output ONLY a single complete HTML file
- Always start with <!DOCTYPE html>
- Never include markdown fences, explanations, or comments outside the HTML
- Embed all CSS inside a <style> tag or inline styles
- Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Use modern UI patterns: glassmorphism, gradients, smooth animations, clean typography
- Fully responsive — mobile-first
- Use semantic HTML5 elements
- Include hover states and micro-interactions where appropriate
- Prefer a dark or vibrant color scheme unless the prompt specifies otherwise
- When the user asks for full-stack behavior, build a complete single-file app prototype with frontend, JavaScript state, forms, CRUD interactions, localStorage persistence, dashboards, auth screens, and API simulation where real backend access is not available
- If user-provided image data URLs are supplied, use them directly in the generated page where relevant`;

function cleanHTML(html: string) {
  return html
    .replace(/^```html/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}

function ensureHTML(html: string) {
  if (!html.toLowerCase().includes("<!doctype")) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-black text-white">
${html}
</body>
</html>`;
  }
  return html;
}

function fallbackHTML(prompt: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
<title>Matrix Build</title>
</head>
<body class="bg-black text-white flex items-center justify-center h-screen">
  <div class="text-center">
    <h1 class="text-3xl font-bold mb-4">⚡ MATRIX AI</h1>
    <p class="text-gray-400">${prompt}</p>
    <p class="mt-4 text-sm text-red-400">AI generation fallback activated</p>
  </div>
</body>
</html>`;
}

async function fileToImageDataUrl(file: File, maxSize = 1200, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

function realisticImageUrl(prompt: string) {
  const params = new URLSearchParams({
    width: "1024",
    height: "768",
    seed: String(Date.now()),
    model: "flux",
    nologo: "true",
    enhance: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, realistic, professional photography, high detail, natural lighting`)}?${params.toString()}`;
}

export default function Build() {
  const { user } = useAuth();
  const location = useLocation();

  const [html, setHtml] = useState("");
  const [draft, setDraft] = useState(
    (location.state as any)?.prompt ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<Device>("mobile");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gallery, setGallery] = useState<string[]>([]);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [sambaKeyDraft, setSambaKeyDraft] = useState(() => getStoredSambaNovaKey());
  const didAutoRun = useRef(false);
  const htmlRef = useRef(html);
  const historyRef = useRef(history);
  const docIdRef = useRef(docId);
  const loadingRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  useEffect(() => { htmlRef.current = html; }, [html]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { docIdRef.current = docId; }, [docId]);

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Auto-run if prompt came from navigation state — guard against StrictMode double-mount
  useEffect(() => {
    const p = (location.state as any)?.prompt;
    if (p && !didAutoRun.current) {
      didAutoRun.current = true;
      run(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistBuild = async (prompt: string, generatedHtml: string) => {
    if (!user) return;
    try {
      if (!docIdRef.current) {
        const created = await addDoc(collection(db, "generations"), {
          user_id: user.uid,
          prompt,
          html: generatedHtml,
          title: prompt.slice(0, 60),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        docIdRef.current = created.id;
        setDocId(created.id);
      } else {
        await updateDoc(doc(db, "generations", docIdRef.current), {
          html: generatedHtml,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (saveErr) {
      console.warn("Firestore save failed:", saveErr);
      toast.error("Saved preview locally, but cloud save failed");
    }
  };

  const processPrompt = async (prompt: string) => {
    const currentHtml = htmlRef.current;
    const isFollowUp = currentHtml.length > 0;
    const userTurn: ChatTurn = { role: "user", content: prompt };
    const nextHistory = [...historyRef.current, userTurn];
    historyRef.current = nextHistory;
    setHistory(nextHistory);

    try {
      const imageContext = gallery.length
        ? `\n\nUser gallery images available as data URLs. Use these when relevant:\n${gallery.slice(0, 4).join("\n")}`
        : "";
      const messages = [
        { role: "system", content: BASE_SYSTEM },
        {
          role: "user",
          content: isFollowUp
            ? `Current HTML:\n\n${currentHtml}\n\nApply this next change and output the FULL updated HTML only:\n\n${prompt}${imageContext}`
            : `Build this as a complete, polished, fully interactive single-file web app/page. Output ONLY the HTML:\n\n${prompt}${imageContext}`,
        },
      ];
const result = await completeWebsiteAI(messages, { prefer: "mistral", timeoutMs: 90_000 });
      let generatedHtml = ensureHTML(cleanHTML(result.content));
      if (!generatedHtml || generatedHtml.length < 80) generatedHtml = isFollowUp ? currentHtml : fallbackHTML(prompt);
      htmlRef.current = generatedHtml;
      setHtml(generatedHtml);
      const doneHistory: ChatTurn[] = [
        ...nextHistory,
        { role: "assistant", content: `✓ Updated with ${result.provider}.` },
      ];
      historyRef.current = doneHistory;
      setHistory(doneHistory);
      await persistBuild(prompt, generatedHtml);
      toast.success(isFollowUp ? "Updated" : "Build ready");
    } catch (e: any) {
      console.error("run() error:", e);
      toast.error(e?.name === "AbortError" ? "AI request timed out" : e?.message ?? "Generation failed");
      if (!currentHtml) {
        const fallback = fallbackHTML(prompt);
        htmlRef.current = fallback;
        setHtml(fallback);
      }
    }
  };

  const drainQueue = async (first: string) => {
    loadingRef.current = true;
    setLoading(true);
    try {
      await processPrompt(first);
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        setQueuedCount(queueRef.current.length);
        if (next) await processPrompt(next);
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
      toast.message("Prompt queued");
      return;
    }
    await drainQueue(next);
  };

  // ── Download ───────────────────────────────────────────────────
  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "matrix.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Copy ───────────────────────────────────────────────────────
  const copy = async () => {
    await navigator.clipboard.writeText(html);
    toast.success("Copied to clipboard");
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const images = await Promise.all(Array.from(files).filter((file) => file.type.startsWith("image/")).map((file) => fileToImageDataUrl(file)));
      setGallery((prev) => [...images, ...prev].slice(0, 12));
      toast.success(`${images.length} image${images.length === 1 ? "" : "s"} added`);
    } catch (error: any) {
      toast.error(error?.message ?? "Image upload failed");
    }
  };

  const generateImageAsset = async () => {
    if (!imagePrompt.trim()) return;
    setImageBusy(true);
    try {
      const src = realisticImageUrl(imagePrompt);
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image model failed to render"));
        img.src = src;
      });
      setGallery((prev) => [src, ...prev].slice(0, 12));
      setImagePrompt("");
      toast.success("Image generated");
    } catch (error: any) {
      toast.error(error?.message ?? "Image generation failed");
    } finally {
      setImageBusy(false);
    }
  };

  const applyGalleryToPrompt = (src: string) => {
    setDraft((prev) => `${prev.trim()}\nUse this uploaded image in the website: ${src}`.trim());
    setMediaOpen(false);
  };

  // ── Device frame size ──────────────────────────────────────────
  const getSize = () => {
    if (device === "mobile") return "w-[360px] h-[740px]";
    if (device === "tablet") return "w-[768px] h-[1000px]";
    return "w-full h-full";
  };

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {!isMobile && (
            <span className="font-semibold text-sm tracking-wide">
              Matrix AI
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMediaOpen(true)}
            title="Image tools"
            className="text-white/70 hover:text-white"
          >
            <ImageIcon className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
            title="AI settings"
            className="text-white/70 hover:text-white"
          >
            <Settings className="w-4 h-4" />
          </Button>
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
          {html && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={copy}
                title="Copy HTML"
                className="text-white/70 hover:text-white"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={download}
                title="Download HTML"
                className="text-white/70 hover:text-white"
              >
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
          {!isMobile && html && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white ml-1"
              onClick={() => {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(html);
                  w.document.close();
                }
              }}
            >
              <Rocket className="w-3.5 h-3.5 mr-1" /> Preview
            </Button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
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

        {/* Zoom slider */}
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
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-4">
          {tab === "preview" ? (
            <div
              className={`bg-white overflow-hidden rounded-xl shadow-2xl shadow-black/50 ${getSize()}`}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top center",
              }}
            >
              {html ? (
                <iframe
                  srcDoc={html}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                  title="Preview"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  {loading ? (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-sm font-mono">Building...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Monitor className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-sm">
                        Describe what to build below
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <pre className="p-4 text-xs font-mono text-green-400 overflow-auto w-full h-full whitespace-pre-wrap">
              {html || (
                <span className="text-white/30">
                  // Code will appear here after generation
                </span>
              )}
            </pre>
          )}
        </div>
      </div>

      {/* ── Floating prompt input ── */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        {html && !loading && (
          <p className="text-center text-[11px] text-white/40 mb-2 font-mono">
            <Sparkles className="w-3 h-3 inline mr-1 text-blue-400" />
            Keep iterating — try "make the hero darker" or "add a contact form"
          </p>
        )}
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-lg rounded-2xl px-4 py-3 border border-white/10 focus-within:border-blue-500/50 transition-colors max-w-2xl mx-auto">
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
              html
                ? "What should we change next?"
                : "Describe what to build..."
            }
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30"
          />
          {queuedCount > 0 && (
            <span className="text-[10px] font-mono text-blue-300 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
              {queuedCount} queued
            </span>
          )}
          <Button
            onClick={() => run(draft)}
            disabled={!draft.trim()}
            size="icon"
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl shrink-0 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Chat history side panel ── */}
      {showHistory && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
          onClick={() => setShowHistory(false)}
        >
          <aside
            className="w-full max-w-sm h-full bg-zinc-950 border-l border-white/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-semibold text-sm">Conversation</span>
              <button
                onClick={() => setShowHistory(false)}
                className="text-white/50 hover:text-white text-xs"
              >
                Close
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
                    <p className="text-[10px] font-mono text-white/40 mb-0.5">
                      {m.role === "user" ? "You" : "MATRIX-AI"}
                    </p>
                    <p className="text-white/90 whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      <Dialog open={mediaOpen} onOpenChange={setMediaOpen}>
        <DialogContent className="glass-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" /> Image studio</DialogTitle>
            <DialogDescription>Upload local images or generate realistic images for the current website prompt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 cursor-pointer hover:border-primary/60 transition-colors">
              <Upload className="w-5 h-5 text-primary" />
              <span className="text-sm text-white/80">Upload local gallery images</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadImages(e.target.files)} />
            </label>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Prompt an image/SVG asset for this website..." className="min-h-20 bg-white/5 border-white/10 text-white" />
              <Button onClick={generateImageAsset} disabled={imageBusy || !imagePrompt.trim()} className="self-end bg-blue-600 hover:bg-blue-500 text-white">
                {imageBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate
              </Button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-auto">
              {gallery.map((src, i) => (
                <button key={i} onClick={() => applyGalleryToPrompt(src)} className="aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-blue-400 transition-colors">
                  <img src={src} alt={`Gallery asset ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="glass-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> AI settings</DialogTitle>
            <DialogDescription>Save a SambaNova key in this browser for AI website generation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={sambaKeyDraft} onChange={(e) => setSambaKeyDraft(e.target.value)} placeholder="SambaNova API key" className="bg-white/5 border-white/10 text-white" />
            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" onClick={() => { saveStoredSambaNovaKey(sambaKeyDraft); setSettingsOpen(false); toast.success("SambaNova key saved for this browser"); }}>
              Save AI key
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile preview FAB */}
      {isMobile && html && (
        <button
          onClick={() => {
            const w = window.open("", "_blank");
            if (w) {
              w.document.write(html);
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

