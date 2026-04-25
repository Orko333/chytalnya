export type User = {
  id: number; email: string; username: string; bio: string; avatar_url: string;
  role: "user" | "author" | "admin"; email_verified: boolean; created_at: string;
};
export type UserPublic = {
  id: number; username: string; bio: string; avatar_url: string; role: string; created_at: string;
};
export type Book = {
  id: number; title: string; author_name: string; description: string; cover_url: string;
  genres: string[]; language: string; is_premium: boolean; owner_id: number;
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
export type Plan = { code: string; name: string; price_monthly: number; features: string[] };
export type SubStatus = { plan_code: string; status: string; end_date: string | null };
export type Achievement = {
  id: number; code: string; name: string; description: string; icon: string;
  condition_type: string; condition_value: number; earned: boolean; earned_at: string | null;
};
export type NotificationT = {
  id: number; type: string; title: string; body: string; link: string; is_read: boolean; created_at: string;
};
export type Recommendation = { book: Book; reason: string; score: number };
export type FeedItem = { kind: string; created_at: string; actor: UserPublic; payload: any };
