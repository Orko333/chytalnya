import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  motion,
  useInView,
  AnimatePresence,
} from "framer-motion";
import { useRef } from "react";
import { api } from "@/api/client";
import type { Book } from "@/api/types";
import BookCard from "@/components/BookCard";
import { BookOpen, Headphones, Users2, Trophy } from "lucide-react";
import { useAuth } from "@/store/auth";

/* ──────────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────────── */
const PARTICLES = [
  { x: 7,  y: 12, s: 2.2, d: 5.5, delay: 0.0 },
  { x: 15, y: 48, s: 1.6, d: 7.0, delay: 0.8 },
  { x: 27, y: 7,  s: 3.0, d: 6.0, delay: 1.5 },
  { x: 38, y: 32, s: 1.8, d: 8.0, delay: 0.3 },
  { x: 52, y: 68, s: 2.5, d: 5.2, delay: 2.0 },
  { x: 63, y: 18, s: 1.5, d: 6.5, delay: 1.0 },
  { x: 71, y: 55, s: 2.0, d: 7.2, delay: 0.5 },
  { x: 80, y: 33, s: 2.8, d: 5.8, delay: 1.8 },
  { x: 87, y: 64, s: 1.7, d: 6.3, delay: 0.2 },
  { x: 93, y: 10, s: 2.1, d: 7.8, delay: 1.2 },
  { x: 22, y: 78, s: 1.4, d: 6.1, delay: 2.5 },
  { x: 44, y: 88, s: 2.0, d: 5.5, delay: 1.7 },
  { x: 58, y: 83, s: 2.4, d: 7.0, delay: 0.9 },
  { x: 76, y: 88, s: 1.8, d: 6.2, delay: 3.0 },
  { x: 34, y: 54, s: 1.3, d: 8.2, delay: 1.4 },
  { x: 48, y: 23, s: 2.6, d: 5.9, delay: 0.6 },
  { x: 90, y: 40, s: 1.6, d: 6.8, delay: 2.2 },
  { x: 5,  y: 72, s: 2.3, d: 7.4, delay: 1.1 },
];

const FEATURES = [
  {
    icon: <Headphones className="w-6 h-6" />,
    title: "Текст ↔ Аудіо",
    body: "Безшовна синхронізація прогресу між читанням і слуханням.",
    color: "rgba(255,137,6,0.9)",
  },
  {
    icon: <Users2 className="w-6 h-6" />,
    title: "Ком'юніті",
    body: "Рецензії, вкладені обговорення, підписки на авторів та читачів.",
    color: "rgba(120,110,200,0.9)",
  },
  {
    icon: <Trophy className="w-6 h-6" />,
    title: "Досягнення",
    body: "Отримуйте бейджі за прочитане та активність у спільноті.",
    color: "rgba(255,183,71,0.9)",
  },
];

const HERO_WORDS = ["Книга,", "яка", "завжди", "поруч"];

