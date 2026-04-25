import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/store/auth";
import { Crown, Check } from "lucide-react";
import type { Plan, SubStatus } from "@/api/types";

export default function Subscriptions() {
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get<Plan[]>("/api/subscriptions/plans")).data,
  });
  const { data: current } = useQuery({
    queryKey: ["current-sub"],
    queryFn: async () => (await api.get<SubStatus>("/api/subscriptions/current")).data,
    enabled: !!user,
  });

  const checkout = useMutation({
    mutationFn: async () => (await api.post("/api/subscriptions/checkout")).data,
    onSuccess: (d: any) => {
      if (d.checkout_url && !d.checkout_url.includes("demo=1")) {
        window.location.href = d.checkout_url;
      } else {
        qc.invalidateQueries({ queryKey: ["current-sub"] });
        alert("Преміум активовано (демо-режим)");
      }
    },
  });
  const cancel = useMutation({
    mutationFn: async () => (await api.post("/api/subscriptions/cancel")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["current-sub"] }),
  });

  const planLabel: Record<string, string> = {
    free: "Безкоштовний",
    premium: "Преміум",
  };
  const subStatusLabel: Record<string, string> = {
    active: "активна",
    canceled: "скасована",
    expired: "завершена",
    trialing: "пробна",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Підписки</h1>
      {sp.get("status") === "success" && <div className="card p-4 bg-green-50 border-green-200 text-green-800">Підписку успішно оформлено!</div>}
      {user && current && (
        <div className="card p-4">
          Поточний план: <b className="text-brand-700">{planLabel[current.plan_code] || current.plan_code}</b> ({subStatusLabel[current.status] || current.status})
          {current.end_date && <span className="text-slate-500 text-sm ml-2">до {new Date(current.end_date).toLocaleDateString()}</span>}
          {current.plan_code === "premium" && <button className="btn-ghost text-red-600 ml-4" onClick={() => cancel.mutate()}>Скасувати</button>}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div key={p.code} className={`card p-6 ${p.code==="premium"?"border-brand-500 border-2":""}`}>
            <div className="flex items-center gap-2 mb-2">
              {p.code === "premium" && <Crown className="w-5 h-5 text-amber-500"/>}
              <h2 className="text-xl font-bold">{p.name}</h2>
            </div>
            <div className="text-3xl font-bold mb-3">{p.price_monthly === 0 ? "Безкоштовно" : `$${p.price_monthly}/міс`}</div>
            <ul className="space-y-2 mb-4">
              {p.features.map((f, i) => <li key={i} className="flex gap-2 text-sm"><Check className="w-4 h-4 text-green-600 shrink-0"/>{f}</li>)}
            </ul>
            {user && p.code === "premium" && current?.plan_code !== "premium" && (
              <button className="btn-primary w-full" onClick={() => checkout.mutate()}>Оформити</button>
            )}
            {!user && <a href="/login" className="btn-primary w-full">Увійти для оформлення</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
