import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Paperclip, Sparkles, StopCircle, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { generateImage } from "@/lib/supernovaChat";

const STYLES = [
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

const RATIOS = ["1:1", "16:9", "9:16", "3:2", "2:3", "4:3"];

type Generated = { url: string; createdAt: number; prompt: string };

export default function Supernova() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [style, setStyle] = useState("auto");
  const [ratio, setRatio] = useState("1:1");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Generated[]>([]);

  const canGenerate = useMemo(() => !!prompt.trim() || attachments.length > 0, [prompt, attachments.length]);

  const onAttach = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const next: string[] = [];
      for (const f of Array.from(files).filter((f) => f.type.startsWith("image/"))) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error(`${f.name} is larger than 8 MB`);
          continue;
        }
        next.push(URL.createObjectURL(f));
      }
      setAttachments((prev) => [...prev, ...next].slice(0, 4));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read file");
    }
  };

  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  const generate = async () => {
    if (!user) return navigate("/auth");
    if (!canGenerate || busy) return;

    setBusy(true);
    try {
      const images = await generateImage({
        prompt,
        style,
        ratio,
        count: 1,
      });
      const now = Date.now();
      setResults((prev) => [...images.map((i) => ({ url: i.url, createdAt: now, prompt })), ...prev].slice(0, 18));
      toast.success("Image ready");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Image generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/50 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-zinc-400 hover:text-white" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-blue-500 via-purple-600 to-fuchsia-600 shadow-lg shadow-purple-500/20">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold">Supernova</span>
              <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[10px] text-white/60">
                Text-to-Image · Image-to-Image
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="glass rounded-2xl border border-white/10 p-4 sm:p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-white/50">Prompt</p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe an image..."
              className="mt-3 min-h-28 rounded-2xl border-white/10 bg-black/30 text-sm"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-white/45">Style</p>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85"
                >
                  {STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-white/45">Ratio</p>
                <select
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white/85"
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
              <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-white/45">Reference images (optional)</p>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 transition hover:bg-white/5">
                  <Paperclip className="h-4 w-4" />
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
                <Input value={`${attachments.length} attached`} readOnly className="rounded-xl border-white/10 bg-black/30 text-sm text-white/70" />
              </div>
              {attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {attachments.map((src, i) => (
                    <div key={i} className="relative h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => removeAttachment(i)}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-black/70 text-white/90"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5">
              {busy ? (
                <Button onClick={() => setBusy(false)} className="w-full rounded-xl bg-red-500/80 hover:bg-red-500">
                  <StopCircle className="h-4 w-4" /> Stop
                </Button>
              ) : (
                <Button
                  onClick={generate}
                  disabled={!canGenerate}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 disabled:opacity-40"
                >
                  <Wand2 className="h-4 w-4" /> Generate
                </Button>
              )}
            </div>
          </section>

          <section className="glass min-h-[320px] rounded-2xl border border-white/10 p-4 sm:p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-white/50">Results</p>
            {results.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((r) => (
                  <div key={`${r.createdAt}-${r.url.slice(0, 16)}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <img src={r.url} alt="" className="block h-auto w-full object-cover" />
                    <div className="flex items-center justify-between gap-2 p-3">
                      <p className="line-clamp-2 text-[11px] text-white/55">{r.prompt}</p>
                      <a
                        href={r.url}
                        download={`supernova-${r.createdAt}.jpg`}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
                        title="Download"
                      >
                        <Download className="h-4 w-4 text-white/80" />
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
