import { useRef, useState, useCallback, useEffect } from "react";
import {
  Sparkles, Loader2, ArrowUp, Paperclip, X,
  Image as ImageIcon, FileText, Code2, Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
export type Attachment = {
  id: string;
  name: string;
  type: "image" | "file";
  dataUrl: string;
  size: number;
};

/* ------------------------------------------------------------------ */
/*  Suggestion chips                                                    */
/* ------------------------------------------------------------------ */
const SUGGESTIONS = [
  { label: "SaaS landing page",        icon: Zap,      prompt: "A premium dark SaaS landing page with hero, features grid, pricing tiers, and CTA. Modern glassmorphism style." },
  { label: "Portfolio site",           icon: Sparkles, prompt: "An editorial designer portfolio with oversized typography, case study grid, about section, and contact form." },
  { label: "E-commerce store",         icon: ImageIcon, prompt: "A boutique e-commerce product page with hero image, feature highlights, reviews, and add-to-cart CTA." },
  { label: "Dashboard UI",             icon: Code2,    prompt: "A modern analytics dashboard with sidebar nav, stat cards, charts, and a data table. Dark theme." },
  { label: "Pricing page",             icon: Zap,      prompt: "A pricing page with 3 tiers (Free, Pro, Enterprise), feature comparison table, and FAQ accordion." },
  { label: "Blog homepage",            icon: FileText, prompt: "An editorial magazine-style blog homepage with featured article, post grid, and newsletter signup." },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */
export function PromptComposer({
  onSubmit,
  loading,
  defaultValue = "",
  size = "hero",
}: {
  onSubmit: (prompt: string, attachments: Attachment[]) => void;
  loading: boolean;
  defaultValue?: string;
  size?: "hero" | "compact";
}) {
  const [value, setValue]               = useState(defaultValue);
  const [attachments, setAttachments]   = useState<Attachment[]>([]);
  const [dragOver, setDragOver]         = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  /* Hide suggestions once user starts typing */
  useEffect(() => {
    if (value.trim()) setShowSuggestions(false);
  }, [value]);

  /* ── Submit ── */
  const submit = useCallback(() => {
    if ((!value.trim() && attachments.length === 0) || loading) return;
    onSubmit(value.trim(), attachments);
    setValue("");
    setAttachments([]);
    setShowSuggestions(false);
  }, [value, attachments, loading, onSubmit]);

  /* ── Process dropped / selected files ── */
  const processFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 5); // max 5 attachments
    arr.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        // skip files > 10 MB
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setAttachments((prev) => [
          ...prev,
          {
            id: uid(),
            name: file.name,
            type: file.type.startsWith("image/") ? "image" : "file",
            dataUrl,
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  /* ── Drag & drop ── */
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  };

  /* ── Paste images ── */
  const onPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((i) => i.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
    processFiles(files);
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !loading;
  const charCount = value.length;
  const maxChars  = 2000;

  /* ---------------------------------------------------------------- */
  return (
    <div className="w-full">
      {/* ── Outer glow wrapper ── */}
      <div
        className={`relative group transition-all duration-300 ${dragOver ? "scale-[1.01]" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* Animated glow border */}
        <div
          className={`absolute -inset-px rounded-2xl transition-opacity duration-300 pointer-events-none
            bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%]
            ${dragOver ? "opacity-100 animate-[shimmer_1.5s_linear_infinite]" : "opacity-0 group-focus-within:opacity-70"}
          `}
        />

        {/* Main card */}
        <div
          className={`relative rounded-2xl border transition-all duration-200
            ${dragOver
              ? "border-primary/80 bg-primary/5"
              : "border-border/60 bg-card/80 group-focus-within:border-primary/50"}
            backdrop-blur-xl shadow-soft
          `}
        >
          {/* ── Attachment previews ── */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative flex items-center gap-2 glass rounded-xl px-2 py-1.5 border border-border/50 group/att max-w-[180px]"
                >
                  {att.type === "image" ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0 border border-border/40"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{att.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</p>
                  </div>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                    aria-label="Remove attachment"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Textarea row ── */}
          <div className="flex items-start gap-2 px-4 pt-3 pb-2">
            {/* Sparkles icon — desktop only */}
            <Sparkles className="hidden sm:block w-4 h-4 text-primary/70 mt-3 shrink-0" />

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
                  // Enter alone submits on desktop; Shift+Enter = newline
                  if (window.innerWidth >= 640) {
                    e.preventDefault();
                    submit();
                  }
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              onPaste={onPaste}
              placeholder={
                size === "hero"
                  ? "Describe the website you want to build… or drop an image"
                  : "Describe what to build…"
              }
              rows={1}
              maxLength={maxChars}
              className="flex-1 bg-transparent outline-none resize-none text-sm sm:text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 min-h-[44px] max-h-[200px] py-2"
              aria-label="Prompt input"
            />
          </div>

          {/* ── Bottom toolbar ── */}
          <div className="flex items-center justify-between px-3 pb-3 gap-2">
            {/* Left: attach + char count */}
            <div className="flex items-center gap-1">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.html,.css,.js,.ts,.json"
                className="hidden"
                onChange={(e) => e.target.files && processFiles(e.target.files)}
              />

              {/* Attach button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-medium"
                title="Attach image or file"
                aria-label="Attach file"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Attach</span>
              </button>

              {/* Image-only shortcut */}
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "image/*";
                    fileInputRef.current.click();
                    fileInputRef.current.accept = "image/*,.pdf,.txt,.md,.html,.css,.js,.ts,.json";
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-medium"
                title="Attach image"
                aria-label="Attach image"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Image</span>
              </button>

              {/* Char count — only show when getting close */}
              {charCount > maxChars * 0.7 && (
                <span
                  className={`text-[10px] font-mono ml-1 transition-colors ${
                    charCount >= maxChars ? "text-destructive" : "text-muted-foreground/60"
                  }`}
                >
                  {charCount}/{maxChars}
                </span>
              )}
            </div>

            {/* Right: keyboard hint + submit */}
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground/40 font-mono select-none">
                <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border/40">↵</kbd>
                to send
              </span>

              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 shrink-0
                  ${canSubmit
                    ? "bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 hover:scale-105 active:scale-95"
                    : "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                  }`}
                aria-label="Submit"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ArrowUp className="w-4 h-4" />
                }
              </button>
            </div>
          </div>

          {/* Drag overlay */}
          {dragOver && (
            <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2 bg-primary/5 border-2 border-dashed border-primary/60 pointer-events-none">
              <Paperclip className="w-6 h-6 text-primary animate-bounce" />
              <p className="text-sm font-medium text-primary">Drop files here</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Suggestion chips ── */}
      {size === "hero" && showSuggestions && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setValue(s.prompt);
                  setShowSuggestions(false);
                  textareaRef.current?.focus();
                }}
                className="group flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full
                  glass border border-border/50 hover:border-primary/50
                  text-muted-foreground hover:text-foreground
                  transition-all duration-200 hover:-translate-y-0.5"
              >
                <s.icon className="w-3 h-3 text-primary/70 group-hover:text-primary transition-colors" />
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground/40 font-mono mt-3">
            or paste an image · drag &amp; drop files · ↵ to send
          </p>
        </div>
      )}
    </div>
  );
}
