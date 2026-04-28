import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Templates } from "@/components/Templates";
import { HowItWorks } from "@/components/HowItWorks";
import { Brand } from "@/components/Brand";
import type { Template } from "@/lib/templates";
import { Github, Twitter } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  const start = (prompt: string) => {
    if (!prompt.trim()) return;
    navigate("/build", { state: { prompt } });
  };

  const pickTemplate = (t: Template) => start(t.prompt);

  useEffect(() => {
    document.title = "Matrix AI — Build websites from a single prompt";
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Hero onSubmit={start} loading={false} />
        <Features />
        <Templates onPick={pickTemplate} />
        <HowItWorks />
      </main>

      {/* Footer */}
      <footer className="relative border-t border-border/40 py-14 mt-10 overflow-hidden">
        <div className="absolute inset-0 bg-background/95" />
        <div className="container relative">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            {/* Brand col */}
            <div className="md:col-span-2">
              <Brand size={36} />
              <p className="text-sm text-muted-foreground mt-4 max-w-xs leading-relaxed">
                The AI-powered web builder that turns plain English into beautiful,
                production-ready websites in seconds.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg glass flex items-center justify-center hover:border-primary/50 transition-colors"
                  aria-label="GitHub"
                >
                  <Github className="w-4 h-4" />
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg glass flex items-center justify-center hover:border-primary/50 transition-colors"
                  aria-label="Twitter"
                >
                  <Twitter className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Product links */}
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Product</p>
              <ul className="space-y-2.5">
                {[
                  { label: "Templates", href: "/#templates" },
                  { label: "How it works", href: "/#how" },
                  { label: "Features", href: "/#features" },
                ].map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Account links */}
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Account</p>
              <ul className="space-y-2.5">
                {[
                  { label: "Sign in", href: "/auth" },
                  { label: "Create account", href: "/auth?mode=signup" },
                  { label: "Dashboard", href: "/dashboard" },
                ].map((l) => (
                  <li key={l.label}>
                    <Link to={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-border/40">
            <p className="text-xs text-muted-foreground font-mono">
              © 2026 Matrix AI · Built by ABIR KAYAL
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                All systems operational
              </span>
              <span>v2.0 · production</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
