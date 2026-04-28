import { MessageSquare, Wand2, MousePointer2, Rocket } from "lucide-react";

const STEPS = [
  {
    icon: MessageSquare,
    number: "01",
    title: "Describe it",
    body: "Type what you want in plain English. A landing page, a store, a portfolio — any idea works.",
    color: "from-blue-500/20 to-cyan-500/20",
    border: "border-blue-500/30",
    iconColor: "text-blue-400",
  },
  {
    icon: Wand2,
    number: "02",
    title: "AI builds it",
    body: "Codestral generates a complete, styled, responsive HTML page with real images and clean code.",
    color: "from-violet-500/20 to-purple-500/20",
    border: "border-violet-500/30",
    iconColor: "text-violet-400",
  },
  {
    icon: MousePointer2,
    number: "03",
    title: "Edit visually",
    body: "Click any element in the live preview to edit text, colors, and layout — no code needed.",
    color: "from-emerald-500/20 to-teal-500/20",
    border: "border-emerald-500/30",
    iconColor: "text-emerald-400",
  },
  {
    icon: Rocket,
    number: "04",
    title: "Ship it",
    body: "Download the HTML, copy the code, or save to your dashboard. Production-ready in seconds.",
    color: "from-orange-500/20 to-amber-500/20",
    border: "border-orange-500/30",
    iconColor: "text-orange-400",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 grid-bg opacity-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />

      <div className="container px-4 relative">
        {/* Header */}
        <div className="max-w-2xl mb-20">
          <p className="font-mono text-xs text-primary tracking-widest uppercase mb-4"></p>
          <h2 className="font-display text-4xl md:text-6xl font-bold leading-tight mb-5">
            From idea to website
            <br />
            <span className="text-gradient">in four steps.</span>
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            No design skills. No coding. Just describe what you want and watch it come to life.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className={`relative group glass rounded-2xl p-6 border ${step.border} hover:shadow-elevated transition-all duration-300 hover:-translate-y-1`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {/* Gradient bg */}
              <div className={`absolute inset-0 bg-gradient-to-br ${step.color} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

              <div className="relative z-10">
                {/* Number */}
                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-4xl font-bold text-foreground/10 group-hover:text-foreground/20 transition-colors">
                    {step.number}
                  </span>
                  <div className={`w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center border ${step.border}`}>
                    <step.icon className={`w-5 h-5 ${step.iconColor}`} />
                  </div>
                </div>

                <h3 className="font-display text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>

              {/* Connector line (not on last) */}
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-border z-20" />
              )}
            </div>
          ))}
        </div>

        {/* Bottom CTA strip */}
        <div className="mt-20 glass rounded-2xl p-8 md:p-12 text-center border border-primary/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5" />
          <div className="relative z-10">
            <p className="font-mono text-xs text-primary tracking-widest uppercase mb-3"></p>
            <h3 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Your next website is one prompt away.
            </h3>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Join thousands of creators building faster with Matrix AI.
            </p>
            <a
              href="#builder"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-glow"
            >
              <Wand2 className="w-4 h-4" />
              Start building free
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
