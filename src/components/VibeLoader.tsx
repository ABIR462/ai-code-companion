import { Loader2, Sparkles } from "lucide-react";

export function VibeLoader() {
  return (
    <div className="flex flex-col items-center gap-4 text-center px-6">
      <div className="relative h-16 w-16 rounded-2xl border border-white/10 bg-white/5 grid place-items-center shadow-2xl shadow-blue-500/10">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-cyan-300" />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-mono uppercase tracking-[0.24em] text-blue-200">Building preview</p>
        <p className="text-xs text-white/45 max-w-xs">DeepSeek is writing one complete HTML file. Preview opens automatically when it finishes.</p>
      </div>
      <div className="h-1 w-44 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-blue-400" />
      </div>
    </div>
  );
}