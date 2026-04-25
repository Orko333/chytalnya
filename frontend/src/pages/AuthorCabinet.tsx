import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Book } from "@/api/types";
import { Link } from "react-router-dom";
import { Upload, BarChart3, Trash2 } from "lucide-react";

export default function AuthorCabinet() {
  const qc = useQueryClient();
  const { data: books = [] } = useQuery({
    queryKey: ["my-books"],
    queryFn: async () => (await api.get<Book[]>("/api/author/books")).data,
  });
  const { data: summary } = useQuery({
    queryKey: ["author-summary"],
    queryFn: async () => (await api.get("/api/author/summary")).data,
  });

  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: "", author_name: "", description: "", genres: "", language: "uk", is_premium: false });
  const [textFile, setTextFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [err, setErr] = useState("");

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("author_name", form.author_name);
      fd.append("description", form.description);
      fd.append("genres", form.genres);
      fd.append("language", form.language);
      fd.append("is_premium", String(form.is_premium));
      if (cover) fd.append("cover", cover);
      if (textFile) fd.append("text_file", textFile);
      if (audioFile) fd.append("audio_file", audioFile);
      return (await api.post("/api/books", fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: () => { setShow(false); setForm({ title: "", author_name: "", description: "", genres: "", language: "uk", is_premium: false }); qc.invalidateQueries({ queryKey: ["my-books"] }); },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Помилка завантаження"),
  });

  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/books/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-books"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Кабінет автора</h1>
        <button className="btn-primary" onClick={() => setShow(!show)}><Upload className="w-4 h-4"/>Завантажити книгу</button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center"><div className="text-3xl font-bold">{summary.books_count}</div><div className="text-sm text-slate-500">Книг</div></div>
          <div className="card p-4 text-center"><div className="text-3xl font-bold">{summary.total_views}</div><div className="text-sm text-slate-500">Переглядів</div></div>
          <div className="card p-4 text-center"><div className="text-3xl font-bold">{summary.total_reviews}</div><div className="text-sm text-slate-500">Рецензій</div></div>
        </div>
      )}

      {show && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold">Нова книга</h2>
          <input className="input" placeholder="Назва*" value={form.title} onChange={(e)=>setForm({...form, title: e.target.value})}/>
          <input className="input" placeholder="Автор" value={form.author_name} onChange={(e)=>setForm({...form, author_name: e.target.value})}/>
          <textarea className="input" rows={3} placeholder="Опис" value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})}/>
          <input className="input" placeholder="Жанри (через кому)" value={form.genres} onChange={(e)=>setForm({...form, genres: e.target.value})}/>
          <div className="grid grid-cols-2 gap-3">
            <select className="input" value={form.language} onChange={(e)=>setForm({...form, language: e.target.value})}>
              <option value="uk">Українська</option><option value="en">Англійська</option><option value="pl">Польська</option>
            </select>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_premium} onChange={(e)=>setForm({...form, is_premium: e.target.checked})}/>Преміум-книга</label>
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div><label className="block text-slate-600 mb-1">Обкладинка</label><input type="file" accept="image/*" onChange={(e)=>setCover(e.target.files?.[0]||null)}/></div>
            <div><label className="block text-slate-600 mb-1">Текст (.txt/.md)</label><input type="file" accept=".txt,.md" onChange={(e)=>setTextFile(e.target.files?.[0]||null)}/></div>
            <div><label className="block text-slate-600 mb-1">Аудіо (.mp3/.m4a)</label><input type="file" accept="audio/*" onChange={(e)=>setAudioFile(e.target.files?.[0]||null)}/></div>
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={upload.isPending || !form.title} onClick={() => { setErr(""); upload.mutate(); }}>Опублікувати</button>
            <button className="btn-ghost" onClick={()=>setShow(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {books.map((b) => (
          <div key={b.id} className="card p-4 flex items-center gap-3">
            <div className="w-14 h-20 rounded bg-gradient-to-br from-brand-200 to-brand-400 flex items-center justify-center text-white font-serif text-xl shrink-0">{b.title.slice(0,2)}</div>
            <div className="flex-1 min-w-0">
              <Link to={`/books/${b.id}`} className="font-semibold hover:underline line-clamp-1">{b.title}</Link>
              <div className="text-xs text-slate-500">{b.views} переглядів • {b.reviews_count} рецензій • ⭐{b.avg_rating.toFixed(1)}</div>
            </div>
            <Link to={`/author/analytics/${b.id}`} className="btn-ghost p-2" title="Аналітика"><BarChart3 className="w-4 h-4"/></Link>
            <button className="btn-ghost p-2 text-red-600" onClick={() => confirm(`Видалити «${b.title}»?`) && del.mutate(b.id)}><Trash2 className="w-4 h-4"/></button>
          </div>
        ))}
      </div>
    </div>
  );
}
