import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/store/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuth((s) => s.login);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try { await login(email, password); nav("/"); }
    catch (e: any) { setErr(e?.response?.data?.detail || "Помилка входу"); }
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-md mx-auto card p-6 mt-8">
      <h1 className="text-2xl font-bold mb-4">Увійти</h1>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="text-sm text-slate-600">Електронна пошта</label>
          <input type="email" required className="input" value={email} onChange={(e)=>setEmail(e.target.value)} /></div>
        <div><label className="text-sm text-slate-600">Пароль</label>
          <input type="password" required className="input" value={password} onChange={(e)=>setPassword(e.target.value)} /></div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>{loading?"Вхід…":"Увійти"}</button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="link">Забули пароль?</Link>
          <Link to="/register" className="link">Створити акаунт</Link>
        </div>
      </form>

    </div>
  );
}
