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

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Account — Elle.Be.O Growth" },
      { name: "description", content: "Join Elle.Be.O Growth and start building your brand identity with AI." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignUp() {
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseIdToken = await result.user.getIdToken();
      const res = await api.post('/auth/google', { firebaseIdToken });
      const { accessToken } = res.data.data ?? res.data;
      login(accessToken);
      toast.success("Account created. Welcome to Elle.Be.O.");
      navigate({ to: "/brand/onboarding" });
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error(error.response?.data?.message || "Google sign-up failed. Try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }
  
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Register the user
      await api.post('/auth/register', { 
        email, 
        password, 
        businessName, 
        timezone 
      });
      
      // Auto-login after registration
      const loginRes = await api.post('/auth/login', { email, password });
      const { accessToken } = loginRes.data.data;
      
      login(accessToken);
      toast.success("Account created. Welcome to Elle.Be.O.");
      navigate({ to: "/brand/onboarding" });
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Visual Side */}
      <div className="hidden lg:flex relative bg-card items-center justify-center overflow-hidden border-r hairline">
        <div className="absolute inset-0 bg-gradient-to-br from-nude/20 via-transparent to-taupe/10" />
        <div className="relative z-10 max-w-md p-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <p className="eyebrow mb-6">The Intelligence Layer</p>
            <h2 className="font-serif text-5xl leading-tight mb-8">
              Build a brand that <span className="italic">feels</span> like you.
            </h2>
            <p className="text-taupe leading-relaxed">
              Elle.Be.O Growth uses AI to capture your unique voice, style, and goals, turning your expertise into a living Brand DNA.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex items-center justify-center p-8 sm:p-12 lg:p-20">
        <motion.div 
          className="w-full max-w-sm space-y-10"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="space-y-3">
            <Link to="/" className="text-[10px] uppercase tracking-[0.4em] text-taupe hover:text-foreground transition-colors">
              Elle.Be.O Growth
            </Link>
            <h1 className="font-serif text-4xl tracking-tight">Create your account</h1>
            <p className="text-sm text-taupe leading-relaxed">
              Start your journey toward a more intelligent, automated brand presence.
            </p>
          </div>

          <form onSubmit={handleSignUp} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="business-name" className="text-[10px] uppercase tracking-widest text-taupe">Business Name</Label>
              <Input
                id="business-name"
                type="text"
                placeholder="e.g. Noir Aesthetics"
                className="bg-transparent border-t-0 border-x-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground transition-all"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>

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
              <Label htmlFor="password" className="text-[10px] uppercase tracking-widest text-taupe">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className="bg-transparent border-t-0 border-x-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-foreground text-background hover:bg-taupe transition-colors py-6 rounded-none text-[11px] uppercase tracking-[0.2em]"
              disabled={loading}
            >
              {loading ? "Creating Account…" : "Get Started"}
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
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
              className="w-full bg-transparent border hairline text-foreground hover:bg-card py-6 rounded-none text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3"
            >
              <GoogleIcon />
              {googleLoading ? "Connecting…" : "Continue with Google"}
            </Button>
          </div>

          <div className="pt-4 border-t hairline flex flex-col gap-4">
            <p className="text-xs text-taupe">
              Already have an account?{" "}
              <Link to="/login" className="text-foreground hover:underline underline-offset-4">Sign in</Link>
            </p>
            <p className="text-[10px] text-taupe leading-relaxed">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
