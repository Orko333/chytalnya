import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/client";
import type { Book, Progress } from "@/api/types";
import {
  ArrowLeft, FileText, Play, Pause, RotateCcw, FastForward,
  Volume2, VolumeX, BookOpen, Music2,
} from "lucide-react";

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// Animated vinyl/waveform when playing
function Visualizer({ playing }: { playing: boolean }) {
  const bars = [0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 0.45, 0.75, 0.55, 0.85, 0.65];
  return (
    <div className="flex items-end justify-center gap-[3px] h-8">
      {bars.map((h, i) => (
      <motion.div
          key={i}
          className="w-[3px] rounded-full"
          animate={playing ? {
            scaleY: [h * 0.4, h, h * 0.6, h * 0.9, h * 0.4],
            opacity: [0.6, 1, 0.7, 0.9, 0.6],
          } : { scaleY: 0.15, opacity: 0.3 }}
          transition={playing ? {
            duration: 0.8 + i * 0.07,
            repeat: Infinity,
            ease: "easeInOut",
          } : { duration: 0.4 }}
          style={{ height: "32px", transformOrigin: "bottom", background: "linear-gradient(to top, #c46700, #ff8906, #ffb347)" }}
        />
      ))}
    </div>
  );
}

export default function Player() {
  const { id } = useParams();
  const bookId = Number(id);
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [err, setErr] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const b = (await api.get<Book>(`/api/books/${bookId}`)).data;
        setBook(b);
        const p = (await api.get<Progress>(`/api/books/${bookId}/progress`)).data;
        setProgress(p);
        const BASE = import.meta.env.VITE_API_URL || "";
        const token = localStorage.getItem("access_token") || "";
        const audioUrl = `${BASE}/api/books/${bookId}/stream/audio?token=${encodeURIComponent(token)}`;
        // Pre-flight GET check to catch 403 (premium gate) before setting src
        // HEAD is not supported by the backend stream route, use GET with Range: bytes=0-0
        const check = await fetch(audioUrl, { method: "GET", headers: { Range: "bytes=0-0" } });
        if (check.status === 403) {
          setErr("Ця книга доступна лише за підпискою. Поверніться до сторінки книги.");
          return;
        }
        setSrc(audioUrl);
      } catch {
        setErr("Не вдалось завантажити аудіо");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId]);

  // Progress restore is handled in onLoadedMetadata callback once audio metadata loads

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
      audioRef.current.playbackRate = speed;
    }
  }, [volume, muted, speed]);

  function save(pos: number, completed = false) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.post(`/api/books/${bookId}/progress`, { audio_position: pos, last_mode: "audio", completed }).catch(() => {});
    }, 800);
  }

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !dur || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = frac * dur;
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  }

  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  // Error state
  if (err) return (
    <div className="-mx-4 -my-6 flex items-center justify-center min-h-[calc(100vh-64px)]"
      style={{ background: "#08070f" }}>
      <div className="text-center px-8 space-y-4">
        <Music2 className="w-16 h-16 mx-auto opacity-20" style={{ color: "#ff8906" }} />
        <div className="font-serif text-lg" style={{ color: "#ccb88f" }}>{err}</div>
        <Link to={`/books/${bookId}`} className="inline-flex items-center gap-2 text-sm"
          style={{ color: "#9d8b6e" }}>
          <ArrowLeft className="w-4 h-4" /> Назад
        </Link>
      </div>
    </div>
  );

  // Loading state
  if (loading || !book) return (
    <div className="-mx-4 -my-6 flex items-center justify-center min-h-[calc(100vh-64px)]"
      style={{ background: "#08070f" }}>
      <div className="text-center space-y-4">
        <div className="relative mx-auto w-20 h-20">
          <div className="w-20 h-20 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
          <Music2 className="absolute inset-0 m-auto w-8 h-8 opacity-40" style={{ color: "#ff8906" }} />
        </div>
        <div className="font-serif text-sm" style={{ color: "#9d8b6e" }}>Завантаження аудіо…</div>
      </div>
    </div>
  );

  const coverInitials = book.title.slice(0, 2);

  return (
    <div
      className="-mx-4 -my-6 flex flex-col items-center justify-start min-h-[calc(100vh-64px)] pb-12"
      style={{ background: "linear-gradient(160deg, #0a0815 0%, #0f0c1e 40%, #130c14 100%)" }}
    >
      {/* Back button */}
      <div className="w-full max-w-lg px-5 pt-5">
        <Link
          to={`/books/${bookId}`}
          className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-75"
          style={{ color: "#9d8b6e" }}
        >
          <ArrowLeft className="w-4 h-4" /> До книги
        </Link>
      </div>

      {/* Main player card */}
      <div className="w-full max-w-lg mx-auto px-5 mt-4">
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(30,24,50,0.95) 0%, rgba(20,16,36,0.98) 100%)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,137,6,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Cover art area */}
          <div
            className="relative flex items-center justify-center py-10 px-8"
            style={{ background: "linear-gradient(180deg, rgba(255,137,6,0.04) 0%, transparent 100%)" }}
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at center 40%, rgba(255,137,6,0.08) 0%, transparent 70%)",
              }}
            />

            {/* Cover art */}
            <motion.div
              animate={playing ? { rotate: [0, 360] } : { rotate: 0 }}
              transition={playing ? { duration: 20, repeat: Infinity, ease: "linear" } : { duration: 0.8 }}
              className="relative z-10"
              style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.7))" }}
            >
              {book.cover_url ? (
                <div className="relative w-52 h-52 rounded-full overflow-hidden"
                  style={{ boxShadow: "0 0 0 4px rgba(255,137,6,0.2), 0 0 0 8px rgba(255,137,6,0.06)" }}>
                  <img
                    src={book.cover_url}
                    alt={book.title}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {/* Vinyl center dot */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-12 rounded-full"
                      style={{ background: "rgba(10,8,18,0.85)", boxShadow: "0 0 0 2px rgba(255,137,6,0.15)" }} />
                  </div>
                </div>
              ) : (
                <div
                  className="w-52 h-52 rounded-full flex items-center justify-center text-5xl font-serif select-none"
                  style={{
                    background: "linear-gradient(135deg, #1e1230 0%, #2d1a4a 50%, #1a1030 100%)",
                    boxShadow: "0 0 0 4px rgba(255,137,6,0.2), 0 0 0 8px rgba(255,137,6,0.06)",
                    color: "#ff8906",
                  }}
                >
                  {coverInitials}
                </div>
              )}
            </motion.div>

            {/* Playing needle indicator */}
            <AnimatePresence>
              {playing && (
                <motion.div
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  className="absolute right-8 top-8"
                  style={{ color: "#ff8906", opacity: 0.5 }}
                >
                  <Music2 className="w-5 h-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Track info */}
          <div className="px-8 pb-2 text-center">
            <h2
              className="font-serif text-xl leading-snug mb-1 line-clamp-2"
              style={{ color: "#f0dfc0" }}
            >
              {book.title}
            </h2>
            <div className="text-sm" style={{ color: "#9d8b6e" }}>{book.author_name}</div>
          </div>

          {/* Visualizer */}
          <div className="flex justify-center py-3">
            <Visualizer playing={playing} />
          </div>

          {/* Progress bar */}
          <div className="px-8">
            <div
              ref={progressRef}
              className="relative h-2 rounded-full cursor-pointer group"
              style={{ background: "rgba(255,255,255,0.06)" }}
              onClick={seekTo}
            >
              {/* Filled track */}
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, #c46700, #ff8906, #ffb347)",
                }}
              />
              {/* Scrubber thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  left: `calc(${pct}% - 7px)`,
                  background: "#ff8906",
                  boxShadow: "0 0 8px rgba(255,137,6,0.7)",
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs tabular-nums" style={{ color: "#6b5a47" }}>
              <span>{fmt(cur)}</span>
              <span>-{fmt(Math.max(0, dur - cur))}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-center gap-5 px-8 py-5">
            {/* −10s */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => audioRef.current && (audioRef.current.currentTime = Math.max(0, cur - 10))}
              className="flex flex-col items-center gap-1 group"
              style={{ color: "#9d8b6e" }}
            >
              <RotateCcw className="w-6 h-6 group-hover:text-amber-400 transition-colors" />
              <span className="text-[10px] leading-none" style={{ color: "#6b5a47" }}>10</span>
            </motion.button>

            {/* Play/Pause */}
            <motion.button
              whileTap={{ scale: 0.93 }}
              whileHover={{ scale: 1.05 }}
              onClick={togglePlay}
              className="relative flex items-center justify-center w-18 h-18 rounded-full"
              style={{
                width: 72, height: 72,
                background: "linear-gradient(135deg, #d47200 0%, #ff8906 50%, #ffaa33 100%)",
                boxShadow: "0 8px 32px rgba(255,137,6,0.4), 0 0 0 1px rgba(255,137,6,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                color: "#fff",
              }}
            >
              <AnimatePresence mode="wait">
                {playing ? (
                  <motion.div key="pause" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <Pause className="w-7 h-7" />
                  </motion.div>
                ) : (
                  <motion.div key="play" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <Play className="w-7 h-7 ml-0.5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* +30s */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => audioRef.current && (audioRef.current.currentTime = Math.min(dur, cur + 30))}
              className="flex flex-col items-center gap-1 group"
              style={{ color: "#9d8b6e" }}
            >
              <FastForward className="w-6 h-6 group-hover:text-amber-400 transition-colors" />
              <span className="text-[10px] leading-none" style={{ color: "#6b5a47" }}>30</span>
            </motion.button>
          </div>

          {/* Secondary controls: volume + speed */}
          <div className="flex items-center justify-between px-8 pb-7 gap-4">
            {/* Volume */}
            <div className="flex items-center gap-2 flex-1">
              <button onClick={() => setMuted(v => !v)} style={{ color: "#9d8b6e" }}>
                {muted || volume === 0
                  ? <VolumeX className="w-4 h-4" />
                  : <Volume2 className="w-4 h-4" />
                }
              </button>
              <input
                type="range" min={0} max={1} step={0.02}
                value={muted ? 0 : volume}
                onChange={e => { setVolume(Number(e.target.value)); setMuted(false); }}
                className="flex-1 h-1 rounded-full cursor-pointer accent-amber-500"
                style={{ accentColor: "#ff8906" }}
              />
            </div>

            {/* Playback speed */}
            <div className="flex items-center gap-1">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className="px-2 py-1 rounded-md text-xs transition-all"
                  style={{
                    background: speed === s ? "rgba(255,137,6,0.2)" : "transparent",
                    color: speed === s ? "#ff8906" : "#6b5a47",
                    border: speed === s ? "1px solid rgba(255,137,6,0.3)" : "1px solid transparent",
                    fontWeight: speed === s ? 600 : 400,
                  }}
                >
                  {s === 1 ? "1×" : `${s}×`}
                </button>
              ))}
            </div>
          </div>

          {/* Read text link */}
          {book.has_text && (
            <div className="px-8 pb-7">
              <Link
                to={`/reader/${bookId}`}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-medium transition-all hover:bg-white/5"
                style={{
                  color: "#9d8b6e",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <BookOpen className="w-4 h-4" />
                Читати текст
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={e => { const t = (e.target as HTMLAudioElement).currentTime; setCur(t); save(t); }}
        onLoadedMetadata={e => {
          const el = e.target as HTMLAudioElement;
          setDur(el.duration || 0);
          if (progress?.audio_position) el.currentTime = progress.audio_position;
        }}
        onEnded={() => { setPlaying(false); save(dur, true); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
