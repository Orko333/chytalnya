import { useState, useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Book } from "@/api/types";
import BookCard from "@/components/BookCard";
import { Search, Loader2 } from "lucide-react";

const PAGE_SIZE = 24;

export default function Catalog() {
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("new");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["catalog", q, genre, sort],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const params: any = { sort, limit: PAGE_SIZE, offset: pageParam };
      if (q) params.q = q;
      if (genre) params.genre = genre;
      const { data } = await api.get<Book[]>("/api/books", { params });
      return data;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.flat().length : undefined,
  });

  // Intersection observer — load next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const books = data?.pages.flat() ?? [];
  const allGenres = Array.from(new Set(books.flatMap((b) => b.genres))).sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-slate-500">Пошук</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input className="input pl-9" placeholder="Назва, автор, опис…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Жанр</label>
          <select className="input" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">Усі</option>
            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Сортування</label>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">Нові</option>
            <option value="popular">Популярні</option>
            <option value="rating">За рейтингом</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-500 p-8 text-center">Завантаження…</div>
      ) : books.length === 0 ? (
        <div className="text-slate-500 p-8 text-center">Книг не знайдено</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {books.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
          {/* Sentinel + loader */}
          <div ref={sentinelRef} className="flex justify-center py-6">
            {isFetchingNextPage && (
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#ff8906" }} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
