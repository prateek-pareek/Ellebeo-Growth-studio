import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { GoogleIcon } from "@/components/GoogleIcon";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Elle.Be.O Growth" },
      { name: "description", content: "Access your Elle.Be.O Growth account to manage your AI-powered brand." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseIdToken = await result.user.getIdToken();
      const res = await api.post('/auth/google', { firebaseIdToken });
      const { accessToken } = res.data.data ?? res.data;
      login(accessToken);
      toast.success("Welcome back.");
      navigate({ to: "/" });
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error(error.response?.data?.message || "Google sign-in failed. Try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken } = res.data.data;
      login(accessToken);
      toast.success("Welcome back.");
      navigate({ to: "/" });
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Visual Side */}
      <div className="hidden lg:flex relative bg-card items-center justify-center overflow-hidden border-r hairline">
        <div className="absolute inset-0 bg-gradient-to-tr from-taupe/10 via-transparent to-nude/20" />
        <div className="relative z-10 max-w-md p-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <p className="eyebrow mb-6">Welcome Back</p>
            <h2 className="font-serif text-5xl leading-tight mb-8">
              Your brand is <span className="italic">waiting</span> for you.
            </h2>
            <p className="text-taupe leading-relaxed">
              Continue your work on the intelligence layer. Your content queue and brand DNA are ready for refinement.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex items-center justify-center p-8 sm:p-12 lg:p-20">
        <motion.div 
          className="w-full max-w-sm space-y-10"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="space-y-3">
            <Link to="/" className="text-[10px] uppercase tracking-[0.4em] text-taupe hover:text-foreground transition-colors">
              Elle.Be.O Growth
            </Link>
            <h1 className="font-serif text-4xl tracking-tight">Sign in</h1>
            <p className="text-sm text-taupe leading-relaxed">
              Enter your details below to access your studio dashboard.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] uppercase tracking-widest text-taupe">Email Address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="hello@example.com"
                className="bg-transparent border-t-0 border-x-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <Label htmlFor="password" className="text-[10px] uppercase tracking-widest text-taupe">Password</Label>
                <Link to="/auth" className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors mb-0.5">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="bg-transparent border-t-0 border-x-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-foreground text-background hover:bg-taupe transition-colors py-6 rounded-none text-[11px] uppercase tracking-[0.2em]"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Access Dashboard"}
            </Button>
          </form>

          <div className="space-y-4">
            <div className="relative flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] uppercase tracking-widest text-taupe">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full bg-transparent border hairline text-foreground hover:bg-card py-6 rounded-none text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3"
            >
              <GoogleIcon />
              {googleLoading ? "Signing in…" : "Continue with Google"}
            </Button>
          </div>

          <div className="pt-4 border-t hairline flex flex-col gap-4">
            <p className="text-xs text-taupe">
              Don't have an account yet?{" "}
              <Link to="/signup" className="text-foreground hover:underline underline-offset-4">Create one</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
