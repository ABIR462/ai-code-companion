import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
  X,
  ImageOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const IMAGE_RATIOS = {
  square:    { label: "1:1 Square",     w: 1024, h: 1024 },
  landscape: { label: "16:9 Landscape", w: 1280, h: 720  },
  portrait:  { label: "9:16 Portrait",  w: 720,  h: 1280 },
  wide:      { label: "3:2 Wide",       w: 1200, h: 800  },
} as const;
type ImageRatio = keyof typeof IMAGE_RATIOS;

type ImageJob = {
  id: string;
  prompt: string;
  ratio: ImageRatio;
  status: "pending" | "ready" | "error";
  src?: string;
  error?: string;
  startedAt: number;
};

const PRESETS = [
  "Hero banner, dark gradient, neon glow, cinematic",
  "Minimal product mockup on marble surface, studio light",
  "Diverse team portrait, soft window light, candid",
  "Abstract 3D render, pastel colors, glossy shapes",
  "Aerial cityscape at golden hour, ultra realistic",
  "Macro food photography, fresh, vibrant",
];

function realisticImageUrl(prompt: string, ratio: ImageRatio, seed: number) {
  const { w, h } = IMAGE_RATIOS[ratio];
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    seed: String(seed),
    model: "flux",
    nologo: "true",
    enhance: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${prompt}, ultra realistic, professional photography, sharp focus, high detail, natural lighting, 8k`,
  )}?${params.toString()}`;
}

function loadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image model failed to render — try again"));
    img.src = src;
  });
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function Supernova() {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<ImageRatio>("wide");
  const [jobs, setJobs] = useState<ImageJob[]>([]);

  const updateJob = (id: string, patch: Partial<ImageJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const startJob = async (job: ImageJob) => {
    const seed = Date.now() + Math.floor(Math.random() * 1000);
    const src = realisticImageUrl(job.prompt, job.ratio, seed);
    try {
      await loadImage(src);
      updateJob(job.id, { status: "ready", src, error: undefined });
    } catch (err: any) {
      updateJob(job.id, { status: "error", error: err?.message ?? "Failed" });
    }
  };

  const generate = () => {
    const text = prompt.trim();
    if (!text) return;
    const job: ImageJob = {
      id: Math.random().toString(36).slice(2, 9),
      prompt: text,
      ratio,
      status: "pending",
      startedAt: Date.now(),
    };
    setJobs((prev) => [job, ...prev].slice(0, 16));
    startJob(job);
    toast.message("Rendering image…");
  };

  const retry = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    updateJob(id, { status: "pending", error: undefined, startedAt: Date.now() });
    startJob({ ...job, status: "pending" });
  };

  const remove = (id: string) =>
    setJobs((prev) => prev.filter((j) => j.id !== id));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const items = await Promise.all(
        Array.from(files)
          .filter((f) => f.type.startsWith("image/"))
          .slice(0, 8)
          .map(async (f) => ({
            id: Math.random().toString(36).slice(2, 9),
            prompt: f.name,
            ratio,
            status: "ready" as const,
            src: await fileToDataUrl(f),
            startedAt: Date.now(),
          })),
      );
      setJobs((prev) => [...items, ...prev].slice(0, 16));
      toast.success(`${items.length} uploaded`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  };

  const aspectClass = (r: ImageRatio) =>
    r === "square" ? "aspect-square"
      : r === "landscape" ? "aspect-video"
      : r === "portrait" ? "aspect-[9/16]"
      : "aspect-[3/2]";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-black/60 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/build" className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Back to IDE
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-blue-600 flex items-center justify-center">
              <Wand2 className="w-3.5 h-3.5" />
            </span>
            <h1 className="font-semibold tracking-wide">Supernova Image Studio</h1>
          </div>
          <div className="w-24" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Composer */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image — e.g. 'A futuristic city at golden hour, cinematic, ultra-detailed'"
            className="min-h-24 bg-black/40 border-white/10 text-white placeholder:text-white/30 resize-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(IMAGE_RATIOS) as ImageRatio[]).map((r) => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                className={`text-[11px] font-mono px-2.5 py-1 rounded-md border transition ${
                  ratio === r
                    ? "bg-blue-600/20 border-blue-400/50 text-blue-200"
                    : "border-white/10 text-white/50 hover:text-white hover:border-white/30"
                }`}
              >
                {IMAGE_RATIOS[r].label}
              </button>
            ))}
            <div className="flex-1" />
            <label className="cursor-pointer text-xs px-3 py-1.5 rounded-md border border-white/10 text-white/70 hover:text-white hover:border-white/30 inline-flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Upload
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            </label>
            <Button
              onClick={generate}
              disabled={!prompt.trim()}
              className="bg-gradient-to-r from-fuchsia-500 to-blue-600 hover:opacity-90 text-white"
            >
              <Sparkles className="w-4 h-4 mr-1.5" /> Generate
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="text-[10px] px-2 py-1 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30"
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* Gallery */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono text-white/50">
              Renders · {jobs.length}
            </p>
            {jobs.length > 0 && (
              <button
                onClick={() => setJobs([])}
                className="text-[11px] text-white/40 hover:text-red-400"
              >
                Clear all
              </button>
            )}
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center text-sm text-white/40 font-mono">
              No renders yet — describe an image above
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <article
                  key={job.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col"
                >
                  <div className={`relative ${aspectClass(job.ratio)} bg-black`}>
                    {/* Skeleton */}
                    {job.status === "pending" && (
                      <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-white/[0.08] to-white/5" />
                        <div className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.4s_infinite]" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                          <p className="text-[11px] font-mono text-white/60">
                            Rendering · {Math.max(1, Math.round((Date.now() - job.startedAt) / 1000))}s
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {job.status === "error" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center bg-red-950/20">
                        <ImageOff className="w-7 h-7 text-red-400" />
                        <p className="text-xs text-red-200/90 leading-snug">
                          {job.error ?? "Render failed"}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => retry(job.id)}
                          className="bg-red-600 hover:bg-red-500 text-white h-7 text-xs"
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
                        </Button>
                      </div>
                    )}

                    {/* Ready */}
                    {job.status === "ready" && job.src && (
                      <img
                        src={job.src}
                        alt={job.prompt}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}

                    {/* Remove */}
                    <button
                      onClick={() => remove(job.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur border border-white/10 text-white/80 hover:text-white hover:bg-black/80 flex items-center justify-center"
                      aria-label="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-3 space-y-2">
                    <p className="text-xs text-white/70 line-clamp-2 min-h-[2.25rem]">
                      {job.prompt}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-white/40">
                        {IMAGE_RATIOS[job.ratio].label}
                      </span>
                      <div className="flex items-center gap-1">
                        {job.status === "ready" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => retry(job.id)}
                              className="h-7 px-2 text-xs text-white/70 hover:text-white"
                              title="Re-roll"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </Button>
                            <a
                              href={job.src}
                              download={`supernova-${job.id}.jpg`}
                              target="_blank"
                              rel="noreferrer"
                              className="h-7 px-2 text-xs text-white/70 hover:text-white inline-flex items-center"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}