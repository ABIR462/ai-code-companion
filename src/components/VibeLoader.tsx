import logo from "@/assets/logo.png";

export function VibeLoader() {
  return (
    <div className="flex flex-col items-center gap-5 text-center px-6 py-4">
      <div className="relative grid place-items-center">
        <span
          className="absolute inset-[-14px] rounded-[28px] opacity-80"
          style={{
            background: "conic-gradient(from 0deg, #38bdf8, #a78bfa, #f472b6, #38bdf8)",
            animation: "matrix-orbit 2.8s linear infinite",
          }}
        />
        <span className="absolute inset-[-10px] rounded-[24px] bg-[#0a0a0a]" />
        <div className="relative h-[72px] w-[72px] rounded-2xl border border-white/15 bg-gradient-to-br from-white/[0.08] to-white/[0.02] shadow-[0_0_60px_rgba(56,189,248,0.25)] grid place-items-center overflow-hidden">
          <img src={logo} alt="" className="h-11 w-11 object-contain relative z-10" draggable={false} />
          <span
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)",
              backgroundSize: "200% 100%",
              animation: "matrix-shimmer 1.6s ease-in-out infinite",
            }}
          />
        </div>
      </div>
      <div className="space-y-1.5 max-w-xs">
        <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-sky-200/90">Matrix AI · streaming</p>
        <p className="text-xs text-white/50 leading-relaxed">
          Codestral is composing your preview. The live page refreshes as soon as the stream finishes.
        </p>
      </div>
      <div className="flex flex-col items-center gap-2 w-full max-w-[220px]">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-fuchsia-400"
            style={{
              width: "38%",
              animation: "matrix-bar 1.25s ease-in-out infinite alternate",
            }}
          />
        </div>
        <p className="text-[10px] font-mono text-white/35">token stream active</p>
      </div>
      <style>{`
        @keyframes matrix-orbit { to { transform: rotate(360deg); } }
        @keyframes matrix-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes matrix-bar { 0% { transform: translateX(-90%); width: 32%; } 100% { transform: translateX(120%); width: 55%; } }
      `}</style>
    </div>
  );
}
