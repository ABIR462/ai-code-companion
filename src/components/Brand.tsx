import logo from "@/assets/logo.png";

export function Brand({
  size = 32,
  showWord = true,
  wordSize = "md",
}: {
  size?: number;
  showWord?: boolean;
  wordSize?: "sm" | "md" | "lg" | "xl";
}) {
  const sizeClass =
    wordSize === "xl" ? "text-5xl md:text-6xl"
    : wordSize === "lg" ? "text-3xl"
    : wordSize === "sm" ? "text-base"
    : "text-2xl";

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <span className="absolute inset-0 bg-gradient-primary rounded-lg blur-md opacity-50" />
        <img src={logo} alt="MATRIX-AI" width={size} height={size} className="relative object-contain" />
      </span>
      {showWord && (
        <span className={`font-brand ${sizeClass} text-gradient-brand leading-none pb-1`}>
          Matrix&nbsp;AI
        </span>
      )}
    </span>
  );
}