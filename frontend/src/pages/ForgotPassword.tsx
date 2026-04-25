import { useState } from "react";
import { api } from "@/api/client";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try { await api.post("/api/auth/forgot-password", { email }); setSent(true); }
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-md mx-auto card p-6 mt-8">
      <h1 className="text-2xl font-bold mb-4">Скидання паролю</h1>
      {sent ? (
        <div className="text-sm text-slate-700">
          Якщо вказану електронну пошту зареєстровано — ми надіслали на неї посилання для скидання паролю. Воно діє 30 хвилин.
          <div className="mt-4"><Link to="/login" className="link">Повернутися до входу</Link></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div><label className="text-sm text-slate-600">Електронна пошта</label>
            <input type="email" required className="input" value={email} onChange={(e)=>setEmail(e.target.value)}/></div>
          <button className="btn-primary w-full" disabled={loading}>{loading?"Надсилання…":"Надіслати посилання"}</button>
        </form>
      )}
    </div>
  );
}
