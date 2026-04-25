import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, Headphones, FileText, Eye, CheckCircle2 } from "lucide-react";
import type { Book } from "@/api/types";
import { fileUrl } from "@/api/client";

export default function BookCard({ book, completed }: { book: Book; completed?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, scale: 1.02 }}
    >
      <Link
        to={`/books/${book.id}`}
        className="block group card-shine"
        style={{
          background: "rgba(28, 27, 46, 0.85)",
          borderRadius: "1rem",
          border: "1px solid rgba(53, 52, 74, 0.7)",
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
          transition: "box-shadow 0.3s ease, border-color 0.3s ease",
        }}
      >
        {/* Cover */}
        <div
          className="aspect-[2/3] w-full relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #252438, #1d1a2b)" }}
        >
          {book.cover_url ? (
            <img
              src={fileUrl(book.cover_url)}
              alt={book.title}
              className="w-full h-full object-cover group-hover:scale-105"
              style={{ transition: "transform 0.5s cubic-bezier(0.22,1,0.36,1)" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span
                className="font-serif text-4xl font-bold"
                style={{
                  background: "linear-gradient(135deg, #ffb347, #ff8906)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {book.title.slice(0, 2)}
              </span>
            </div>
          )}

          {/* Hover overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to top, rgba(15,14,23,0.92) 0%, rgba(15,14,23,0.4) 45%, transparent 100%)",
              opacity: 1,
              transition: "opacity 0.3s ease",
            }}
          />

          {/* Format badges */}
          <div className="absolute bottom-2 left-2 flex gap-1">

          {/* "Already read" badge — top-right corner */}
          {completed && (
            <div
              className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold z-10"
              style={{
                background: "rgba(34, 197, 94, 0.92)",
                color: "#fff",
                boxShadow: "0 2px 8px rgba(34,197,94,0.5)",
                backdropFilter: "blur(6px)",
              }}
            >
              <CheckCircle2 className="w-3 h-3" />
              Прочитано
            </div>
          )}
            {book.has_text && (
              <span
                className="badge text-[10px]"
                style={{
                  background: "rgba(37, 36, 56, 0.9)",
                  color: "#dfd2b4",
                  border: "1px solid rgba(53,52,74,0.8)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <FileText className="w-3 h-3" />
                Текст
              </span>
            )}
            {book.has_audio && (
              <span
                className="badge text-[10px]"
                style={{
                  background: "rgba(37, 36, 56, 0.9)",
                  color: "#dfd2b4",
                  border: "1px solid rgba(53,52,74,0.8)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <Headphones className="w-3 h-3" />
                Аудіо
              </span>
            )}
          </div>

        {/* Hover: quick-read overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
            style={{
              background: "linear-gradient(to bottom, transparent 20%, rgba(255,137,6,0.18) 100%)",
              transition: "opacity 0.3s ease",
            }}
          >
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: "rgba(255,137,6,0.9)",
                color: "#1a1600",
                boxShadow: "0 4px 16px rgba(255,137,6,0.5)",
                transform: "translateY(4px)",
                transition: "transform 0.3s ease",
              }}
            >
              <Eye className="w-3.5 h-3.5" />
              Читати
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col">
          <div
            className="font-semibold text-sm line-clamp-2 mb-0.5"
            style={{ color: "#fffdf7", lineHeight: 1.35, minHeight: "2.7rem" }}
          >
            {book.title}
          </div>
          <div className="text-xs mb-2 line-clamp-1" style={{ color: "#ccb88f", minHeight: "1.1rem" }}>
            {book.author_name}
          </div>
          <div
            className="flex items-center justify-between text-xs mt-auto"
            style={{ color: "#b49a6a" }}
          >
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" style={{ fill: "#ff8906", color: "#ff8906" }} />
              <span style={{ color: "#ffb347", fontWeight: 600 }}>
                {book.avg_rating.toFixed(1)}
              </span>
              <span style={{ opacity: 0.7 }}>({book.reviews_count})</span>
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {book.views}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
