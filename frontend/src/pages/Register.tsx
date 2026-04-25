import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/store/auth";

export default function Register() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const register = useAuth((s) => s.register);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try { await register(email, username, password); nav("/"); }
    catch (e: any) { setErr(e?.response?.data?.detail || "Помилка реєстрації"); }
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-md mx-auto card p-6 mt-8">
      <h1 className="text-2xl font-bold mb-4">Реєстрація</h1>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="text-sm text-slate-600">Електронна пошта</label>
          <input type="email" required className="input" value={email} onChange={(e)=>setEmail(e.target.value)} /></div>
        <div><label className="text-sm text-slate-600">Ім'я користувача</label>
          <input type="text" required minLength={3} className="input" value={username} onChange={(e)=>setUsername(e.target.value)} /></div>
        <div><label className="text-sm text-slate-600">Пароль (мін. 6 символів)</label>
          <div className="relative">
            <input type={showPwd ? "text" : "password"} required minLength={6} className="input pr-10" value={password} onChange={(e)=>setPassword(e.target.value)} />
            <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div></div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>{loading?"Створення…":"Створити акаунт"}</button>
        <div className="text-sm text-center"><Link to="/login" className="link">Вже маю акаунт</Link></div>
      </form>
    </div>
  );
}
