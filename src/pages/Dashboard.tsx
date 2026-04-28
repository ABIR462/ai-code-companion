import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { completeWebsiteAI } from "@/lib/websiteAI";
import {
  Loader2, Plus, Trash2, Eye, Code2, Edit3, Download,
  Copy, Zap, LayoutDashboard, Search, X, Check,
  Smartphone, Monitor, Tablet, RefreshCw,
  Image as ImageIcon, ShoppingBag, Type, Palette, MousePointer2, Upload, Wand2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
type Gen = {
  id: string;
  title: string | null;
  prompt: string;
  html: string;
  created_at: string;
};
type Device = "desktop" | "tablet" | "mobile";

/* ------------------------------------------------------------------ */
/*  Image categories                                                    */
/* ------------------------------------------------------------------ */
const IMG_CATS = [
  { label: "Nature",       q: "nature"       },
  { label: "Business",     q: "business"     },
  { label: "Tech",         q: "technology"   },
  { label: "Food",         q: "food"         },
  { label: "Fashion",      q: "fashion"      },
  { label: "Architecture", q: "architecture" },
  { label: "People",       q: "people"       },
  { label: "Products",     q: "product"      },
];

/* ------------------------------------------------------------------ */
/*  Inject click-to-edit script into iframe HTML                       */
/* ------------------------------------------------------------------ */
function injectEditor(html: string): string {
  const script = [
    "<scr" + "ipt>",
    "(function(){",
    "var st=document.createElement('style');",
    "st.textContent='[data-me]:hover{outline:2px solid #3b82f6!important;cursor:text!important}",
    "[data-me]:focus{outline:2px solid #8b5cf6!important;background:rgba(139,92,246,.05)!important}';",
    "document.head.appendChild(st);",
    "document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,li,button,label').forEach(function(el){",
    "  el.setAttribute('contenteditable','true');",
    "  el.setAttribute('data-me','1');",
    "  el.addEventListener('blur',function(){window.parent.postMessage({type:'matrix-html-change',html:'<!DOCTYPE html>'+document.documentElement.outerHTML},'*');});",
    "});",
    "document.querySelectorAll('img').forEach(function(img){",
    "  img.style.cursor='pointer';",
    "  img.addEventListener('click',function(e){",
    "    e.preventDefault();",
    "    window.parent.postMessage({type:'matrix-img-click',src:img.src},'*');",
    "  });",
    "});",
    "})();",
    "</" + "script>",
  ].join("");
  return html.replace("</body>", script + "</body>");
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

function cleanHTML(html: string) {
  return html.replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
}

function ensureHTML(html: string) {
  if (html.toLowerCase().includes("<!doctype")) return html;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head><body>${html}</body></html>`;
}

function sanitizeEditorHTML(html: string) {
  try {
    const doc = new DOMParser().parseFromString(ensureHTML(html), "text/html");
    doc.querySelectorAll("script").forEach((script) => {
      if (script.textContent?.includes("matrix-html-change") || script.textContent?.includes("matrix-img-click")) {
        script.remove();
      }
    });
    doc.querySelectorAll("[data-me]").forEach((el) => {
      el.removeAttribute("data-me");
      el.removeAttribute("contenteditable");
    });
    return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
  } catch {
    return ensureHTML(html);
  }
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

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items,          setItems]          = useState<Gen[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState("");
  const [active,         setActive]         = useState<Gen | null>(null);
  const [tab,            setTab]            = useState<"preview" | "code">("preview");
  const [device,         setDevice]         = useState<Device>("desktop");
  const [editMode,       setEditMode]       = useState(false);
  const [editedHtml,     setEditedHtml]     = useState("");
  const [imgPanel,       setImgPanel]       = useState(false);
  const [imgSearch,      setImgSearch]      = useState("");
  const [imgResults,     setImgResults]     = useState<string[]>([]);
  const [selectedImgSrc, setSelectedImgSrc] = useState<string | null>(null);
  const [regenLoading,   setRegenLoading]   = useState(false);
  const [localImages,     setLocalImages]    = useState<string[]>([]);
  const [imagePrompt,     setImagePrompt]    = useState("");
  const [imageBusy,       setImageBusy]      = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /* ── Realtime Firestore listener ── */
  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // NOTE: We deliberately omit `orderBy` so Firestore doesn't require a
    // composite index (where + orderBy). We sort client-side instead — this
    // keeps the dashboard working out-of-the-box without manual index setup.
    const q = query(
      collection(db, "generations"),
      where("user_id", "==", user.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Gen, "id">),
        }));
        // Newest first
        docs.sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        });
        setItems(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        toast.error(
          err.code === "permission-denied"
            ? "Firestore rules are blocking reads — allow `generations` for authenticated users"
            : "Failed to load: " + err.message
        );
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  /* ── Listen for iframe postMessage (image click) ── */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "matrix-img-click") {
        setSelectedImgSrc(e.data.src as string);
        setImgPanel(true);
      } else if (e.data?.type === "matrix-html-change" && typeof e.data.html === "string") {
        setEditedHtml(sanitizeEditorHTML(e.data.html));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  /* ── Open item in editor ── */
  const openItem = (g: Gen) => {
    setActive(g);
    setEditedHtml(g.html);
    setEditMode(false);
    setTab("preview");
    setDevice("desktop");
  };

  /* ── Delete ── */
  const remove = async (id: string) => {
    try {
      await deleteDoc(doc(db, "generations", id));
      if (active?.id === id) setActive(null);
      toast.success("Deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
  };

  /* ── Save edits back to Firestore ── */
  const saveEdits = async () => {
    if (!active) return;
    const iframe = iframeRef.current;
    const liveHtml = sanitizeEditorHTML(
      iframe?.contentDocument?.documentElement?.outerHTML
        ? "<!DOCTYPE html>" + iframe.contentDocument.documentElement.outerHTML
        : editedHtml,
    );
    try {
      await updateDoc(doc(db, "generations", active.id), { html: liveHtml });
      setActive((prev) => (prev ? { ...prev, html: liveHtml } : null));
      setEditedHtml(liveHtml);
      toast.success("Changes saved");
      setEditMode(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    }
  };

  /* ── Download ── */
  const dlFile = (html: string, name = "matrix") => {
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = name + ".html";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Copy to clipboard ── */
  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  /* ── Image search (Picsum — no API key needed) ── */
  const searchImages = useCallback((q: string) => {
    const term = q.trim() || "abstract";
    setImgResults(
      Array.from({ length: 12 }, (_, i) =>
        "https://picsum.photos/seed/" + encodeURIComponent(term + i) + "/400/300"
      )
    );
  }, []);

  useEffect(() => {
    searchImages(imgSearch || "website");
  }, [imgSearch, searchImages]);

  /* ── Replace image in active HTML (simple string split/join) ── */
  const replaceImage = async (newSrc: string) => {
    if (!active || !selectedImgSrc) return;
    const updated = editedHtml.split(selectedImgSrc).join(newSrc);
    setEditedHtml(updated);
    setActive((prev) => (prev ? { ...prev, html: updated } : null));
    try {
      await updateDoc(doc(db, "generations", active.id), { html: updated });
      toast.success("Image replaced");
    } catch {
      /* silent */
    }
    setImgPanel(false);
    setSelectedImgSrc(null);
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const images = await Promise.all(Array.from(files).filter((file) => file.type.startsWith("image/")).map((file) => fileToImageDataUrl(file)));
      setLocalImages((prev) => [...images, ...prev].slice(0, 16));
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
      setLocalImages((prev) => [src, ...prev].slice(0, 16));
      setImagePrompt("");
      toast.success("Image generated");
    } catch (error: any) {
      toast.error(error?.message ?? "Image generation failed");
    } finally {
      setImageBusy(false);
    }
  };

  /* ── Regenerate with Codestral ── */
  const regen = async () => {
    if (!active) return;
    setRegenLoading(true);
    try {
      const result = await completeWebsiteAI([
        {
          role: "system",
          content: "You are MATRIX-AI. Output ONLY complete HTML starting with <!DOCTYPE html>. Use Tailwind CDN. Modern, responsive, beautiful.",
        },
        {
          role: "user",
          content: `Improve this existing page and output the FULL updated HTML only. Prompt: ${active.prompt}\n\nCurrent HTML:\n${editedHtml || active.html}`,
        },
      ], { prefer: "sambanova", timeoutMs: 90_000 });
      const html = ensureHTML(cleanHTML(result.content));
      if (html.length <= 80) throw new Error("AI returned an incomplete page");
      setEditedHtml(html);
      setActive((prev) => (prev ? { ...prev, html } : null));
      await updateDoc(doc(db, "generations", active.id), { html, updated_at: new Date().toISOString() });
      toast.success(`Regenerated with ${result.provider}`);
    } catch (e: any) {
      toast.error(e.message ?? "Regen failed");
    } finally {
      setRegenLoading(false);
    }
  };

  /* ── Filtered list ── */
  const filtered = items.filter(
    (g) =>
      !search ||
      g.prompt.toLowerCase().includes(search.toLowerCase()) ||
      (g.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const deviceSize: Record<Device, string> = {
    desktop: "w-full h-full",
    tablet:  "w-[768px] h-[1024px] mx-auto",
    mobile:  "w-[390px]  h-[844px]  mx-auto",
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="container pt-24 pb-20">
        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              <p className="font-mono text-xs text-primary tracking-widest uppercase">
                
              </p>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold">
              Your <span className="text-gradient">workspace</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {items.length} build{items.length !== 1 ? "s" : ""} &middot; real-time sync
            </p>
          </div>
          <Button variant="hero" onClick={() => navigate("/build")}>
            <Plus className="w-4 h-4" /> New build
          </Button>
        </div>

        {/* ── Search ── */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search builds..."
            className="pl-9 bg-muted/30"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total builds", value: items.length,                                                                                                    icon: Zap,           color: "text-primary"     },
            { label: "This week",    value: items.filter((i) => new Date(i.created_at) > new Date(Date.now() - 7 * 86_400_000)).length,                      icon: LayoutDashboard, color: "text-violet-400" },
            { label: "Today",        value: items.filter((i) => new Date(i.created_at).toDateString() === new Date().toDateString()).length,                  icon: Check,         color: "text-emerald-400" },
            { label: "Account",      value: user?.displayName?.split(" ")[0] ?? "You",                                                                       icon: MousePointer2, color: "text-orange-400"  },
          ].map((s) => (
            <div key={s.label} className="glass rounded-xl p-4 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-mono">{s.label}</p>
                <s.icon className={"w-4 h-4 " + s.color} />
              </div>
              <p className="text-2xl font-bold font-display">{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Build grid ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground font-mono">Loading your workspace…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-16 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg mb-1">
                {search ? "No results" : "No builds yet"}
              </p>
              <p className="text-muted-foreground text-sm">
                {search
                  ? "Try a different search term."
                  : "Build your first page and it will appear here."}
              </p>
            </div>
            {!search && (
              <Button variant="hero" onClick={() => navigate("/build")}>
                <Plus className="w-4 h-4" /> Start building
              </Button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((g) => (
              <div
                key={g.id}
                className="group glass rounded-2xl overflow-hidden hover:border-primary/50 transition-all hover:-translate-y-1 hover:shadow-elevated"
              >
                <button onClick={() => openItem(g)} className="block w-full text-left">
                  <div className="aspect-video bg-white relative overflow-hidden">
                    <iframe
                      title={g.id}
                      srcDoc={g.html}
                      className="w-[200%] h-[200%] origin-top-left scale-50 border-0 pointer-events-none"
                      sandbox=""
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                      <span className="text-xs font-mono text-white bg-black/60 px-3 py-1 rounded-full">
                        Open editor
                      </span>
                    </div>
                  </div>
                </button>
                <div className="p-4">
                  <p className="text-sm font-medium line-clamp-1 mb-1">
                    {g.title || g.prompt.slice(0, 45)}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mb-3">
                    {g.prompt}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {new Date(g.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openItem(g)} title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => dlFile(g.html, g.title ?? "matrix")} title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
                        onClick={() => remove(g.id)} title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ================================================================ */}
      {/*  Full-screen editor dialog                                        */}
      {/* ================================================================ */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-[95vw] w-full h-[92vh] p-0 overflow-hidden glass-strong flex flex-col">
          {/* Toolbar */}
          <DialogHeader className="px-4 py-3 border-b border-border/60 shrink-0">
            <DialogDescription className="sr-only">Preview, edit, regenerate, and save the selected generated website.</DialogDescription>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <DialogTitle className="font-mono text-xs text-muted-foreground truncate max-w-xs">
                {active?.prompt}
              </DialogTitle>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Device switcher */}
                <div className="flex glass rounded-lg p-0.5">
                  {(
                    [
                      ["desktop", Monitor  ],
                      ["tablet",  Tablet   ],
                      ["mobile",  Smartphone],
                    ] as [Device, typeof Monitor][]
                  ).map(([d, Icon]) => (
                    <button
                      key={d}
                      onClick={() => setDevice(d)}
                      aria-label={d}
                      className={
                        "p-1.5 rounded-md transition-colors " +
                        (device === d
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>

                {/* Preview / Code tab */}
                <div className="flex glass rounded-lg p-0.5">
                  {(["preview", "code"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={
                        "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors " +
                        (tab === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {t === "preview" ? <Eye className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Edit mode */}
                <Button
                  size="sm"
                  variant={editMode ? "default" : "outline"}
                  onClick={() => setEditMode((v) => !v)}
                  className="text-xs h-8"
                >
                  <MousePointer2 className="w-3 h-3 mr-1" />
                  {editMode ? "Editing" : "Edit"}
                </Button>

                {/* Image library */}
                <Button
                  size="sm" variant="outline"
                  onClick={() => setImgPanel(true)}
                  className="text-xs h-8"
                >
                  <ImageIcon className="w-3 h-3 mr-1" /> Images
                </Button>

                {/* Regenerate */}
                <Button
                  size="sm" variant="outline"
                  onClick={regen} disabled={regenLoading}
                  className="text-xs h-8"
                >
                  {regenLoading
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <RefreshCw className="w-3 h-3 mr-1" />}
                  Regen
                </Button>

                {/* Save edits */}
                {editMode && (
                  <Button
                    size="sm" onClick={saveEdits}
                    className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500"
                  >
                    <Check className="w-3 h-3 mr-1" /> Save
                  </Button>
                )}

                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyText(editedHtml)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => dlFile(editedHtml, active?.title ?? "matrix")}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Edit hint banner */}
            {editMode && tab === "preview" && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                <Type className="w-3.5 h-3.5 shrink-0" />
                Click any text to edit inline. Click images to swap them. Hit Save when done.
              </div>
            )}
          </DialogHeader>

          {/* Content area */}
          <div className="flex-1 overflow-hidden bg-zinc-950">
            {tab === "preview" ? (
              <div className="w-full h-full overflow-auto flex items-start justify-center p-4">
                <div
                  className={"bg-white rounded-xl overflow-hidden shadow-2xl transition-all duration-300 " + deviceSize[device]}
                  style={{ minHeight: "400px" }}
                >
                  <iframe
                    ref={iframeRef}
                    title="editor-preview"
                    srcDoc={editMode ? injectEditor(editedHtml) : editedHtml}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <textarea
                  value={editedHtml}
                  onChange={(e) => setEditedHtml(e.target.value)}
                  className="w-full h-full p-6 text-xs font-mono text-green-400 bg-transparent outline-none resize-none leading-relaxed"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/*  Image library dialog                                             */}
      {/* ================================================================ */}
      <Dialog open={imgPanel} onOpenChange={setImgPanel}>
        <DialogContent className="max-w-2xl glass-strong">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-primary" /> Image Library
            </DialogTitle>
            <DialogDescription>Upload local images, generate realistic images, then copy or replace images in your page.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-5 cursor-pointer hover:border-primary/60 transition-colors">
              <Upload className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">Upload local images</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadImages(e.target.files)} />
            </label>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Generate a realistic image, e.g. luxury SaaS dashboard hero photo…" className="min-h-20 bg-muted/30" />
              <Button onClick={generateImageAsset} disabled={imageBusy || !imagePrompt.trim()} className="self-end">
                {imageBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate
              </Button>
            </div>

            {localImages.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto scrollbar-thin">
                {localImages.map((src, i) => (
                  <button key={i} onClick={() => (selectedImgSrc ? replaceImage(src) : copyText(src))} className="aspect-square rounded-lg overflow-hidden border border-border/50 hover:border-primary/60 transition-all group relative">
                    <img src={src} alt={`Local image ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            {/* Category chips */}
            <div className="flex flex-wrap gap-2">
              {IMG_CATS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => setImgSearch(c.q)}
                  className={
                    "text-xs px-3 py-1.5 rounded-full transition-colors " +
                    (imgSearch === c.q
                      ? "bg-primary text-primary-foreground"
                      : "glass hover:border-primary/50 text-muted-foreground hover:text-foreground")
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={imgSearch}
                onChange={(e) => setImgSearch(e.target.value)}
                placeholder="Search images (e.g. coffee shop, tech startup)…"
                className="pl-9 bg-muted/30"
              />
            </div>

            {/* Image grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto scrollbar-thin">
              {imgResults.map((src, i) => (
                <button
                  key={i}
                  onClick={() => (selectedImgSrc ? replaceImage(src) : copyText(src))}
                  className="aspect-square rounded-lg overflow-hidden border border-border/50 hover:border-primary/60 transition-all hover:scale-105 group relative"
                >
                  <img
                    src={src}
                    alt={"img " + i}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {selectedImgSrc ? (
                      <span className="text-xs text-white font-semibold bg-black/60 px-2 py-0.5 rounded">
                        Replace
                      </span>
                    ) : (
                      <Copy className="w-4 h-4 text-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selectedImgSrc && (
              <p className="text-xs text-amber-400 font-mono">
                Click any image above to replace the selected image in your page.
              </p>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Palette className="w-3.5 h-3.5" />
              Images from Picsum Photos · Click to copy URL or replace in your page
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
