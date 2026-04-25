import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { ArrowLeft } from "lucide-react";

export default function AuthorAnalytics() {
  const { id } = useParams();
  const { data } = useQuery({
    queryKey: ["analytics", id],
    queryFn: async () => (await api.get(`/api/author/analytics/${id}`)).data,
  });
  if (!data) return <div className="p-8 text-slate-500">Завантаження…</div>;
  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/author" className="btn-ghost mb-4"><ArrowLeft className="w-4 h-4"/>До кабінету</Link>
      <h1 className="text-2xl font-bold mb-4">Аналітика: {data.title}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Переглядів" value={data.views}/>
        <Stat label="Читали" value={data.reads}/>
        <Stat label="Слухали" value={data.listens}/>
        <Stat label="Завершили" value={data.completes}/>
        <Stat label="В обраному" value={data.favorites}/>
        <Stat label="Рецензій" value={data.reviews_count}/>
        <Stat label="Середня оцінка" value={data.avg_rating}/>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="card p-5 text-center">
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
