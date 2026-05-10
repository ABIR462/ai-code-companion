import { useRef, useEffect } from "react";
import { PromptComposer, type Attachment } from "./PromptComposer";
import { Zap, Shield, Sparkles } from "lucide-react";

const FLOATING_WORDS = ["Landing Page", "Dashboard", "Portfolio", "Store", "Blog", "SaaS App"];

export function Hero({
  onSubmit,
  loading,
}: {
  onSubmit: (p: string, attachments?: Attachment[]) => void;
  loading: boolean;
}) {
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let frame: number;
    let x = 0;
    const speed = 0.4;
    const animate = () => {
      x -= speed;
      if (x <= -el.scrollWidth / 2) x = 0;
      el.style.transform = `translateX(${x}px)`;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section id="top" className="relative min-h-[92svh] flex flex-col items-center justify-center overflow-hidden pt-16 sm:pt-20">
      {/* Layered background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 grid-bg opacity-20 [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_30%,transparent_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-accent/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-primary/8 rounded-full blur-[80px] pointer-events-none" />

      {/* Floating orbs */}
      <div className="absolute top-32 left-16 w-3 h-3 rounded-full bg-primary/60 animate-float blur-[1px]" />
      <div className="absolute top-48 right-24 w-2 h-2 rounded-full bg-accent/80 animate-float" style={{ animationDelay: "1s" }} />
      <div className="absolute bottom-40 left-32 w-2 h-2 rounded-full bg-primary/50 animate-float" style={{ animationDelay: "2s" }} />
      <div className="absolute bottom-32 right-20 w-4 h-4 rounded-full bg-accent/40 animate-float blur-[2px]" style={{ animationDelay: "0.5s" }} />

      <div className="container relative max-w-3xl text-center px-4 py-10 sm:py-16">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass border border-primary/30 text-[11px] sm:text-xs text-primary font-mono mb-6 sm:mb-8 animate-fade-up">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Powered by Matrixbook AI
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0.5s" }} />
        </div>

        {/* Headline */}
        <h1 className="font-display text-[42px] leading-[0.98] sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-5 sm:mb-6 animate-fade-up tracking-tight">
          Turn prompts into
          <br />
          <span className="text-gradient-brand">websites.</span>
          <br />
          <span className="text-foreground/40 text-[28px] sm:text-5xl md:text-6xl font-normal">instantly.</span>
        </h1>

        <p className="text-[13px] sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-7 sm:mb-10 animate-fade-up leading-relaxed">
          Describe any web page in plain English. Matrixbook generates beautiful,
          production-ready HTML, crafts images in Supernova, and connects you with
          a realtime creator community — no code required.
        </p>

        {/* Prompt composer */}
        <div id="builder" className="max-w-2xl mx-auto animate-fade-up mb-8 sm:mb-10">
          <PromptComposer
            onSubmit={(prompt, attachments) => onSubmit(prompt, attachments)}
            loading={loading}
          />
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 animate-fade-up">
          {[
            { icon: Zap,      label: "Generates in seconds"   },
            { icon: Shield,   label: "Firebase secured"       },
            { icon: Sparkles, label: "Visual editor included" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground">
              <Icon className="w-3.5 h-3.5 text-primary" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Scrolling ticker */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden border-t border-border/30 py-3 bg-background/50 backdrop-blur-sm">
        <div ref={tickerRef} className="flex gap-8 whitespace-nowrap will-change-transform">
          {[...FLOATING_WORDS, ...FLOATING_WORDS, ...FLOATING_WORDS, ...FLOATING_WORDS].map((w, i) => (
            <span key={i} className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest">
              ✦ {w}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
