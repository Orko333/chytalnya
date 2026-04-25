import { useState } from "react";
import { useAuth } from "@/store/auth";
import { api, fileUrl } from "@/api/client";

export default function Settings() {
  const { user, refreshMe } = useAuth();
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  async function save() {
    setLoading(true); setMsg("");
    try {
      await api.put("/api/auth/me", { username, bio });
      await refreshMe();
      setMsg("Збережено");
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || "Помилка");
    } finally { setLoading(false); }
  }

  async function uploadAvatar(f: File) {
    const fd = new FormData(); fd.append("file", f);
    await api.post("/api/auth/me/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
    await refreshMe();
  }

  return (
    <div className="max-w-md mx-auto card p-6 space-y-4">
      <h1 className="text-2xl font-bold">Налаштування</h1>
      <div className="flex items-center gap-4">
        {user.avatar_url ? <img src={fileUrl(user.avatar_url)} className="w-16 h-16 rounded-full object-cover"/> : (
          <div className="w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-2xl">{user.username[0].toUpperCase()}</div>
        )}
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}/>
      </div>
      <div><label className="text-sm text-slate-600">Ім'я користувача</label>
        <input className="input" value={username} onChange={(e)=>setUsername(e.target.value)}/></div>
      <div><label className="text-sm text-slate-600">Про себе</label>
        <textarea className="input" rows={3} value={bio} onChange={(e)=>setBio(e.target.value)}/></div>
      <div><label className="text-sm text-slate-600">Електронна пошта</label>
        <input className="input" value={user.email} disabled/></div>
      {msg && <div className="text-sm text-slate-700">{msg}</div>}
      <button className="btn-primary w-full" onClick={save} disabled={loading}>{loading?"Збереження…":"Зберегти"}</button>
    </div>
  );
}
