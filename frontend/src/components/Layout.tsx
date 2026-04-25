import { Outlet, Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/store/auth";
import BackgroundAmbient from "@/components/BackgroundAmbient";
import { BookOpen, Bell, LogOut, User as UserIcon, Settings, Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, fileUrl } from "@/api/client";
import { useState, useEffect } from "react";

const navLinks = (user: any) => [
  { to: "/catalog", label: "Каталог", always: true },
  { to: "/favorites", label: "Обране", auth: true },
  { to: "/achievements", label: "Досягнення", auth: true },
  { to: "/author", label: "Кабінет автора", role: ["author", "admin"] },
  { to: "/admin", label: "Адмін", role: ["admin"] },
].filter((l) => {
  if (l.always) return true;
  if (l.auth && !user) return false;
  if (l.role && (!user || !l.role.includes(user.role))) return false;
  return true;
});

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const { data: unread } = useQuery({
    queryKey: ["unread"],
    queryFn: async () => {
      const { data } = await api.get("/api/notifications");
      return (data as any[]).filter((n) => !n.is_read).length;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const links = navLinks(user);

  return (
    <div className="min-h-screen flex flex-col">
      <BackgroundAmbient />
      {/* ─── Navbar ─── */}
      <header
        className="sticky top-0 z-40 transition-all duration-300"
        style={{
          background: scrolled
            ? "rgba(15,14,23,0.85)"
            : "rgba(15,14,23,0.6)",
          backdropFilter: "blur(24px) saturate(1.6)",
          WebkitBackdropFilter: "blur(24px) saturate(1.6)",
          borderBottom: scrolled
            ? "1px solid rgba(255,137,6,0.15)"
            : "1px solid rgba(53,52,74,0.4)",
          boxShadow: scrolled
            ? "0 4px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)"
            : "none",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 font-serif text-xl tracking-wider group"
            style={{ color: "#fffdf7" }}
          >
            <motion.div
              whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
              transition={{ duration: 0.4 }}
            >
              <BookOpen
                className="w-6 h-6"
                style={{ color: "#ff8906", filter: "drop-shadow(0 0 8px rgba(255,137,6,0.6))" }}
              />
            </motion.div>
            <span
              style={{
                background: "linear-gradient(135deg, #fffdf7, #ffb347)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Читальня
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 ml-4 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `nav-link px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? "active text-amber-400" : "text-parchment-300 hover:text-parchment-100"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                {/* Bell */}
                <Link
                  to="/notifications"
                  className="relative p-2 rounded-lg transition-colors hover:bg-surface-100"
                >
                  <Bell className="w-5 h-5 text-parchment-200" />
                  <AnimatePresence>
                    {!!unread && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute top-1 right-1 text-white text-[10px] rounded-full px-1"
                        style={{
                          background: "#e53e3e",
                          minWidth: "16px",
                          height: "16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          boxShadow: "0 0 8px rgba(229,62,62,0.6)",
                        }}
                      >
                        {unread}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>

                {/* Avatar dropdown */}
                <div className="relative group">
                  <button
                    className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-100 transition-colors"
                  >
                    {user.avatar_url ? (
                      <img
                        src={fileUrl(user.avatar_url)}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                        style={{ border: "1.5px solid rgba(255,137,6,0.4)" }}
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                        style={{
                          background: "linear-gradient(135deg, #ff8906, #ffb347)",
                          color: "#1a1600",
                          border: "1.5px solid rgba(255,137,6,0.4)",
                          boxShadow: "0 0 12px rgba(255,137,6,0.3)",
                        }}
                      >
                        {user.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </button>

                  {/* Dropdown */}
                  <div
                    className="absolute right-0 mt-2 w-52 hidden group-hover:block hover:block"
                    style={{
                      background: "rgba(20,19,32,0.96)",
                      border: "1px solid rgba(53,52,74,0.8)",
                      borderRadius: "0.75rem",
                      backdropFilter: "blur(20px)",
                      boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
                      padding: "4px",
                    }}
                  >
                    <Link
                      to={`/profile/${user.username}`}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-100 text-parchment-100 text-sm"
                    >
                      <UserIcon className="w-4 h-4 text-amber-400" />
                      Мій профіль
                    </Link>
                    <Link
                      to="/settings"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-100 text-parchment-100 text-sm"
                    >
                      <Settings className="w-4 h-4 text-parchment-300" />
                      Налаштування
                    </Link>
                    <div style={{ height: "1px", background: "rgba(53,52,74,0.6)", margin: "4px 8px" }} />
                    <button
                      onClick={() => { logout(); nav("/"); }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-100 text-sm"
                      style={{ color: "#f25f4c" }}
                    >
                      <LogOut className="w-4 h-4" />
                      Вийти
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost text-sm py-1.5 px-3">Увійти</Link>
                <Link to="/register" className="btn-primary text-sm py-1.5 px-4">Реєстрація</Link>
              </>
            )}

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-surface-100 transition-colors ml-1"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen
                ? <X className="w-5 h-5 text-parchment-200" />
                : <Menu className="w-5 h-5 text-parchment-200" />
              }
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden overflow-hidden"
              style={{ borderTop: "1px solid rgba(53,52,74,0.5)" }}
            >
              <div className="px-4 py-3 space-y-1">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) =>
                      `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "text-parchment-300 hover:bg-surface-100"
                      }`
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ─── Page content ─── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* ─── Footer ─── */}
      <footer
        className="py-8 text-sm text-center"
        style={{
          borderTop: "1px solid rgba(53,52,74,0.4)",
          background: "rgba(15,14,23,0.6)",
          color: "#b49a6a",
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <BookOpen className="w-4 h-4" style={{ color: "#ff8906" }} />
          <span style={{ color: "#f8f3e6", fontFamily: "'Playfair Display', serif" }}>
            Читальня
          </span>
        </div>
        <div>© {new Date().getFullYear()} — книга, яка завжди поруч</div>
      </footer>
    </div>
  );
}
