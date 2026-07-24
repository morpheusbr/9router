"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input } from "@/shared/components";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.requireLogin === false) {
            window.location.assign("/dashboard");
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
        } else {
          // Safe fallback on non-OK response to avoid infinite loading state.
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Force a new password before entering the dashboard (default + remote).
  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to set password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/oidc/start";
  };

  const oidcAvailable = oidcConfigured && ["oidc", "both"].includes(authMode);
  const passwordAvailable = authMode !== "oidc" || !oidcConfigured;

  // Show loading state while checking password
  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-text-muted mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg relative overflow-hidden selection:bg-primary/30">
      {/* Animated Glowing Background Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/20 dark:bg-primary/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-lighten animate-[pulse_8s_ease-in-out_infinite]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-amber-500/20 dark:bg-amber-500/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-lighten animate-[pulse_10s_ease-in-out_infinite_reverse]" />
      
      {/* Noise Overlay */}
      <div className="absolute inset-0 bg-black/5 dark:bg-white/5 pointer-events-none mix-blend-overlay" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22 opacity=%220.4%22/%3E%3C/svg%3E')" }} />

      <div className="relative z-10 w-full max-w-[420px] px-6 animate-in fade-in zoom-in-95 duration-700 ease-out">
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-[18px] bg-gradient-to-br from-primary to-amber-500 text-white shadow-warm mb-5 flex items-center justify-center transform transition-transform hover:scale-110 duration-500">
            <span className="material-symbols-outlined text-4xl">router</span>
          </div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-text to-text-muted mb-2 tracking-tight drop-shadow-sm">HiperRouter</h1>
          <p className="text-text-muted text-sm font-medium px-4">
            {authMode === "oidc" && oidcConfigured
              ? "Sign in with your OIDC provider to access the dashboard"
              : "Enter your password to access the dashboard"}
          </p>
        </div>

        <div className="backdrop-blur-2xl bg-surface/70 dark:bg-surface/30 border border-white/20 dark:border-white/10 shadow-elevated rounded-[24px] p-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent dark:from-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          
          <div className="relative z-10">
            {mustChange ? (
              <form onSubmit={handleSetNewPassword} className="flex flex-col gap-5">
                <p className="text-sm text-amber-600 dark:text-amber-400 text-center font-medium">
                  Set a new password before accessing the dashboard remotely.
                </p>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-text">New password</label>
                  <Input
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    className="bg-bg/50 backdrop-blur-sm border-white/10 focus:ring-primary/30"
                  />
                  {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                </div>
                <Button type="submit" variant="primary" className="w-full mt-2 shadow-warm hover:scale-[1.02] transition-transform" loading={loading} disabled={!newPassword}>
                  Set password
                </Button>
              </form>
            ) : (
            <div className="flex flex-col gap-5">
              {oidcAvailable && (
                <Button type="button" variant="primary" className="w-full shadow-warm hover:scale-[1.02] transition-transform" onClick={handleOidcLogin}>
                  {oidcLoginLabel}
                </Button>
              )}

              {oidcAvailable && passwordAvailable && (
                <div className="flex items-center gap-3">
                  <div className="h-px bg-border/40 flex-1" />
                  <span className="text-[10px] text-text-subtle font-bold uppercase tracking-wider">or</span>
                  <div className="h-px bg-border/40 flex-1" />
                </div>
              )}

              {passwordAvailable ? (
                <form onSubmit={handleLogin} className="flex flex-col gap-5">
                  {((authMode === "oidc" && !oidcConfigured) || (authMode === "both" && !oidcConfigured)) && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                      <p className="text-xs text-amber-600 dark:text-amber-400 text-center font-medium">
                        OIDC login is enabled, but the issuer/client fields are not configured yet. Password login is still available for recovery.
                      </p>
                    </div>
                  )}

                  {authMode === "both" && oidcConfigured && (
                    <p className="text-xs text-text-muted text-center font-medium">
                      Password and OIDC login are both enabled.
                    </p>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text">Password</label>
                    <Input
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus={!oidcAvailable}
                      className="bg-bg/50 backdrop-blur-sm border-white/10 focus:ring-primary/30"
                    />
                    {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                    {retryAfter > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Locked. Retry in <span className="font-mono">{retryAfter}s</span>.
                      </p>
                    )}
                    {resetHint && (
                      <p className="text-xs text-text-muted mt-1 leading-relaxed">
                        Forgot password? Open <code className="bg-surface px-1.5 py-0.5 rounded border border-border/50 shadow-sm font-mono text-[10px]">9router</code> CLI on the host → <b>Settings</b> → <b>Reset Password to Default</b>.
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full mt-1 shadow-warm hover:scale-[1.02] transition-transform"
                    loading={loading}
                    disabled={retryAfter > 0}
                  >
                    {retryAfter > 0 ? `Wait ${retryAfter}s` : "Login"}
                  </Button>

                  {hasPassword === false && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mt-2">
                      <p className="text-xs text-center text-amber-600 dark:text-amber-400 font-medium">
                        Security risk: no password set. You will be asked to set one when logging in remotely.
                      </p>
                    </div>
                  )}
                </form>
              ) : (
                error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>
              )}
            </div>
            )}
          </div>
        </div>
        
        {/* Footer Text */}
        <div className="mt-8 text-center opacity-60 hover:opacity-100 transition-opacity">
          <p className="text-[11px] text-text-muted font-bold tracking-widest uppercase">Secure AI Infrastructure</p>
        </div>
      </div>
    </div>
  );
}
