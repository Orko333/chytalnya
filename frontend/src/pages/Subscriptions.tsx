import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { SubStatus, PaymentItem, Plan } from "@/api/types";
import PaymentModal from "@/components/PaymentModal";
import {
  Crown, CheckCircle2, XCircle, Receipt, CreditCard, Calendar, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

export default function Subscriptions() {
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<SubStatus>({
    queryKey: ["platform-sub-status"],
    queryFn: () => api.get<SubStatus>("/api/payments/platform/status").then((r) => r.data),
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["sub-plans"],
    queryFn: () => api.get<Plan[]>("/api/subscriptions/plans").then((r) => r.data),
  });

  const { data: history, isLoading: historyLoading } = useQuery<PaymentItem[]>({
    queryKey: ["payment-history"],
    queryFn: () => api.get<PaymentItem[]>("/api/payments/history").then((r) => r.data),
  });

  const cancel = useMutation({
    mutationFn: () => api.post("/api/payments/platform/cancel"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-sub-status"] }),
  });

  const isPremium =
    status?.plan_code === "premium" &&
    status?.status === "active";

  const endDate = status?.end_date
    ? format(new Date(status.end_date), "d MMMM yyyy", { locale: uk })
    : null;

  const premiumPlan = plans?.find((p) => p.code === "premium");

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-bold">Підписки</h1>

      {/* Status card */}
      {statusLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500"/>
        </div>
      ) : (
        <div className={`rounded-2xl border p-6 ${
          isPremium
            ? "bg-amber-500/10 border-amber-500/30"
            : "bg-surface-800 border-surface-700"
        }`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isPremium ? "bg-amber-500/20" : "bg-surface-700"
              }`}>
                <Crown className={`w-6 h-6 ${isPremium ? "text-amber-400" : "text-slate-400"}`}/>
              </div>
              <div>
                <div className="font-semibold text-lg">
                  {isPremium ? "Читальня Преміум" : "Безкоштовний план"}
                </div>
                <div className="text-sm text-slate-400">
                  {isPremium
                    ? endDate ? `Активна до ${endDate}` : "Активна"
                    : "Базовий доступ до бібліотеки"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isPremium ? (
                <button
                  className="btn-ghost text-sm text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => cancel.mutate()}
                  disabled={cancel.isPending}
                >
                  {cancel.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : "Скасувати"}
                </button>
              ) : (
                <button
                  className="btn-primary text-sm flex items-center gap-2"
                  onClick={() => setPayOpen(true)}
                >
                  <Crown className="w-4 h-4"/>
                  Оформити Преміум
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Free */}
        <div className="rounded-xl border border-surface-700 bg-surface-800 p-5">
          <div className="text-sm font-semibold text-slate-400 mb-1 uppercase tracking-wide">Безкоштовно</div>
          <div className="text-3xl font-bold mb-4">$0<span className="text-lg font-normal text-slate-400">/міс</span></div>
          <ul className="space-y-2 text-sm text-slate-300">
            {["Доступ до безкоштовних книг", "Читання та аудіо", "Відгуки та рейтинги"].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0"/>
                {f}
              </li>
            ))}
            <li className="flex items-center gap-2 text-slate-500">
              <XCircle className="w-4 h-4 shrink-0"/>
              Преміум книги
            </li>
          </ul>
        </div>

        {/* Premium */}
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-bl-xl">
            ПОПУЛЯРНЕ
          </div>
          <div className="text-sm font-semibold text-amber-400 mb-1 uppercase tracking-wide">Преміум</div>
          <div className="text-3xl font-bold mb-4">
            ${premiumPlan?.price_monthly.toFixed(2) ?? "4.99"}
            <span className="text-lg font-normal text-slate-400">/міс</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            {(premiumPlan?.features ?? [
              "Усі безкоштовні функції",
              "Повний доступ до преміум книг",
              "Аудіо без обмежень",
              "Підтримка авторів",
            ]).map((f) => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0"/>
                {f}
              </li>
            ))}
          </ul>
          {!isPremium && (
            <button
              className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
              onClick={() => setPayOpen(true)}
            >
              <Crown className="w-4 h-4"/>
              Оформити Преміум
            </button>
          )}
          {isPremium && (
            <div className="flex items-center justify-center gap-2 mt-5 text-green-400 font-semibold">
              <CheckCircle2 className="w-5 h-5"/>
              У вас активна підписка
            </div>
          )}
        </div>
      </div>

      {/* Payment history */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-slate-400"/>
          Історія платежів
        </h2>
        {historyLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500"/>
          </div>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm bg-surface-800 rounded-xl border border-surface-700">
            Платежів поки немає
          </div>
        ) : (
          <div className="rounded-xl border border-surface-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-800 text-slate-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Опис</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Картка</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Дата</th>
                  <th className="text-right px-4 py-3">Сума</th>
                  <th className="text-right px-4 py-3">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700">
                {history.map((p) => (
                  <tr key={p.id} className="bg-surface-900 hover:bg-surface-800 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          p.kind === "platform_premium" ? "bg-amber-500/20" : "bg-brand-500/20"
                        }`}>
                          <Crown className={`w-4 h-4 ${
                            p.kind === "platform_premium" ? "text-amber-400" : "text-brand-400"
                          }`}/>
                        </div>
                        <span className="truncate max-w-[180px]">{p.description}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">
                      {p.card_last4 ? (
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5"/>
                          ****{p.card_last4}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5"/>
                        {format(new Date(p.created_at), "d MMM yyyy", { locale: uk })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      ${p.amount.toFixed(2)} {p.currency}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.status === "succeeded"
                          ? "bg-green-500/20 text-green-400"
                          : p.status === "pending"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {p.status === "succeeded" ? "✓" : p.status === "pending" ? "⏳" : "✗"}
                        {p.status === "succeeded" ? "Успішно" : p.status === "pending" ? "Очікує" : "Відхилено"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment modal */}
      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        checkoutUrl="/api/payments/platform/checkout"
        confirmUrl="/api/payments/platform/confirm"
        onSuccess={() => {
          setPayOpen(false);
          qc.invalidateQueries({ queryKey: ["platform-sub-status"] });
          qc.invalidateQueries({ queryKey: ["payment-history"] });
        }}
      />
    </div>
  );
}
