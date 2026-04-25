import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useState } from "react";

export default function Admin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"stats"|"users"|"reports"|"books">("stats");

  const [reportFilter, setReportFilter] = useState<"open"|"resolved"|"dismissed"|"all">("open");

  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/api/admin/stats")).data });
  const { data: users = [] } = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await api.get("/api/admin/users")).data, enabled: tab==="users" });
  const { data: reports = [] } = useQuery({ queryKey: ["admin-reports", reportFilter], queryFn: async () => (await api.get(`/api/admin/reports${reportFilter !== "all" ? `?status=${reportFilter}` : ""}`)).data, enabled: tab==="reports" });
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
    onSuccess: (_data, vars: any) => {
      // After deleting content, resolve the associated report
      if (vars.reportId) {
        resolveReport.mutate({ id: vars.reportId, status: "resolved" });
      } else {
        qc.invalidateQueries();
      }
    },
    onError: (_err, vars: any) => {
      // Content might already be gone — still resolve the report
      if (vars.reportId) {
        resolveReport.mutate({ id: vars.reportId, status: "resolved" });
      }
    },
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
                  <td>
                    <button
                      className={`text-xs py-1 px-2 rounded border ${u.is_active ? 'border-red-700 text-red-400 hover:bg-red-900/30' : 'border-green-700 text-green-400 hover:bg-green-900/30'}`}
                      onClick={() => updateUser.mutate({ id: u.id, body: { is_active: !u.is_active } })}
                    >
                      {u.is_active ? 'Забанити' : 'Розбанити'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="reports" && (
        <div className="space-y-3">
          <div className="flex gap-2 text-sm">
            {(["open","resolved","dismissed","all"] as const).map(s => (
              <button key={s} onClick={()=>setReportFilter(s)} className={`px-3 py-1 rounded-full border ${reportFilter===s?"border-amber-500 text-amber-400 bg-amber-500/10":"border-surface-300 text-parchment-400"}`}>
                {{open:"Відкриті",resolved:"Вирішені",dismissed:"Відхилені",all:"Всі"}[s]}
              </button>
            ))}
          </div>
          {reports.length===0 && <div className="text-slate-500 text-center p-8">Немає скарг</div>}
          {reports.map((r: any) => (
            <div key={r.id} className="card p-4 flex justify-between items-start gap-4">
              <div>
                <div className="text-sm font-medium"><b>{r.content_type}</b> #{r.content_id}</div>
                <div className="text-sm text-parchment-300 mt-0.5 italic">{r.reason || "без причини"}</div>
                <div className="text-xs text-slate-500 mt-1">Від #{r.reporter_id} • {reportStatusLabel[r.status] || r.status}</div>
              </div>
              {r.status === "open" && (
                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={delContent.isPending || resolveReport.isPending}
                    className="btn-danger text-xs py-1 disabled:opacity-50"
                    onClick={() => delContent.mutate({ type: r.content_type, id: r.content_id, reportId: r.id })}
                  >
                    Видалити
                  </button>
                  <button
                    disabled={resolveReport.isPending}
                    className="btn-secondary text-xs py-1 disabled:opacity-50"
                    onClick={() => resolveReport.mutate({ id: r.id, status: "dismissed" })}
                  >
                    Відхилити
                  </button>
                </div>
              )}
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
