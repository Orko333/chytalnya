export type User = {
  id: number; email: string; username: string; bio: string; avatar_url: string;
  role: "user" | "author" | "admin"; email_verified: boolean; created_at: string;
};
export type UserPublic = {
  id: number; username: string; bio: string; avatar_url: string; role: string; created_at: string;
};
export type Book = {
  id: number; title: string; author_name: string; description: string; cover_url: string;
  genres: string[]; language: string; is_premium: boolean; owner_id: number; owner_username: string;
  has_text: boolean; has_audio: boolean; audio_url: string; text_url: string;
  total_chars: number; total_seconds: number;
  status: string; views: number; avg_rating: number; reviews_count: number; created_at: string;
};
export type Progress = {
  book_id: number; text_position: number; audio_position: number;
  last_mode: "text" | "audio"; completed: boolean; updated_at: string;
};
export type Review = {
  id: number; user: UserPublic; book_id: number; rating: number;
  content: string; created_at: string; comments_count: number;
};
export type Comment = {
  id: number; user: UserPublic; review_id: number; parent_id: number | null;
  content: string; created_at: string;
};
export type Achievement = {
  id: number; code: string; name: string; description: string; icon: string;
  condition_type: string; condition_value: number; earned: boolean; earned_at: string | null;
};
export type NotificationT = {
  id: number; type: string; title: string; body: string; link: string; is_read: boolean; created_at: string;
};
export type Recommendation = { book: Book; reason: string; score: number };
export type FeedItem = { kind: string; created_at: string; actor: UserPublic; payload: any };

// ── Subscriptions & Payments ──────────────────────────────────────────────────
export type SubStatus = {
  plan_code: string; status: string; end_date: string | null;
};
export type Plan = {
  code: string; name: string; price_monthly: number; features: string[];
};
export type CheckoutInit = {
  payment_id: number; amount: number; currency: string; description: string;
};
export type PaymentItem = {
  id: number; kind: string; amount: number; currency: string;
  status: string; card_last4: string; description: string; created_at: string;
};
export type AuthorSubPlan = {
  author_id: number; price_monthly: number; description: string; is_active: boolean;
};
export type AuthorSubStatus = {
  author_id: number; status: string; end_date: string | null;
};
export type BookAccess = {
  can_access: boolean; reason: string; is_premium: boolean;
  requires: "login" | "platform_premium" | "author_sub" | null;
  author_sub_price: number | null; platform_sub_price: number;
};
