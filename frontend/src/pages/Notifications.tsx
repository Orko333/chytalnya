import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Link } from "react-router-dom";
import type { NotificationT } from "@/api/types";

export default function Notifications() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["notifications-full"],
    queryFn: async () => (await api.get<NotificationT[]>("/api/notifications")).data,
  });
  const readAll = useMutation({
    mutationFn: async () => (await api.post("/api/notifications/read-all")).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications-full"] }); qc.invalidateQueries({ queryKey: ["unread"] }); },
  });
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Сповіщення</h1>
        <button className="btn-secondary" onClick={() => readAll.mutate()}>Позначити всі прочитаними</button>
      </div>
      <div className="space-y-2">
        {data.length === 0 && <div className="text-slate-500 text-center p-8">Поки немає сповіщень</div>}
        {data.map((n) => (
          <Link key={n.id} to={n.link || "#"} className={`card p-3 block ${n.is_read?"opacity-60":""}`}>
            <div className="text-sm font-semibold">{n.title}</div>
            {n.body && <div className="text-sm text-slate-600">{n.body}</div>}
            <div className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
