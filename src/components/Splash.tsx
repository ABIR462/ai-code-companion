import { useEffect, useState } from "react";
import logo from "@/assets/logo.png";

export function Splash({ onDone }: { onDone: () => void }) {
  const [exit, setExit] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setExit(true), 1700);
    const t2 = setTimeout(onDone, 5200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background overflow-hidden transition-opacity duration-500 ${exit ? "opacity-0" : "opacity-100"}`}
    >
      <div className="absolute inset-0 grid-bg opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-radial" />

      <div className="relative flex flex-col items-center gap-6 animate-fade-up">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-primary blur-3xl opacity-60 animate-pulse-glow rounded-full" />
          <img
            src={logo}
            alt="MATRIX-AI"
            width={120}
            height={120}
            className="relative w-28 h-28 object-contain drop-shadow-[0_0_30px_hsl(215_100%_55%/0.6)] animate-float"
          />
        </div>
        <div className="text-center">
          <h1 className="font-brand text-5xl md:text-6xl text-gradient-brand leading-none">
            Matrix&nbsp;AI
          </h1>
          <p className="font-mono text-[10px] md:text-xs text-muted-foreground mt-3 tracking-[0.3em] uppercase">
            Vibe coding · reimagined
          </p>
        </div>
        <div className="mt-4 w-40 h-0.5 bg-muted overflow-hidden rounded-full">
          <div className="h-full bg-gradient-primary animate-[shimmer_1.6s_ease-out_forwards] origin-left" style={{ animation: "loadbar 1.6s cubic-bezier(0.22,1,0.36,1) forwards" }} />
        </div>
      </div>

      <style>{`
        @keyframes loadbar { from { width: 0% } to { width: 100% } }
      `}</style>
    </div>
  );
}