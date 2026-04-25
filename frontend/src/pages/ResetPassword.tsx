import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/api/client";

export default function ResetPassword() {
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const [password, setPassword] = useState("");
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
          <input type="password" required minLength={6} className="input" placeholder="Новий пароль" value={password} onChange={(e)=>setPassword(e.target.value)}/>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button className="btn-primary w-full" disabled={loading}>{loading?"Оновлення…":"Зберегти"}</button>
        </form>
      )}
    </div>
  );
}
