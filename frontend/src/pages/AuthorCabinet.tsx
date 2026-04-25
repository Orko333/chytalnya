import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Book, AuthorSubPlan } from "@/api/types";
import { Link } from "react-router-dom";
import { Upload, BarChart3, Trash2, Pencil, Crown, Users, DollarSign, Loader2 } from "lucide-react";

type EditForm = { title: string; author_name: string; description: string; genres: string; language: string };

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
  const [form, setForm] = useState({ title: "", author_name: "", description: "", genres: "", language: "uk" });
  const [textFile, setTextFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [err, setErr] = useState("");

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ title: "", author_name: "", description: "", genres: "", language: "uk" });
  const [editErr, setEditErr] = useState("");

  const openEdit = (b: Book) => {
    setEditId(b.id);
    setEditForm({ title: b.title, author_name: b.author_name, description: b.description, genres: b.genres.join(", "), language: b.language });
    setEditErr("");
  };
  const closeEdit = () => { setEditId(null); setEditErr(""); };

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("author_name", form.author_name);
      fd.append("description", form.description);
      fd.append("genres", form.genres);
      fd.append("language", form.language);
      if (cover) fd.append("cover", cover);
      if (textFile) fd.append("text_file", textFile);
      if (audioFile) fd.append("audio_file", audioFile);
      return (await api.post("/api/books", fd)).data;
    },
    onSuccess: () => { setShow(false); setForm({ title: "", author_name: "", description: "", genres: "", language: "uk" }); qc.invalidateQueries({ queryKey: ["my-books"] }); },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Помилка завантаження"),
  });

  const del = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/books/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-books"] }),
  });

  // ── Monetisation plan ──────────────────────────────────────────────────
  const [showPlan, setShowPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ price_monthly: "", description: "", is_active: true });
  const [planErr, setPlanErr] = useState("");

  const { data: myPlan } = useQuery<AuthorSubPlan | null>({
    queryKey: ["my-author-plan"],
    queryFn: () => api.get<AuthorSubPlan>("/api/payments/author-plan/me").then((r) => r.data).catch(() => null),
  });
  const { data: planStats } = useQuery<{ subscribers: number; total_revenue: number }>({
    queryKey: ["my-plan-stats"],
    queryFn: () => api.get("/api/payments/author-plan/me/stats").then((r) => r.data),
  });

  const savePlan = useMutation({
    mutationFn: () =>
      api.put("/api/payments/author-plan/me", {
        price_monthly: parseFloat(planForm.price_monthly),
        description: planForm.description,
        is_active: planForm.is_active,
      }).then((r) => r.data),
    onSuccess: (data: AuthorSubPlan) => {
      setPlanErr("");
      setShowPlan(false);
      qc.setQueryData(["my-author-plan"], data);
      qc.invalidateQueries({ queryKey: ["my-plan-stats"] });
    },
    onError: (e: any) => setPlanErr(e?.response?.data?.detail || "Помилка збереження"),
  });

  const edit = useMutation({
    mutationFn: async () => {
      const genres_list = editForm.genres.split(",").map(g => g.trim()).filter(Boolean);
      return (await api.put(`/api/books/${editId}`, {
        title: editForm.title,
        author_name: editForm.author_name,
        description: editForm.description,
        genres: genres_list,
        language: editForm.language,
      })).data;
    },
    onSuccess: () => { closeEdit(); qc.invalidateQueries({ queryKey: ["my-books"] }); },
    onError: (e: any) => setEditErr(e?.response?.data?.detail || "Помилка збереження"),
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

      {/* Monetisation section */}
      <div className="rounded-xl border border-surface-700 bg-surface-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700">
          <div className="flex items-center gap-2 font-semibold">
            <Crown className="w-5 h-5 text-amber-400"/>
            Монетизація — Підписка на автора
          </div>
          <button
            className="btn-ghost text-sm"
            onClick={() => {
              if (!showPlan && myPlan) {
                setPlanForm({ price_monthly: String(myPlan.price_monthly), description: myPlan.description, is_active: myPlan.is_active });
              }
              setShowPlan(!showPlan);
            }}
          >
            {showPlan ? "Скасувати" : myPlan ? "Редагувати" : "Налаштувати"}
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-700 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs mb-1">
                <Users className="w-3.5 h-3.5"/>Підписники
              </div>
              <div className="text-2xl font-bold">{planStats?.subscribers ?? 0}</div>
            </div>
            <div className="bg-surface-700 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs mb-1">
                <DollarSign className="w-3.5 h-3.5"/>Дохід
              </div>
              <div className="text-2xl font-bold">${(planStats?.total_revenue ?? 0).toFixed(2)}</div>
            </div>
          </div>

          {/* Current plan info */}
          {myPlan && !showPlan && (
            <div className="bg-surface-700 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${myPlan.is_active ? "bg-green-400" : "bg-slate-400"}`}/>
                <span className="text-slate-300 font-medium">
                  {myPlan.is_active ? "Активна" : "Вимкнена"} · ${myPlan.price_monthly.toFixed(2)}/міс
                </span>
              </div>
              {myPlan.description && <p className="text-slate-400 pl-4">{myPlan.description}</p>}
            </div>
          )}

          {/* Plan form */}
          {showPlan && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ціна на місяць (USD)</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0.99"
                  max="99.99"
                  placeholder="4.99"
                  value={planForm.price_monthly}
                  onChange={(e) => setPlanForm({ ...planForm, price_monthly: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Опис підписки</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Що отримують підписники?"
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  maxLength={500}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={planForm.is_active}
                  onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                Підписка активна (видима читачам)
              </label>
              {planErr && <div className="text-red-400 text-sm">{planErr}</div>}
              <div className="flex gap-2">
                <button
                  className="btn-primary text-sm flex items-center gap-2"
                  disabled={savePlan.isPending || !planForm.price_monthly}
                  onClick={() => { setPlanErr(""); savePlan.mutate(); }}
                >
                  {savePlan.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                  Зберегти
                </button>
                <button className="btn-ghost text-sm" onClick={() => setShowPlan(false)}>Скасувати</button>
              </div>
            </div>
          )}

          {!myPlan && !showPlan && (
            <p className="text-sm text-slate-500 text-center py-2">
              Налаштуйте платну підписку, щоб монетизувати преміум-книги
            </p>
          )}
        </div>
      </div>

      {show && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold">Нова книга</h2>
          <input className="input" placeholder="Назва*" value={form.title} onChange={(e)=>setForm({...form, title: e.target.value})}/>
          <input className="input" placeholder="Автор" value={form.author_name} onChange={(e)=>setForm({...form, author_name: e.target.value})}/>
          <textarea className="input" rows={3} placeholder="Опис" value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})}/>
          <input className="input" placeholder="Жанри (через кому)" value={form.genres} onChange={(e)=>setForm({...form, genres: e.target.value})}/>
          <select className="input" value={form.language} onChange={(e)=>setForm({...form, language: e.target.value})}>
            <option value="uk">Українська</option><option value="en">Англійська</option><option value="pl">Польська</option>
          </select>
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
          <div key={b.id} className="card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-20 rounded bg-gradient-to-br from-brand-200 to-brand-400 flex items-center justify-center text-white font-serif text-xl shrink-0">{b.title.slice(0,2)}</div>
              <div className="flex-1 min-w-0">
                <Link to={`/books/${b.id}`} className="font-semibold hover:underline line-clamp-1">{b.title}</Link>
                <div className="text-xs text-slate-500">{b.views} переглядів • {b.reviews_count} рецензій • ⭐{b.avg_rating.toFixed(1)}</div>
              </div>
              <Link to={`/author/analytics/${b.id}`} className="btn-ghost p-2" title="Аналітика"><BarChart3 className="w-4 h-4"/></Link>
              <button className="btn-ghost p-2 text-amber-400" title="Редагувати" onClick={() => editId === b.id ? closeEdit() : openEdit(b)}><Pencil className="w-4 h-4"/></button>
              <button className="btn-ghost p-2 text-red-600" onClick={() => confirm(`Видалити «${b.title}»?`) && del.mutate(b.id)}><Trash2 className="w-4 h-4"/></button>
            </div>

            {editId === b.id && (
              <div className="border-t border-surface-300 pt-3 space-y-2">
                <h3 className="text-sm font-semibold text-amber-400">Редагування</h3>
                <input className="input text-sm" placeholder="Назва*" value={editForm.title} onChange={(e)=>setEditForm({...editForm, title: e.target.value})}/>
                <input className="input text-sm" placeholder="Автор" value={editForm.author_name} onChange={(e)=>setEditForm({...editForm, author_name: e.target.value})}/>
                <textarea className="input text-sm" rows={2} placeholder="Опис" value={editForm.description} onChange={(e)=>setEditForm({...editForm, description: e.target.value})}/>
                <input className="input text-sm" placeholder="Жанри (через кому)" value={editForm.genres} onChange={(e)=>setEditForm({...editForm, genres: e.target.value})}/>
                <select className="input text-sm" value={editForm.language} onChange={(e)=>setEditForm({...editForm, language: e.target.value})}>
                  <option value="uk">Українська</option><option value="en">Англійська</option><option value="pl">Польська</option>
                </select>
                {editErr && <div className="text-red-500 text-xs">{editErr}</div>}
                <div className="flex gap-2">
                  <button className="btn-primary text-sm py-1" disabled={edit.isPending || !editForm.title} onClick={() => { setEditErr(""); edit.mutate(); }}>Зберегти</button>
                  <button className="btn-ghost text-sm py-1" onClick={closeEdit}>Скасувати</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
