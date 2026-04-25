import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fileUrl } from "@/api/client";
import type { Review } from "@/api/types";
import { useAuth } from "@/store/auth";
import { UserPlus, UserCheck, Star } from "lucide-react";

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

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

  const follow = useMutation({
    mutationFn: async () => (await api.post(`/api/users/${profile.user.id}/follow`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", username] }),
  });

  if (!profile) return <div className="p-8 text-slate-500">Завантаження…</div>;

  const u = profile.user;
  const roleLabel: Record<string, string> = {
    user: "Читач",
    author: "Автор",
    admin: "Адміністратор",
  };
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
            <span><b>{profile.books_completed}</b> завершено</span>
            <span><b>{profile.followers_count}</b> підписників</span>
            <span><b>{profile.following_count}</b> стежить</span>
          </div>
        </div>
        {user && !profile.is_me && (
          <button className={profile.is_following ? "btn-secondary" : "btn-primary"} onClick={() => follow.mutate()}>
            {profile.is_following ? <><UserCheck className="w-4 h-4"/>Ви підписані</> : <><UserPlus className="w-4 h-4"/>Підписатись</>}
          </button>
        )}
      </div>

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
    </div>
  );
}
