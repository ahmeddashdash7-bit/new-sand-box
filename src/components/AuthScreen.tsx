import React, { useState } from "react";
import { User } from "../types";
import { signInTeacher } from "../lib/authStore";
import { LogIn, ShieldCheck, CheckCircle2, Lock, Mail } from "lucide-react";
import GhadaLogo from "./GhadaLogo";

interface AuthScreenProps {
  onSuccess: (user: User) => void;
  onCancel?: () => void;
}

export default function AuthScreen({ onSuccess, onCancel }: AuthScreenProps) {
  // Login credentials. The password is handed straight to Firebase for server-side
  // verification — it is never stored, compared, or persisted by this application.
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Toast / Messages
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Login Handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!loginEmail.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await signInTeacher(loginEmail, loginPassword);
      if (res.success && res.user) {
        // App also picks this up from the Firebase auth listener; calling onSuccess keeps the
        // existing screen-transition behaviour immediate.
        onSuccess(res.user);
      } else {
        setErrorMessage(res.message);
      }
    } catch {
      setErrorMessage("An unexpected error occurred during sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-100 text-left space-y-6" dir="ltr" id="auth-portal-card">
      {/* Header & Logo */}
      <div className="text-center space-y-2 border-b border-slate-100 pb-4">
        <GhadaLogo size="sm" showText={false} className="mx-auto" />
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[11px] font-extrabold text-indigo-700">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Teacher Portal Access</span>
        </div>
        <h2 className="text-xl font-black text-slate-800">Teacher Sign In</h2>
        <p className="text-xs text-slate-500">Sign in with your authorized teacher credentials</p>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="bg-rose-50 text-rose-700 border border-rose-200 p-3 rounded-xl text-xs font-bold text-center animate-shake">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLoginSubmit} className="space-y-4" id="form-login">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="e.g. teacher@edulink.com"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            Password
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
        >
          <LogIn className="w-4 h-4" />
          <span>{loading ? "Signing In..." : "Sign In"}</span>
        </button>
      </form>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-100 transition-all cursor-pointer"
        >
          Cancel and Return
        </button>
      )}
    </div>
  );
}
