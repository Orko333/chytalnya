import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/api/client";

export default function ResetPassword() {
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      setOk(true);
      setTimeout(() => nav("/login"), 1500);
    } catch (e: any) { setErr(e?.response?.data?.detail || "Помилка"); }
    finally { setLoading(false); }
  }

  if (!token) return <div className="max-w-md mx-auto card p-6 mt-8">Немає токена. <Link to="/forgot-password" className="link">Запитати знову</Link></div>;

  return (
    <div className="max-w-md mx-auto card p-6 mt-8">
      <h1 className="text-2xl font-bold mb-4">Новий пароль</h1>
      {ok ? <div className="text-green-700">Пароль оновлено. Перенаправлення…</div> : (
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <input type={showPwd ? "text" : "password"} required minLength={6} className="input pr-10" placeholder="Новий пароль" value={password} onChange={(e)=>setPassword(e.target.value)}/>
            <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button className="btn-primary w-full" disabled={loading}>{loading?"Оновлення…":"Зберегти"}</button>
        </form>
      )}
    </div>
  );
}
