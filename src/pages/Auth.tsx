import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  Eye,
  EyeOff,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { Brand } from "@/components/Brand";
import { firebaseMissingEnvKeys } from "@/lib/env";

export default function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const from = params.get("from") || "/";

  useEffect(() => {
    document.title =
      mode === "signup"
        ? "Create your MATRIX-AI account"
        : "Sign in to MATRIX-AI";
  }, [mode]);

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (firebaseMissingEnvKeys.length > 0) {
      toast.error(`Missing Firebase .env values: ${firebaseMissingEnvKeys.join(", ")}`);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, {
          displayName: name || email.split("@")[0],
        });
        toast.success("Welcome to MATRIX-AI ✨");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Welcome back");
      }
    } catch (err: any) {
      const msg =
        err?.code === "auth/user-not-found" || err?.code === "auth/wrong-password"
          ? "Invalid email or password"
          : err?.code === "auth/email-already-in-use"
          ? "Email already in use"
          : err?.code === "auth/weak-password"
          ? "Password must be at least 6 characters"
          : err?.message ?? "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    if (firebaseMissingEnvKeys.length > 0) {
      toast.error(`Missing Firebase .env values: ${firebaseMissingEnvKeys.join(", ")}`);
      return;
    }
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success("Signed in with Google");
    } catch (err: any) {
      const code = err?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // user cancelled — silent
      } else if (code === "auth/unauthorized-domain") {
        toast.error(
          `Add "${window.location.hostname}" to Firebase → Authentication → Settings → Authorized domains`,
          { duration: 8000 },
        );
      } else if (code === "auth/popup-blocked") {
        toast.error("Popup blocked — allow popups for this site");
      } else {
        toast.error(err?.message ?? "Google sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-stretch bg-background">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex flex-col justify-between flex-1 relative overflow-hidden p-12 border-r border-border/50">
        <div className="absolute inset-0 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        <div className="absolute -top-40 -left-20 w-[500px] h-[500px] bg-primary/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-primary-glow/20 rounded-full blur-3xl" />

        <Link to="/" className="relative z-10">
          <Brand />
        </Link>

        <div className="relative z-10 max-w-md">
          <p className="font-mono text-xs text-primary mb-4 tracking-widest">
          
          </p>
          <h2 className="font-display text-5xl font-bold leading-tight mb-6">
            Ship apps at the{" "}
            <span className="font-brand text-gradient-brand">
              speed of thought.
            </span>
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Describe it. MATRIX-AI builds it. Beautiful, working,
            production-ready code in seconds.
          </p>

          <div className="mt-10 space-y-4">
            {[
              "AI-generated landing pages and components",
              "Premium templates with real Freepik imagery",
              "Live preview, code, and one-click export",
            ].map((line) => (
              <div
                key={line}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                  <Sparkles className="w-3 h-3 text-primary-foreground" />
                </div>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-muted-foreground font-mono">
          © 2026 MATRIX-AI
        </p>
      </div>

      {/* ── Form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative">
        {/* Mobile brand */}
        <div className="absolute top-6 left-6 lg:hidden">
          <Link to="/">
            <Brand />
          </Link>
        </div>

        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {mode === "signup" ? "New account" : "Welcome back"}
            </div>
            <h1 className="font-display text-3xl font-bold mb-2">
              {mode === "signup" ? "Create your account" : "Sign in"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {mode === "signup"
                ? "Start building in under 30 seconds."
                : "Sign in to keep building."}
            </p>
          </div>

          {/* Google button */}
          <Button
            variant="outline"
            size="lg"
            className="w-full glass border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
            onClick={onGoogle}
            disabled={loading}
          >
            <svg className="w-4 h-4 mr-2 shrink-0" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="group-hover:text-foreground transition-colors">
              Continue with Google
            </span>
          </Button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-mono px-1">
              OR
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email/password form */}
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium">
                  Name
                </Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="pl-9 bg-muted/30 border-border/60 focus:border-primary/60 transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@matrix.ai"
                  className="pl-9 bg-muted/30 border-border/60 focus:border-primary/60 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline font-mono"
                    onClick={() =>
                      toast.info("Password reset coming soon")
                    }
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10 bg-muted/30 border-border/60 focus:border-primary/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === "signup" ? "Create account" : "Sign in"}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-6">
            {mode === "signup"
              ? "Already have an account?"
              : "New to MATRIX-AI?"}{" "}
            <button
              onClick={() =>
                setMode(mode === "signup" ? "signin" : "signup")
              }
              className="text-primary hover:underline font-medium"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>

          <p className="text-[11px] text-center text-muted-foreground/60 mt-4 font-mono">
            Secured by Firebase Authentication
          </p>
        </div>
      </div>
    </div>
  );
}
