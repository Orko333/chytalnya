import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Book } from "@/api/types";
import BookCard from "@/components/BookCard";

export default function Favorites() {
  const { data = [] } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => (await api.get<Book[]>("/api/books/me/favorites")).data,
  });
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Обране</h1>
      {data.length === 0 ? <div className="text-slate-500">Поки нічого не додано. Натискайте сердечко на сторінці книги ❤️</div> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {data.map((b) => <BookCard key={b.id} book={b} />)}
        </div>
      )}
    </div>
  );
}
