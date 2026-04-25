import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Achievement } from "@/api/types";

export default function Achievements() {
  const { data = [] } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => (await api.get<Achievement[]>("/api/achievements")).data,
  });
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Досягнення</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {data.map((a) => (
          <div key={a.id} className={`card p-4 text-center ${a.earned?"":"opacity-50 grayscale"}`}>
            <div className="text-5xl mb-2">{a.icon}</div>
            <div className="font-semibold text-parchment-100">{a.name}</div>
            <div className="text-xs text-parchment-300 mt-1">{a.description}</div>
            {a.earned && a.earned_at && <div className="text-[10px] text-amber-300 mt-2">Отримано {new Date(a.earned_at).toLocaleDateString("uk-UA")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
