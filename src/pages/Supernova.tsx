import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Paperclip, Sparkles, StopCircle, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { isOpenRouterConfigured } from "@/lib/env";
import { fileToDataUrl, generateImage, ImageRatio, ImageStyle } from "@/lib/supernovaChat";

const STYLES: { id: ImageStyle; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "illustration", label: "Illustration" },
  { id: "3d", label: "3D" },
  { id: "pixel", label: "Pixel" },
  { id: "logo", label: "Logo" },
  { id: "sketch", label: "Sketch" },
  { id: "watercolor", label: "Watercolor" },
  { id: "cyberpunk", label: "Cyberpunk" },
];

const RATIOS: ImageRatio[] = ["1:1", "16:9", "9:16", "3:2", "2:3", "4:3"];

type Generated = { url: string; createdAt: number; prompt: string };

export default function Supernova() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [style, setStyle] = useState<ImageStyle>("auto");
  const [ratio, setRatio] = useState<ImageRatio>("1:1");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Generated[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const canGenerate = useMemo(() => !!prompt.trim() || attachments.length > 0, [prompt, attachments.length]);

  const onAttach = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const next: string[] = [];
      for (const f of Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 4)) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error(`${f.name} is larger than 8 MB`);
          continue;
        }
        next.push(await fileToDataUrl(f));
      }
      setAttachments((prev) => [...prev, ...next].slice(0, 4));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read file");
    }
  };

  const removeAttachment = (i: number) =>
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  const stop = () => abortRef.current?.abort();

  const generate = async () => {
    if (!user) return navigate("/auth");
    if (!isOpenRouterConfigured) {
      toast.error("Configure VITE_OPENROUTER_API_KEY to use Supernova.");
      return;
    }
    if (!canGenerate || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const images = await generateImage({
        prompt,
        style,
        ratio,
        count: 1,
        signal: controller.signal,
        referenceDataUrls: attachments.length ? attachments : undefined,
      });
      const now = Date.now();
      setResults((prev) => [
        ...images.map((i) => ({ url: i.url, createdAt: now, prompt: prompt || "(edit)" })),
        ...prev,
      ].slice(0, 18));
      toast.success("Image ready");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Image generation failed");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/50 backdrop-blur">
        <div className="container h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-zinc-400 hover:text-white" aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 via-purple-600 to-fuchsia-600 grid place-items-center shadow-lg shadow-purple-500/20">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span className="font-semibold text-sm">Supernova</span>
              <span className="text-[10px] font-mono px-2 py-1 rounded-md border border-white/10 text-white/60">
                Text→Image · Image→Image
              </span>
            </div>
          </div>
          {!isOpenRouterConfigured && (
            <span className="hidden sm:inline text-[11px] text-amber-200/90 border border-amber-500/30 bg-amber-500/10 px-2 py-1 rounded-lg">
              Missing <span className="font-mono">VITE_OPENROUTER_API_KEY</span>
            </span>
          )}
        </div>
      </header>

      <main className="container py-6">
        <div className="grid lg:grid-cols-[420px_1fr] gap-6">
          <section className="glass rounded-2xl border border-white/10 p-4 sm:p-5">
            <p className="text-xs font-mono text-white/50 uppercase tracking-widest">Prompt</p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe an image… or upload an image and describe the edit"
              className="mt-3 bg-black/30 border-white/10 rounded-2xl min-h-28 text-sm"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] font-mono text-white/45 uppercase tracking-widest mb-2">Style</p>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as ImageStyle)}
                  className="w-full text-sm bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/85"
                >
                  {STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-mono text-white/45 uppercase tracking-widest mb-2">Ratio</p>
                <select
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value as ImageRatio)}
                  className="w-full text-sm bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/85 font-mono"
                >
                  {RATIOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[10px] font-mono text-white/45 uppercase tracking-widest mb-2">Reference images (optional)</p>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-black/30 hover:bg-white/5 transition text-sm text-white/80">
                  <Paperclip className="w-4 h-4" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onAttach(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <Input value={`${attachments.length} attached`} readOnly className="bg-black/30 border-white/10 rounded-xl text-sm text-white/70" />
              </div>
              {attachments.length > 0 && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {attachments.map((src, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-black/30">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeAttachment(i)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 border border-white/10 grid place-items-center text-white/90"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5">
              {busy ? (
                <Button onClick={stop} className="w-full rounded-xl bg-red-500/80 hover:bg-red-500">
                  <StopCircle className="w-4 h-4" /> Stop
                </Button>
              ) : (
                <Button
                  onClick={generate}
                  disabled={!canGenerate || !isOpenRouterConfigured}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 disabled:opacity-40"
                >
                  <Wand2 className="w-4 h-4" /> Generate
                </Button>
              )}
            </div>
          </section>

          <section className="glass rounded-2xl border border-white/10 p-4 sm:p-5 min-h-[320px]">
            <p className="text-xs font-mono text-white/50 uppercase tracking-widest">Results</p>
            {busy ? (
              <div className="mt-6 flex items-center justify-center min-h-[260px]">
                <div className="text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl border border-white/10 bg-white/5 grid place-items-center">
                    <Sparkles className="w-6 h-6 text-purple-300 animate-pulse" />
                  </div>
                  <p className="text-xs font-mono text-white/50 uppercase tracking-widest">Generating…</p>
                </div>
              </div>
            ) : results.length ? (
              <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {results.map((r) => (
                  <div key={`${r.createdAt}-${r.url.slice(0, 16)}`} className="group rounded-2xl overflow-hidden border border-white/10 bg-black/30">
                    <img src={r.url} alt="" className="w-full h-auto object-cover block" />
                    <div className="p-3 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-white/55 line-clamp-2">{r.prompt}</p>
                      <a
                        href={r.url}
                        download={`supernova-${r.createdAt}.jpg`}
                        className="shrink-0 w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 grid place-items-center"
                        title="Download"
                      >
                        <Download className="w-4 h-4 text-white/80" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 text-sm text-white/55">Generate an image to see results here.</div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
