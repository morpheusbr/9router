"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requireLogin, setRequireLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, requireLogin }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ocorreu um erro no setup.");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4 font-sans selection:bg-cyan-500/30">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full bg-cyan-900/20 blur-[120px]"></div>
        <div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-blue-900/20 blur-[120px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 p-8 rounded-3xl shadow-2xl transition-all duration-500 hover:border-white/20 hover:shadow-cyan-500/10 hover:-translate-y-1">
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 mb-6 shadow-lg shadow-cyan-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2">Bem-vindo(a)!</h1>
            <p className="text-sm text-gray-400">Configure sua conta de Administrador para proteger o HiperRouter.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-300 ml-1">Senha Mestra</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all duration-300"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-300 ml-1">Confirmar Senha</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all duration-300"
              />
            </div>

            <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setRequireLogin(!requireLogin)}>
              <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ease-in-out ${requireLogin ? 'bg-cyan-500' : 'bg-gray-600'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-300 ease-in-out ${requireLogin ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Exigir Login Localmente</p>
                <p className="text-xs text-gray-400">Pede senha mesmo acessando do localhost</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || success}
              className={`w-full relative overflow-hidden group rounded-xl px-4 py-3.5 font-semibold text-white transition-all duration-300 ${
                success 
                  ? "bg-green-500 hover:bg-green-600" 
                  : "bg-cyan-600 hover:bg-cyan-500 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]"
              } disabled:opacity-70 disabled:cursor-not-allowed`}
            >
              <div className="relative z-10 flex items-center justify-center gap-2">
                {loading && !success && (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {success ? "Configurado com Sucesso!" : (loading ? "Salvando..." : "Concluir Configuração")}
              </div>
            </button>
          </form>

        </div>
        
        <p className="text-center text-xs text-gray-600 mt-6 font-medium tracking-wide">
          HIPERROUTER AI PLATFORM
        </p>
      </div>
    </div>
  );
}
