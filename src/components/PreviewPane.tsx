import { useState } from "react";
import { Code2, Eye, Loader2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PreviewPane({
  html,
  loading,
  prompt,
  onClose,
}: {
  html: string;
  loading: boolean;
  prompt: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vibe-app.html";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(html);
    toast.success("Code copied");
  };

  return (
    <section className="container py-10">
      <div className="glass rounded-2xl overflow-hidden shadow-elevated">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex gap-1.5 shrink-0">
              <span className="w-3 h-3 rounded-full bg-destructive/70" />
              <span className="w-3 h-3 rounded-full bg-amber-500/70" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
            </div>
            <p className="text-sm text-muted-foreground truncate font-mono">
              {prompt || "vibe-preview"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex glass rounded-lg p-0.5">
              <button
                onClick={() => setTab("preview")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Preview
              </button>
              <button
                onClick={() => setTab("code")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="w-3.5 h-3.5" /> Code
              </button>
            </div>
            <Button variant="ghost" size="icon" onClick={download} disabled={!html}>
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="relative bg-black h-[70vh]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-background/80 backdrop-blur">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-primary blur-xl opacity-60 animate-pulse-glow" />
                <Loader2 className="w-8 h-8 text-primary animate-spin absolute inset-0 m-auto" />
              </div>
              <p className="text-sm text-muted-foreground font-mono">Generating your vibe...</p>
            </div>
          )}

          {tab === "preview" ? (
            <iframe
              title="preview"
              srcDoc={html}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts"
            />
          ) : (
            <div className="h-full overflow-auto">
              <pre className="p-6 text-xs text-foreground/90 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {html || "// Code will appear here once generated."}
              </pre>
              {html && (
                <button
                  onClick={copy}
                  className="fixed-bottom absolute bottom-4 right-4 glass px-3 py-1.5 rounded-md text-xs hover:border-primary"
                >
                  Copy
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}