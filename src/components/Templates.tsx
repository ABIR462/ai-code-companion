import { TEMPLATES, type Template } from "@/lib/templates";
import { ArrowUpRight, Zap } from "lucide-react";

export function Templates({ onPick }: { onPick: (t: Template) => void }) {
  return (
    <section id="templates" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 bg-background/95" />
      <div className="absolute inset-0 grid-bg opacity-10" />

      <div className="container px-4 relative">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div className="max-w-xl">
            <p className="font-mono text-xs text-primary tracking-widest uppercase mb-4"></p>
            <h2 className="font-display text-4xl md:text-6xl font-bold leading-tight mb-4">
              Start from a
              <br />
              <span className="text-gradient-brand">vibe.</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Curated prompts that produce gorgeous, working pages. One click to remix and make it yours.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground glass px-4 py-2 rounded-full border border-border/50 shrink-0">
            <Zap className="w-3.5 h-3.5 text-primary" />
            {TEMPLATES.length} templates ready
          </div>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TEMPLATES.map((t, i) => (
            <button
              key={t.id}
              onClick={() => onPick(t)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group text-left glass rounded-2xl overflow-hidden hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-elevated animate-fade-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {/* Image */}
              <div className="aspect-[16/10] relative overflow-hidden bg-muted">
                <img
                  src={t.image}
                  alt={t.title}
                  loading="lazy"
                  width={800}
                  height={500}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                {/* Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient} opacity-0 group-hover:opacity-30 transition-opacity duration-500 mix-blend-overlay`} />

                {/* Tag */}
                <span className="absolute top-3 left-3 text-[10px] font-mono uppercase tracking-wider text-foreground/90 px-2.5 py-1 rounded-full glass-strong border border-white/10">
                  {t.tag}
                </span>

                {/* Hover CTA */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-glow">
                    <Zap className="w-3.5 h-3.5" /> Build this
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-display font-semibold text-base group-hover:text-primary transition-colors">{t.title}</h3>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
