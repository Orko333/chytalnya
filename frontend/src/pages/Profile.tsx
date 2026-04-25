import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fileUrl } from "@/api/client";
import type { Review, AuthorSubPlan, AuthorSubStatus } from "@/api/types";
import { useAuth } from "@/store/auth";
import { Star, Crown, CheckCircle2, Calendar, Loader2, UserPlus, UserCheck, Users } from "lucide-react";
import PaymentModal from "@/components/PaymentModal";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

export default function Profile() {
  const { username } = useParams();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [subOpen, setSubOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => (await api.get(`/api/users/${username}/profile`)).data,
    enabled: !!username,
  });
  const { data: reviews = [] } = useQuery({
    queryKey: ["user-reviews", username],
    queryFn: async () => (await api.get<Review[]>(`/api/users/${username}/reviews`)).data,
    enabled: !!username,
  });

  const authorId: number | undefined = profile?.user?.id;
  const isAuthor = profile?.user?.role === "author" || profile?.user?.role === "admin";
  const isSelf = me?.id === authorId;

  const { data: authorPlan } = useQuery<AuthorSubPlan | null>({
    queryKey: ["author-plan", authorId],
    queryFn: () => api.get<AuthorSubPlan>(`/api/payments/author-plan/${authorId}`).then((r) => r.data).catch(() => null),
    enabled: !!authorId && isAuthor && !isSelf,
  });

  const { data: myAuthorSub } = useQuery<AuthorSubStatus | null>({
    queryKey: ["author-sub", authorId],
    queryFn: () => api.get<AuthorSubStatus>(`/api/payments/author-sub/${authorId}`).then((r) => r.data).catch(() => null),
    enabled: !!authorId && !!me && !isSelf,
  });

  const cancelAuthorSub = useMutation({
    mutationFn: () => api.post(`/api/payments/author/${authorId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["author-sub", authorId] }),
  });

  const followToggle = useMutation({
    mutationFn: () => api.post<{ following: boolean }>(`/api/users/${authorId}/follow`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", username] }),
  });

  if (!profile) return <div className="p-8 text-slate-500">Завантаження…</div>;

  const u = profile.user;
  const roleLabel: Record<string, string> = {
    user: "Читач",
    author: "Автор",
    admin: "Адміністратор",
  };

  const isSubActive = myAuthorSub?.status === "active";
  const subEndDate = myAuthorSub?.end_date
    ? format(new Date(myAuthorSub.end_date), "d MMMM yyyy", { locale: uk })
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="card p-6 flex items-center gap-6">
        {u.avatar_url ? (
          <img src={fileUrl(u.avatar_url)} alt="" className="w-20 h-20 rounded-full object-cover"/>
        ) : (
          <div className="w-20 h-20 rounded-full bg-brand-600 text-white flex items-center justify-center text-3xl font-semibold">{u.username[0].toUpperCase()}</div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{u.username}</h1>
            <span className="badge bg-slate-100 text-slate-600">{roleLabel[u.role] || u.role}</span>
          </div>
          {u.bio && <p className="text-slate-600 mt-1">{u.bio}</p>}
          <div className="flex gap-4 mt-2 text-sm text-slate-600">
            <span><b>{profile.reviews_count}</b> рецензій</span>
            <span><b>{profile.followers_count ?? 0}</b> підписників</span>
            <span><b>{profile.following_count ?? 0}</b> підписок</span>
          </div>
          {!isSelf && !!me && (
            <button
              className={`mt-3 btn-ghost text-sm flex items-center gap-2 ${profile.is_following ? "text-green-400 border-green-500/40" : ""}`}
              onClick={() => followToggle.mutate()}
              disabled={followToggle.isPending}
            >
              {followToggle.isPending
                ? <Loader2 className="w-4 h-4 animate-spin"/>
                : profile.is_following
                  ? <><UserCheck className="w-4 h-4"/>Ви підписані</>
                  : <><UserPlus className="w-4 h-4"/>Підписатись</>}
            </button>
          )}
          {!me && !isSelf && (
            <Link to="/login" className="mt-3 btn-ghost text-sm flex items-center gap-2 w-fit">
              <Users className="w-4 h-4"/>Увійдіть, щоб підписатись
            </Link>
          )}
        </div>
      </div>

      {/* Author subscription card */}
      {isAuthor && !isSelf && authorPlan && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-semibold mb-1">
                <Crown className="w-5 h-5"/>
                Підписка на автора
              </div>
              {authorPlan.description && (
                <p className="text-sm text-slate-400 mb-1">{authorPlan.description}</p>
              )}
              <div className="text-lg font-bold">
                ${authorPlan.price_monthly.toFixed(2)}
                <span className="text-sm font-normal text-slate-400">/міс</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {isSubActive ? (
                <>
                  <div className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4"/>
                    Ви підписані
                  </div>
                  {subEndDate && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5"/>
                      до {subEndDate}
                    </div>
                  )}
                  <button
                    className="btn-ghost text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 mt-1"
                    onClick={() => cancelAuthorSub.mutate()}
                    disabled={cancelAuthorSub.isPending}
                  >
                    {cancelAuthorSub.isPending ? <Loader2 className="w-3 h-3 animate-spin"/> : "Скасувати підписку"}
                  </button>
                </>
              ) : (
                me ? (
                  <button
                    className="btn-primary text-sm flex items-center gap-2"
                    onClick={() => setSubOpen(true)}
                  >
                    <Crown className="w-4 h-4"/>
                    Підписатись — ${authorPlan.price_monthly.toFixed(2)}/міс
                  </button>
                ) : (
                  <Link to="/login" className="btn-primary text-sm">
                    Увійдіть, щоб підписатись
                  </Link>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold mb-3">Рецензії користувача</h2>
        {reviews.length === 0 && <div className="text-slate-500">Поки немає рецензій</div>}
        <div className="space-y-3">
          {reviews.map((r) => (
            <Link key={r.id} to={`/books/${r.book_id}`} className="card p-4 block hover:shadow-md">
              <div className="flex items-center gap-2 mb-1">
                {[1,2,3,4,5].map((n) => <Star key={n} className={`w-4 h-4 ${n<=r.rating?"fill-amber-400 text-amber-400":"text-slate-300"}`}/>)}
              </div>
              <p className="text-slate-700 whitespace-pre-wrap">{r.content}</p>
            </Link>
          ))}
        </div>
      </div>

      {authorId && (
        <PaymentModal
          open={subOpen}
          onClose={() => setSubOpen(false)}
          checkoutUrl={`/api/payments/author/${authorId}/checkout`}
          confirmUrl={`/api/payments/author/${authorId}/confirm`}
          onSuccess={() => {
            setSubOpen(false);
            qc.invalidateQueries({ queryKey: ["author-sub", authorId] });
          }}
        />
      )}
    </div>
  );
}