/* ──────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────── */
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top:  `${p.y}%`,
            width:  p.s,
            height: p.s,
            background: "rgba(255,137,6,0.85)",
            boxShadow: `0 0 ${p.s * 4}px rgba(255,137,6,0.7)`,
            animation: `particle-drift ${p.d}s ${p.delay}s ease-in-out infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 1.0, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const { data: trending = [] } = useQuery({
    queryKey: ["trending"],
    queryFn: async () => (await api.get<Book[]>("/api/recommendations/trending?limit=6")).data,
  });
  const { data: newBooks = [] } = useQuery({
    queryKey: ["new"],
    queryFn: async () => (await api.get<Book[]>("/api/recommendations/new?limit=6")).data,
  });

  return (
    <div className="space-y-24">

      {/* ══════════════════════════════════════════════
          HERO
          ══════════════════════════════════════════════ */}
      <section
        className="relative rounded-3xl overflow-hidden hero-grid"
        style={{
          minHeight: "580px",
          background: "linear-gradient(145deg, #1d1a2b 0%, #0f0e17 70%)",
          border: "1px solid rgba(255,137,6,0.18)",
          boxShadow:
            "0 0 0 1px rgba(255,137,6,0.06), " +
            "0 40px 100px rgba(0,0,0,0.7), " +
            "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Ambient blobs */}
        <div
          className="absolute -right-32 -top-32 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(255,137,6,0.2), transparent 70%)",
            animation: "glow-pulse-kf 10s ease-in-out infinite",
            willChange: "transform, opacity",
          }}
        />
        <div
          className="absolute -left-20 bottom-0 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(76,71,111,0.4), transparent 70%)",
            animation: "glow-pulse-kf 12s 2s ease-in-out infinite",
            willChange: "transform, opacity",
          }}
        />

        {/* Particle field */}
        <Particles />

        {/* Content */}
        <div className="relative z-10 p-8 md:p-14 max-w-3xl">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex items-center gap-3 mb-6"
          >
            <span
              className="h-px w-10 flex-shrink-0"
              style={{ background: "linear-gradient(90deg, #ff8906, transparent)" }}
            />
            <span
              className="text-xs tracking-[0.3em] uppercase font-bold"
              style={{ color: "#ff8906", textShadow: "0 0 12px rgba(255,137,6,0.6)" }}
            >
              Темна академія читання
            </span>
          </motion.div>

          {/* Headline — each word fades up with stagger */}
          <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 leading-tight">
            {HERO_WORDS.map((word, i) => (
              <motion.span
                key={word + i}
                className="inline-block mr-4"
                initial={{ opacity: 0, y: 32, rotateX: -20 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{
                  duration: 1.0,
                  delay: 0.15 + i * 0.16,
                  ease: "easeOut",
                }}
                style={
                  i === 3
                    ? {
                        background: "linear-gradient(135deg, #ffb347 0%, #ff8906 40%, #f25f4c 100%)",
                        backgroundSize: "200% auto",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        animation: "shimmer-text 4s linear infinite",
                      }
                    : { color: "#fffdf7" }
                }
              >
                {word}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.85, ease: "easeOut" }}
            className="text-lg mb-9 max-w-xl leading-relaxed"
            style={{ color: "#dfd2b4" }}
          >
            Читайте, слухайте та обговорюйте — у єдиному просторі.
            Починайте з тексту, продовжуйте з аудіо — прогрес синхронізується автоматично.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1, ease: "easeOut" }}
            className="flex flex-wrap gap-3"
          >
            <Link to="/catalog" className="btn-primary text-sm px-6 py-3 gap-2">
              <BookOpen className="w-4 h-4" />
              До каталогу
            </Link>
            {!user && (
              <Link to="/register" className="btn-secondary text-sm px-6 py-3">
                Створити акаунт →
              </Link>
            )}
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: "linear-gradient(to top, #0f0e17, transparent)" }}
        />
      </section>

      {/* ══════════════════════════════════════════════
          FEATURES
          ══════════════════════════════════════════════ */}
      <AnimatedSection>
        <div className="text-center mb-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2
              className="font-serif text-3xl md:text-4xl font-bold mb-3"
              style={{
                background: "linear-gradient(135deg, #fffdf7 30%, #ffb347 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Все що потрібно читачеві
            </h2>
            <p className="text-sm" style={{ color: "#b49a6a" }}>
              Один простір. Безліч можливостей.
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.1, duration: 0.8, ease: "easeOut" }}
              className="glow-card card-shine p-6 cursor-default"
              style={{
                border: "1px solid rgba(53,52,74,0.6)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <div
                className="icon-container w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: `${f.color.replace("0.9", "0.12")}`,
                  border: `1px solid ${f.color.replace("0.9", "0.25")}`,
                  color: f.color,
                }}
              >
                {f.icon}
              </div>
              <div className="font-semibold mb-2 text-base" style={{ color: "#f8f3e6" }}>
                {f.title}
              </div>
              <div className="text-sm leading-relaxed" style={{ color: "#b49a6a" }}>
                {f.body}
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ══════════════════════════════════════════════
          TRENDING
          ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {trending.length > 0 && (
          <AnimatedSection>
            <div className="flex items-center justify-between mb-6">
              <h2
                className="font-serif text-2xl md:text-3xl font-bold"
                style={{
                  background: "linear-gradient(135deg, #fffdf7 30%, #ffb347 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                🔥 Популярне
              </h2>
              <Link
                to="/catalog"
                className="text-sm font-medium transition-colors hover:text-amber-300"
                style={{ color: "#ff8906" }}
              >
                Усі книги →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {trending.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.7, ease: "easeOut" }}
                >
                  <BookCard book={b} />
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════
          NEW ARRIVALS
          ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {newBooks.length > 0 && (
          <AnimatedSection>
            <div className="flex items-center justify-between mb-6">
              <h2
                className="font-serif text-2xl md:text-3xl font-bold"
                style={{
                  background: "linear-gradient(135deg, #fffdf7 30%, #ffb347 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                ✨ Нові надходження
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {newBooks.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.7, ease: "easeOut" }}
                >
                  <BookCard book={b} />
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════
          CTA BANNER
          ══════════════════════════════════════════════ */}
      <AnimatedSection>
        <div
          className="relative rounded-3xl overflow-hidden hero-grid"
          style={{
            background: "linear-gradient(135deg, rgba(28,27,46,0.97) 0%, rgba(15,14,23,0.99) 100%)",
            border: "1px solid rgba(255,137,6,0.2)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.06), " +
              "0 0 0 1px rgba(255,137,6,0.06), " +
              "0 30px 80px rgba(0,0,0,0.5)",
          }}
        >
          {/* Shimmer orb */}
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,137,6,0.18), transparent 65%)" }}
          />

          <div className="relative z-10 py-14 px-8 md:py-20 md:px-16 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              <h2 className="font-serif text-3xl md:text-5xl font-bold mb-5 shimmer-text">
                Почніть читати вже сьогодні
              </h2>
              <p
                className="mb-8 text-base md:text-lg max-w-lg mx-auto leading-relaxed"
                style={{ color: "#dfd2b4" }}
              >
                Безкоштовна реєстрація. Тисячі книг доступні одразу.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                {!user ? (
                  <>
                    <Link to="/register" className="btn-primary px-8 py-3.5 text-base">
                      Реєстрація безкоштовно
                    </Link>
                    <Link to="/catalog" className="btn-secondary px-8 py-3.5 text-base">
                      Переглянути каталог
                    </Link>
                  </>
                ) : (
                  <Link to="/catalog" className="btn-primary px-8 py-3.5 text-base">
                    Переглянути каталог
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}
