import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, fileUrl } from "@/api/client";
import type { Book, Review, Comment, BookAccess } from "@/api/types";
import { useAuth } from "@/store/auth";
import { Star, Headphones, FileText, Heart, MessageCircle, Flag, Trash2, Crown, Lock } from "lucide-react";
import PaymentModal from "@/components/PaymentModal";

export default function BookDetail() {
  const { id } = useParams();
  const bookId = Number(id);
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [authorSubOpen, setAuthorSubOpen] = useState(false);

  const { data: book } = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => (await api.get<Book>(`/api/books/${bookId}`)).data,
    enabled: !!bookId,
  });
  const { data: access } = useQuery<BookAccess>({
    queryKey: ["book-access", bookId],
    queryFn: () => api.get<BookAccess>(`/api/books/${bookId}/access`).then((r) => r.data),
    enabled: !!bookId,
  });
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", bookId],
    queryFn: async () => (await api.get<Review[]>(`/api/books/${bookId}/reviews`)).data,
    enabled: !!bookId,
  });
  const { data: fav } = useQuery({
    queryKey: ["fav", bookId, user?.id],
    queryFn: async () => (await api.get(`/api/books/me/favorites`)).data.some((b: Book) => b.id === bookId),
    enabled: !!user && !!bookId,
  });

  const toggleFav = useMutation({
    mutationFn: async () => (await api.post(`/api/books/${bookId}/favorite`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fav", bookId] }),
  });

  const submitReview = useMutation({
    mutationFn: async () => (await api.post("/api/reviews", { book_id: bookId, rating, content: reviewText })).data,
    onSuccess: () => { setReviewText(""); qc.invalidateQueries({ queryKey: ["reviews", bookId] }); },
  });

  const reportBook = useMutation({
    mutationFn: async () => (await api.post("/api/reports", { content_type: "book", content_id: bookId, reason: "Порушення правил" })).data,
    onSuccess: () => alert("Скаргу надіслано модераторам"),
  });

  if (!book) return <div className="p-8 text-slate-500">Завантаження…</div>;

  const alreadyReviewed = reviews.some((r) => r.user.id === user?.id);

  return (
    <>
      <div className="grid md:grid-cols-[280px_1fr] gap-8">
      <aside>
        <div className="aspect-[2/3] rounded-xl overflow-hidden bg-gradient-to-br from-brand-100 to-brand-300 mb-4 flex items-center justify-center relative">
          {book.cover_url ? <img src={fileUrl(book.cover_url)} alt="" className="w-full h-full object-cover"/> : (
            <span className="text-brand-900 text-5xl font-serif">{book.title.slice(0,2)}</span>
          )}
          {book.is_premium && (
            <div className="absolute top-2 right-2 bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Crown className="w-3 h-3"/>ПРЕМІУМ
            </div>
          )}
        </div>
        <div className="space-y-2">
          {/* Paywall if premium and no access */}
          {access && access.is_premium && !access.can_access ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <Lock className="w-4 h-4"/>
                Преміум книга
              </div>
              <p className="text-xs text-slate-400">Для читання потрібна підписка</p>

              {access.requires === "login" && (
                <Link to="/login" className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                  Увійдіть, щоб читати
                </Link>
              )}

              {access.requires !== "login" && (
                <div className="space-y-2">
                  {/* Subscribe to this author */}
                  {access.author_sub_price != null && (
                    <button
                      className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                      onClick={() => setAuthorSubOpen(true)}
                    >
                      <Crown className="w-4 h-4"/>
                      Підписка на автора — ${access.author_sub_price}/міс
                    </button>
                  )}

                  {/* Author has no plan */}
                  {access.requires === "no_plan" && (
                    <p className="text-xs text-slate-400 text-center py-2">
                      Автор ще не налаштував платну підписку
                    </p>
                  )}

                  {/* Author profile link */}
                  {book.owner_username && (
                    <Link
                      to={`/profile/${book.owner_username}`}
                      className="text-xs text-slate-400 hover:text-brand-400 text-center block pt-1"
                    >
                      Профіль автора @{book.owner_username} →
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {book.has_text && <Link to={`/reader/${book.id}`} className="btn-primary w-full"><FileText className="w-4 h-4"/>Читати</Link>}
              {(book.has_audio || book.has_text) && <Link to={`/player/${book.id}`} className="btn-secondary w-full"><Headphones className="w-4 h-4"/>Слухати</Link>}
            </>
          )}
          {user && <button onClick={() => toggleFav.mutate()} className="btn-secondary w-full"><Heart className={`w-4 h-4 ${fav?"fill-red-500 text-red-500":""}`}/>{fav?"В обраному":"Додати в обране"}</button>}
          {user && <button onClick={() => reportBook.mutate()} className="btn-ghost w-full text-red-600"><Flag className="w-4 h-4"/>Поскаржитись</button>}
          {user?.id === book.owner_id && <Link to={`/author/analytics/${book.id}`} className="btn-secondary w-full">Аналітика</Link>}
        </div>
      </aside>

      <div>
        <div className="flex flex-wrap gap-2 mb-2">
          {book.genres.map((g) => <span key={g} className="badge bg-slate-100 text-slate-700">{g}</span>)}
          <span className="badge bg-slate-100 text-slate-600">{book.language.toUpperCase()}</span>
        </div>
        <h1 className="text-3xl font-bold mb-1">{book.title}</h1>
        <div className="text-slate-600 mb-3">
          {book.owner_username
            ? <Link to={`/profile/${book.owner_username}`} className="hover:underline hover:text-brand-600">{book.author_name}</Link>
            : book.author_name}
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
          <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-amber-400 text-amber-400"/>{book.avg_rating.toFixed(1)} ({book.reviews_count} рецензій)</span>
          <span>{book.views} переглядів</span>
        </div>
        <p className="text-slate-700 leading-relaxed mb-8 whitespace-pre-wrap">{book.description}</p>

        <section className="space-y-4">
          <h2 className="text-xl font-bold">Рецензії</h2>
          {user && !alreadyReviewed && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-slate-600">Ваша оцінка:</span>
                {[1,2,3,4,5].map((n) => (
                  <button key={n} onClick={() => setRating(n)}>
                    <Star className={`w-6 h-6 ${n<=rating?"fill-amber-400 text-amber-400":"text-slate-300"}`}/>
                  </button>
                ))}
              </div>
              <textarea className="input" rows={3} placeholder="Ваші враження (необовʼязково)…" value={reviewText} onChange={(e)=>setReviewText(e.target.value)}/>
              <button className="btn-primary mt-3" onClick={() => submitReview.mutate()} disabled={submitReview.isPending}>Опублікувати</button>
            </div>
          )}

          {reviews.length === 0 && <div className="text-slate-500">Поки немає рецензій. Будьте першим!</div>}

          {reviews.map((r) => <ReviewItem key={r.id} review={r} bookId={bookId} />)}
        </section>
      </div>
    </div>

    {/* Author subscription modal */}
    {book.owner_id && (
      <PaymentModal
        open={authorSubOpen}
        onClose={() => setAuthorSubOpen(false)}
        checkoutUrl={`/api/payments/author/${book.owner_id}/checkout`}
        confirmUrl={`/api/payments/author/${book.owner_id}/confirm`}
        onSuccess={() => {
          setAuthorSubOpen(false);
          qc.invalidateQueries({ queryKey: ["book-access", bookId] });
        }}
      />
    )}
    </>
  );
}

function ReviewItem({ review, bookId }: { review: Review; bookId: number }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", review.id],
    queryFn: async () => (await api.get<Comment[]>(`/api/reviews/${review.id}/comments`)).data,
    enabled: open,
  });

  const addComment = useMutation({
    mutationFn: async () => (await api.post(`/api/reviews/${review.id}/comments`, { content: replyText, parent_id: replyTo })).data,
    onSuccess: () => { setReplyText(""); setReplyTo(null); qc.invalidateQueries({ queryKey: ["comments", review.id] }); },
  });

  const delReview = useMutation({
    mutationFn: async () => (await api.delete(`/api/reviews/${review.id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", bookId] }),
  });

  const canDelete = user && (user.id === review.user.id || user.role === "admin");

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <Link to={`/profile/${review.user.username}`} className="flex items-center gap-2 font-medium">
          <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm">{review.user.username[0].toUpperCase()}</div>
          {review.user.username}
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex">{[1,2,3,4,5].map((n) => <Star key={n} className={`w-4 h-4 ${n<=review.rating?"fill-amber-400 text-amber-400":"text-slate-300"}`}/>)}</div>
          {canDelete && <button onClick={() => delReview.mutate()} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>}
        </div>
      </div>
      {review.content && <p className="text-slate-700 mb-2 whitespace-pre-wrap">{review.content}</p>}
      <button onClick={() => setOpen(!open)} className="text-sm text-slate-500 hover:text-brand-700 flex items-center gap-1">
        <MessageCircle className="w-4 h-4"/>{review.comments_count} коментарів
      </button>

      {open && (
        <div className="mt-3 space-y-2 pl-4 border-l-2 border-slate-100">
          {comments.filter((c) => !c.parent_id).map((c) => (
            <CommentNode key={c.id} comment={c} all={comments} onReply={setReplyTo} />
          ))}
          {user && (
            <div className="flex gap-2 pt-2">
              <input className="input flex-1" placeholder={replyTo?`Відповідь…`:"Ваш коментар…"} value={replyText} onChange={(e)=>setReplyText(e.target.value)}/>
              {replyTo && <button className="btn-ghost text-xs" onClick={()=>setReplyTo(null)}>Скасувати</button>}
              <button className="btn-primary" disabled={!replyText.trim()} onClick={() => addComment.mutate()}>Надіслати</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommentNode({ comment, all, onReply }: { comment: Comment; all: Comment[]; onReply: (id: number) => void }) {
  const children = all.filter((c) => c.parent_id === comment.id);
  return (
    <div>
      <div className="text-sm">
        <Link to={`/profile/${comment.user.username}`} className="font-medium">{comment.user.username}</Link>
        <span className="text-slate-700 ml-2">{comment.content}</span>
        <button onClick={() => onReply(comment.id)} className="text-xs text-slate-400 ml-2 hover:text-brand-700">Відповісти</button>
      </div>
      {children.length > 0 && (
        <div className="ml-4 mt-1 space-y-1 border-l border-slate-100 pl-2">
          {children.map((c) => <CommentNode key={c.id} comment={c} all={all} onReply={onReply} />)}
        </div>
      )}
    </div>
  );
}
