import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fileUrl } from "@/api/client";
import type { PaymentItem } from "@/api/types";
import {
  Crown, CheckCircle2, XCircle, Receipt, CreditCard, Calendar, Loader2, Users, User as UserIcon,
} from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

type AuthorSubItem = {
  author_id: number;
  author_username: string;
  author_avatar_url: string;
  status: string;
  end_date: string | null;
  price_monthly: number;
  plan_description: string;
};

export default function Subscriptions() {
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState<number | null>(null);

  const { data: subs = [], isLoading: subsLoading } = useQuery<AuthorSubItem[]>({
    queryKey: ["my-author-subs"],
    queryFn: () => api.get<AuthorSubItem[]>("/api/payments/my-author-subs").then((r) => r.data),
  });

  const { data: history, isLoading: historyLoading } = useQuery<PaymentItem[]>({
    queryKey: ["payment-history"],
    queryFn: () => api.get<PaymentItem[]>("/api/payments/history").then((r) => r.data),
  });

  const cancel = useMutation({
    mutationFn: (authorId: number) => api.post(`/api/payments/author/${authorId}/cancel`),
    onSuccess: () => {
      setCancelling(null);
      qc.invalidateQueries({ queryKey: ["my-author-subs"] });
    },
  });

  const activeSubs = subs.filter((s) => s.status === "active");
  const inactiveSubs = subs.filter((s) => s.status !== "active");

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Crown className="w-7 h-7 text-amber-400" />
        Мої підписки на авторів
      </h1>

      {/* Active subscriptions */}
      <section>
        <h2 className="text-base font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          Активні підписки
        </h2>

        {subsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        ) : activeSubs.length === 0 ? (
          <div className="rounded-xl border border-surface-700 bg-surface-800 p-8 text-center space-y-3">
            <Users className="w-10 h-10 text-slate-500 mx-auto" />
            <p className="text-slate-400">У вас немає активних підписок на авторів</p>
            <p className="text-sm text-slate-500">
              Відкрийте профіль автора або сторінку преміум книги, щоб підписатись
            </p>
            <Link to="/catalog" className="btn-primary inline-flex items-center gap-2 mt-2">
              Перейти до каталогу
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activeSubs.map((s) => (
              <AuthorSubCard
                key={s.author_id}
                sub={s}
                onCancel={() => {
                  setCancelling(s.author_id);
                  cancel.mutate(s.author_id);
                }}
                isCancelling={cancelling === s.author_id && cancel.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* Inactive / cancelled */}
      {!subsLoading && inactiveSubs.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-slate-500" />
            Скасовані підписки
          </h2>
          <div className="space-y-3 opacity-60">
            {inactiveSubs.map((s) => (
              <AuthorSubCard key={s.author_id} sub={s} />
            ))}
          </div>
        </section>
      )}

      {/* Payment history */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-slate-400" />
          Історія платежів
        </h2>
        {historyLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
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
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-brand-500/20">
                          <Crown className="w-4 h-4 text-brand-400" />
                        </div>
                        <span className="truncate max-w-[180px]">{p.description}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">
                      {p.card_last4 ? (
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5" />
                          ****{p.card_last4}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
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
                        {" "}
                        {p.status === "succeeded" ? "Успішно" : p.status === "pending" ? "Очікує" : "Відхилено"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AuthorSubCard({
  sub,
  onCancel,
  isCancelling,
}: {
  sub: AuthorSubItem;
  onCancel?: () => void;
  isCancelling?: boolean;
}) {
  const isActive = sub.status === "active";
  const endDate = sub.end_date
    ? format(new Date(sub.end_date), "d MMMM yyyy", { locale: uk })
    : null;

  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${
      isActive
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-surface-700 bg-surface-800"
    }`}>
      {/* Avatar */}
      {sub.author_avatar_url ? (
        <img
          src={fileUrl(sub.author_avatar_url)}
          alt=""
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center text-xl font-semibold shrink-0">
          {sub.author_username[0]?.toUpperCase() ?? <UserIcon className="w-5 h-5" />}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link
          to={`/profile/${sub.author_username}`}
          className="font-semibold hover:underline text-base"
        >
          @{sub.author_username}
        </Link>
        {sub.plan_description && (
          <p className="text-xs text-slate-400 truncate">{sub.plan_description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
          <span className="font-medium text-slate-300">${sub.price_monthly.toFixed(2)}/міс</span>
          {isActive && endDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              активна до {endDate}
            </span>
          )}
          {!isActive && (
            <span className="text-slate-500">
              {sub.status === "canceled" ? "Скасована" : sub.status}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        {isActive && (
          <>
            <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Активна
            </span>
            {onCancel && (
              <button
                className="btn-ghost text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 py-1 px-2"
                onClick={onCancel}
                disabled={isCancelling}
              >
                {isCancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : "Скасувати"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
