import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useState } from "react";

export default function Admin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"stats"|"users"|"reports"|"books">("stats");

  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/api/admin/stats")).data });
  const { data: users = [] } = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await api.get("/api/admin/users")).data, enabled: tab==="users" });
  const { data: reports = [] } = useQuery({ queryKey: ["admin-reports"], queryFn: async () => (await api.get("/api/admin/reports")).data, enabled: tab==="reports" });
  const { data: allBooks = [] } = useQuery({ queryKey: ["admin-books"], queryFn: async () => (await api.get("/api/admin/books")).data, enabled: tab==="books" });

  const updateUser = useMutation({
    mutationFn: async ({ id, body }: any) => (await api.put(`/api/admin/users/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const resolveReport = useMutation({
    mutationFn: async ({ id, status }: any) => (await api.put(`/api/admin/reports/${id}`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-reports"] }),
  });
  const delContent = useMutation({
    mutationFn: async ({ type, id }: any) => (await api.delete(`/api/admin/content/${type}/${id}`)).data,
    onSuccess: () => qc.invalidateQueries(),
  });

  const statLabels: Record<string, string> = {
    users: "Користувачі",
    authors: "Автори",
    books: "Книги",
    books_published: "Опубліковано",
    reviews: "Рецензії",
    reports_open: "Відкриті скарги",
    premium_subs: "Преміум підписки",
  };

  const roleLabel: Record<string, string> = {
    user: "Читач",
    author: "Автор",
    admin: "Адміністратор",
  };

  const reportStatusLabel: Record<string, string> = {
    open: "Відкрита",
    resolved: "Вирішена",
    dismissed: "Відхилена",
  };

  const bookStatusLabel: Record<string, string> = {
    draft: "Чернетка",
    published: "Опублікована",
    banned: "Заблокована",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Адмін-панель</h1>
      <div className="flex gap-2 border-b border-surface-300">
        {[["stats","Статистика"],["users","Користувачі"],["reports","Скарги"],["books","Книги"]].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k as any)} className={`px-4 py-2 text-sm ${tab===k?"border-b-2 border-amber-500 text-amber-400":"text-parchment-300"}`}>{l}</button>
        ))}
      </div>

      {tab==="stats" && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(stats).map(([k,v]) => (
            <div key={k} className="card p-4 text-center">
              <div className="text-3xl font-bold text-amber-300">{String(v)}</div>
              <div className="text-sm text-parchment-300">{statLabels[k] || k}</div>
            </div>
          ))}
        </div>
      )}

      {tab==="users" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-3">ID</th><th>Електронна пошта</th><th>Ім'я</th><th>Роль</th><th>Активний</th><th>Дії</th></tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="p-3">{u.id}</td><td>{u.email}</td><td>{u.username}</td>
                  <td><select value={u.role} onChange={(e)=>updateUser.mutate({id:u.id, body:{role:e.target.value}})} className="input py-1 px-2"><option value="user">{roleLabel.user}</option><option value="author">{roleLabel.author}</option><option value="admin">{roleLabel.admin}</option></select></td>
                  <td><input type="checkbox" checked={u.is_active} onChange={(e)=>updateUser.mutate({id:u.id, body:{is_active:e.target.checked}})}/></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="reports" && (
        <div className="space-y-2">
          {reports.length===0 && <div className="text-slate-500 text-center p-8">Немає скарг</div>}
          {reports.map((r: any) => (
            <div key={r.id} className="card p-4 flex justify-between items-center">
              <div>
                <div className="text-sm"><b>{r.content_type}</b> #{r.content_id} — <i>{r.reason || "без причини"}</i></div>
                <div className="text-xs text-slate-500">Від #{r.reporter_id} • {reportStatusLabel[r.status] || r.status}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn-danger text-xs py-1" onClick={() => { delContent.mutate({type:r.content_type, id:r.content_id}); resolveReport.mutate({id:r.id, status:"resolved"}); }}>Видалити</button>
                <button className="btn-secondary text-xs py-1" onClick={()=>resolveReport.mutate({id:r.id, status:"dismissed"})}>Відхилити</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==="books" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-3">ID</th><th>Назва</th><th>Автор</th><th>Статус</th><th>Перегляди</th><th></th></tr></thead>
            <tbody>
              {allBooks.map((b: any) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="p-3">{b.id}</td><td>{b.title}</td><td>{b.author_name}</td><td>{bookStatusLabel[b.status] || b.status}</td><td>{b.views}</td>
                  <td><button className="btn-danger text-xs py-1" onClick={()=>delContent.mutate({type:"book", id:b.id})}>Забанити</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
