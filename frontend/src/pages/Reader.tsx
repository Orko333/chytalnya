import { useEffect, useReducer, useRef, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/client";
import type { Book, Progress } from "@/api/types";
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Minus, Plus, Headphones, Pause, Play,
  RotateCcw, FastForward, BookOpen,
  Maximize2, Minimize2,
} from "lucide-react";

// ─── Text pagination ───────────────────────────────────────────────────────
const WORDS_PER_PAGE = 450;

function splitIntoPages(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [text.trim()];

  const pages: string[] = [];
  let pageParas: string[] = [];
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (wordCount + words > WORDS_PER_PAGE && pageParas.length > 0) {
      pages.push(pageParas.join("\n\n"));
      pageParas = [];
      wordCount = 0;
    }
    pageParas.push(para);
    wordCount += words;
  }
  if (pageParas.length > 0) pages.push(pageParas.join("\n\n"));
  return pages.length > 0 ? pages : [text.trim()];
}

// ─── Page flip animation variants ─────────────────────────────────────────
const pageVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 70 : -70,
    rotateY: dir > 0 ? 18 : -18,
    opacity: 0,
    scale: 0.96,
  }),
  center: { x: 0, rotateY: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({
    x: dir < 0 ? 70 : -70,
    rotateY: dir < 0 ? 18 : -18,
    opacity: 0,
    scale: 0.96,
  }),
};
const pageTransition = { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] as [number,number,number,number] };

// ─── Mini audio player ─────────────────────────────────────────────────────
function MiniAudio({
  bookId, onEnded, initialAudioPos, onProgress,
}: {
  bookId: number;
  onEnded?: () => void;
  initialAudioPos?: number;
  onProgress?: (t: number) => void;
}) {
  const [src, setSrc] = useState("");
  const [, tick] = useReducer(x => x + 1, 0); // force re-render on play/pause/ended
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekedRef = useRef(false);

  // Derive playing directly from DOM element to avoid stale state
  const playing = audioRef.current ? !audioRef.current.paused : false;

  function toggle() {
    if (!src) {
      // First click: set src directly on element and call play() within user gesture
      const BASE = import.meta.env.VITE_API_URL || "";
      const url = `${BASE}/api/books/${bookId}/stream/audio`;
      setSrc(url);
      setLoading(true);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
      return;
    }
    if (!audioRef.current) return;
    if (!audioRef.current.paused) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  }

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };
  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Always render audio so ref is available in toggle() on first click */}
      <audio
        ref={audioRef}
        onTimeUpdate={e => {
          const t = (e.target as HTMLAudioElement).currentTime;
          setCur(t);
          onProgress?.(t);
        }}
        onLoadedMetadata={e => {
          const el = e.target as HTMLAudioElement;
          setDur(el.duration);
          setLoading(false);
          if (!seekedRef.current && initialAudioPos && initialAudioPos > 0 && initialAudioPos < el.duration - 2) {
            el.currentTime = initialAudioPos;
            seekedRef.current = true;
          }
        }}
        onCanPlay={() => { setLoading(false); }}
        onError={() => { setSrc(""); setLoading(false); }}
        onPlay={tick} onPause={tick} onPlaying={tick} onWaiting={tick}
        onEnded={() => { tick(); onEnded?.(); }}
        className="hidden"
      />
      <button
        onClick={toggle} disabled={loading}
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95"
        style={{ background: "rgba(255,137,6,0.85)", color: "#fff" }}
      >
        {loading
          ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      {src && dur > 0 ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "#9d8b6e" }}>{fmt(cur)}</span>
          <div
            className="flex-1 h-1 rounded-full cursor-pointer"
            style={{ background: "rgba(255,255,255,0.1)" }}
            onClick={e => {
              if (!audioRef.current || !dur) return;
              const rect = e.currentTarget.getBoundingClientRect();
              audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
            }}
          >
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ff8906,#ffb347)" }} />
          </div>
          <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "#9d8b6e" }}>{fmt(dur)}</span>
          <button className="flex-shrink-0 opacity-60 hover:opacity-100" style={{ color: "#9d8b6e" }}
            onClick={() => audioRef.current && (audioRef.current.currentTime = Math.max(0, cur - 10))}>
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button className="flex-shrink-0 opacity-60 hover:opacity-100" style={{ color: "#9d8b6e" }}
            onClick={() => audioRef.current && (audioRef.current.currentTime = Math.min(dur, cur + 30))}>
            <FastForward className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <span className="text-xs" style={{ color: "#9d8b6e" }}>
          {loading ? "Завантаження аудіо…" : "Натисніть ▶ щоб слухати"}
        </span>
      )}
    </div>
  );
}

// ─── Main reader component ─────────────────────────────────────────────────
export default function Reader() {
  const { id } = useParams();
  const bookId = Number(id);

  const [book, setBook] = useState<Book | null>(null);
  const [rawText, setRawText] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [fontSize, setFontSize] = useState(17);
  const [showAudio, setShowAudio] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [err, setErr] = useState("");
  const [savedPos, setSavedPos] = useState(0);
  const [savedAudioPos, setSavedAudioPos] = useState(0);
  const audioPos = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pages = useMemo(() => splitIntoPages(rawText), [rawText]);
  const totalPages = pages.length;

  // Restore page after text+pages are ready
  useEffect(() => {
    if (!rawText || pages.length === 0 || savedPos === 0) return;
    const frac = Math.min(1, savedPos / rawText.length);
    setPageIndex(Math.min(pages.length - 1, Math.floor(frac * pages.length)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // Load book data and text
  useEffect(() => {
    (async () => {
      try {
        const b = (await api.get<Book>(`/api/books/${bookId}`)).data;
        setBook(b);
        const p = (await api.get<Progress>(`/api/books/${bookId}/progress`)).data;
        setSavedPos(p.text_position || 0);
        setSavedAudioPos(p.audio_position || 0);
        const r = await api.get(`/api/books/${bookId}/stream/text`, { responseType: "text" });
        setRawText(String(r.data));
      } catch {
        setErr("Не вдалось завантажити текст");
      }
    })();
  }, [bookId]);

  // Keyboard navigation
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (["ArrowRight","ArrowDown"," "].includes(e.key)) { e.preventDefault(); goTo(pageIndex + 1, 1); }
      if (["ArrowLeft","ArrowUp"].includes(e.key)) { e.preventDefault(); goTo(pageIndex - 1, -1); }
      if (e.key === "f" || e.key === "F") setFullscreen(v => !v);
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, totalPages]);

  function goTo(next: number, dir: number) {
    if (next < 0 || next >= totalPages) return;
    setDirection(dir);
    setPageIndex(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!book) return;
    const frac = totalPages > 1 ? next / (totalPages - 1) : 1;
    const charPos = Math.floor(frac * (book.total_chars || rawText.length));
    saveTimer.current = setTimeout(() => {
      api.post(`/api/books/${bookId}/progress`, {
        text_position: charPos,
        audio_position: audioPos.current > 0 ? audioPos.current : undefined,
        last_mode: "text", completed: next >= totalPages - 1,
      }).catch(() => {});
    }, 800);
  }

  if (err) return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ color: "#ccb88f" }}>
      <BookOpen className="w-12 h-12 opacity-20" style={{ color: "#ff8906" }} />
      <p className="font-serif text-sm">Текст цієї книги недоступний</p>
      <Link
        to={`/books/${bookId}`}
        className="text-xs px-4 py-2 rounded-full transition-opacity hover:opacity-75"
        style={{ background: "rgba(255,137,6,0.12)", color: "#ff8906", border: "1px solid rgba(255,137,6,0.25)" }}
      >
        ← Повернутись до книги
      </Link>
    </div>
  );

  if (!book || !rawText) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <div className="relative mx-auto w-16 h-16">
          <BookOpen className="w-16 h-16 opacity-15" style={{ color: "#ff8906" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        </div>
        <div className="font-serif text-sm" style={{ color: "#9d8b6e" }}>Завантаження книги…</div>
      </div>
    </div>
  );

  const progressPct = totalPages > 1 ? (pageIndex / (totalPages - 1)) * 100 : 100;

  // ── Shared: top control bar (used in both normal + fullscreen) ──────────────
  const TopBar = ({ inFullscreen = false }: { inFullscreen?: boolean }) => (
    <div
      className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
      style={{
        background: inFullscreen ? "rgba(5,4,12,0.96)" : "rgba(8,7,15,0.94)",
        borderBottom: "1px solid rgba(255,137,6,0.12)",
        backdropFilter: "blur(16px)",
      }}
    >
      <Link
        to={`/books/${bookId}`}
        className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-75"
        style={{ color: "#ff8906" }}
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">До книги</span>
      </Link>

      {/* Title centred */}
      <div className="hidden md:block text-center flex-1 mx-4 truncate">
        <span className="text-xs font-serif" style={{ color: "#9d8b6e" }}>
          {book.author_name} — <em>{book.title}</em>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => setFontSize(s => Math.max(13, s - 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: "#9d8b6e" }}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-7 text-center text-xs tabular-nums" style={{ color: "#ccb88f" }}>{fontSize}</span>
        <button onClick={() => setFontSize(s => Math.min(26, s + 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: "#9d8b6e" }}>
          <Plus className="w-3.5 h-3.5" />
        </button>

        {book.has_audio && (
          <button
            onClick={() => setShowAudio(v => !v)}
            className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: showAudio ? "rgba(255,137,6,0.22)" : "rgba(255,137,6,0.1)",
              color: "#ff8906",
              border: "1px solid rgba(255,137,6,0.3)",
            }}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Аудіо</span>
          </button>
        )}

        <button
          onClick={() => setFullscreen(v => !v)}
          className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: "#9d8b6e" }}
          title={inFullscreen ? "Вийти з повного екрану (F)" : "Повний екран (F)"}
        >
          {inFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );

  // ── Shared: audio bar ───────────────────────────────────────────────────────
  const AudioBar = () => (
    <AnimatePresence>
      {showAudio && book.has_audio && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden flex-shrink-0"
          style={{ background: "rgba(18,17,30,0.98)", borderBottom: "1px solid rgba(255,137,6,0.1)" }}
        >
          <div className="max-w-3xl mx-auto px-5 py-3">
            <MiniAudio
              bookId={bookId}
              onEnded={() => goTo(pageIndex + 1, 1)}
              initialAudioPos={savedAudioPos}
              onProgress={(t) => { audioPos.current = t; }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Shared: progress line ───────────────────────────────────────────────────
  const ProgressLine = () => (
    <div className="h-0.5 flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
      <motion.div
        className="h-full"
        style={{ background: "linear-gradient(90deg,#c46700,#ff8906,#ffb347)" }}
        animate={{ width: `${progressPct}%` }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );

  // ── Shared: book page content ───────────────────────────────────────────────
  const BookPage = ({ heightStyle }: { heightStyle?: React.CSSProperties }) => (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={pageIndex}
        custom={direction}
        variants={pageVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={pageTransition}
        className="h-full"
        style={{ transformOrigin: direction > 0 ? "left center" : "right center" }}
      >
        <div
          className="relative overflow-hidden flex flex-col"
          style={{
            background: "linear-gradient(160deg,#f9edd5 0%,#f2e0bc 40%,#ecdbb0 70%,#e4d0a2 100%)",
            borderRadius: "3px 8px 8px 3px",
            boxShadow: "-6px 0 16px rgba(0,0,0,0.5), 8px 0 16px rgba(0,0,0,0.3), 0 16px 48px rgba(0,0,0,0.65), inset 4px 0 8px rgba(0,0,0,0.08)",
            ...heightStyle,
          }}
        >
          {/* Spine */}
          <div className="absolute left-0 top-0 bottom-0 w-6 pointer-events-none z-10"
            style={{ background: "linear-gradient(to right,rgba(0,0,0,0.2),rgba(0,0,0,0.07) 60%,transparent)" }} />
          {/* Right edge */}
          <div className="absolute right-0 top-0 bottom-0 w-4 pointer-events-none z-10"
            style={{ background: "linear-gradient(to left,rgba(0,0,0,0.1),transparent)" }} />

          {/* Scrollable text area — fills height */}
          <div className="flex-1 overflow-y-auto relative" style={{ scrollbarWidth: "none" }}>
            <div className="px-12 pt-10 pb-4 md:px-16 md:pt-12 lg:px-20">
              {pageIndex === 0 && (
                <div className="text-center mb-6 text-sm tracking-[0.3em] select-none" style={{ color: "#8b6030", opacity: 0.35 }}>
                  ✦ ✦ ✦
                </div>
              )}
              <div
                style={{
                  fontFamily: "'Crimson Text','Georgia','Times New Roman',serif",
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.85,
                  color: "#1e0f05",
                  letterSpacing: "0.012em",
                }}
              >
                {pages[pageIndex].split("\n\n").map((para, i) => (
                  <p
                    key={i}
                    className="text-justify"
                    style={{
                      marginBottom: "0.85em",
                      textIndent: i === 0 && pageIndex === 0 ? 0 : "2.2em",
                    }}
                  >
                    {para.replace(/\n/g, " ").trim()}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Page number footer */}
          <div
            className="flex-shrink-0 flex items-center justify-center py-4 border-t"
            style={{ color: "#8b6030", fontSize: "13px", letterSpacing: "0.12em", fontFamily: "'Crimson Text',serif", borderColor: "rgba(139,96,48,0.15)" }}
          >
            <span style={{ opacity: 0.3 }}>—</span>
            <span className="mx-3">{pageIndex + 1}</span>
            <span style={{ opacity: 0.3 }}>—</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  // ── Navigation row ──────────────────────────────────────────────────────────
  const NavRow = () => (
    <div className="flex items-center justify-between mt-4 flex-shrink-0">
      <motion.button
        onClick={() => goTo(pageIndex - 1, -1)}
        disabled={pageIndex === 0}
        whileHover={pageIndex > 0 ? { x: -2 } : {}}
        whileTap={pageIndex > 0 ? { scale: 0.95 } : {}}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-all disabled:opacity-25 disabled:cursor-default"
        style={{ background: "rgba(255,137,6,0.08)", border: "1px solid rgba(255,137,6,0.2)", color: "#ff8906" }}
      >
        <ChevronLeft className="w-4 h-4" /> Назад
      </motion.button>

      <div className="text-center">
        <div className="text-xs tabular-nums" style={{ color: "#6b5a47" }}>{pageIndex + 1} / {totalPages}</div>
        <div className="text-xs mt-0.5" style={{ color: "#4a3828", opacity: 0.5 }}>{progressPct.toFixed(0)}%</div>
      </div>

      <motion.button
        onClick={() => goTo(pageIndex + 1, 1)}
        disabled={pageIndex >= totalPages - 1}
        whileHover={pageIndex < totalPages - 1 ? { x: 2 } : {}}
        whileTap={pageIndex < totalPages - 1 ? { scale: 0.95 } : {}}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-all disabled:opacity-25 disabled:cursor-default"
        style={{ background: "rgba(255,137,6,0.08)", border: "1px solid rgba(255,137,6,0.2)", color: "#ff8906" }}
      >
        Далі <ChevronRight className="w-4 h-4" />
      </motion.button>
    </div>
  );

  // ── FULLSCREEN MODE ─────────────────────────────────────────────────────────
  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: "#05040c" }}
      >
        <TopBar inFullscreen />
        <AudioBar />
        <ProgressLine />

        {/* Full-viewport book page */}
        <div className="flex-1 flex flex-col min-h-0 px-6 py-5 md:px-12 lg:px-20">
          <div className="flex-1 min-h-0" style={{ perspective: "1600px" }}>
            <BookPage heightStyle={{ height: "100%" }} />
          </div>
          <NavRow />
          <p className="text-center mt-2 text-xs pb-1" style={{ color: "#4a3828", opacity: 0.4 }}>
            ← → для навігації · F або Esc для виходу
          </p>
        </div>
      </div>
    );
  }

  // ── NORMAL MODE ─────────────────────────────────────────────────────────────
  return (
    <div className="-mx-4 -my-6" style={{ background: "#08070f", minHeight: "calc(100vh - 64px)" }}>

      {/* Sticky top bar */}
      <div className="sticky top-0 z-30">
        <TopBar />
        <AudioBar />
        <ProgressLine />
      </div>

      {/* Book stage */}
      <div className="flex flex-col items-center py-6 px-4">

        {/* Book wrapper — wider than before, capped at 5xl */}
        <div className="w-full max-w-5xl" style={{ perspective: "1600px" }}>

          {/* Page: viewport height minus navbar (~64px) and top bar (~44px) and nav (~60px) */}
          <BookPage
            heightStyle={{
              height: "calc(100vh - 64px - 44px - 60px - 48px)",
              minHeight: "520px",
            }}
          />

          <NavRow />

          <p className="text-center mt-3 text-xs pb-4" style={{ color: "#4a3828", opacity: 0.4 }}>
            ← → для навігації між сторінками · F для повного екрану
          </p>
        </div>
      </div>
    </div>
  );
}
