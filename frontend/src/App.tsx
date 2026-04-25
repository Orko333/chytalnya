import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/store/auth";
import Layout from "@/components/Layout";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Catalog from "@/pages/Catalog";
import BookDetail from "@/pages/BookDetail";
import Reader from "@/pages/Reader";
import Player from "@/pages/Player";
import Profile from "@/pages/Profile";
import Achievements from "@/pages/Achievements";
import AuthorAnalytics from "@/pages/AuthorAnalytics";
import Admin from "@/pages/Admin";

import AuthorCabinet from "@/pages/AuthorCabinet";
import Notifications from "@/pages/Notifications";
import Favorites from "@/pages/Favorites";
import Settings from "@/pages/Settings";

function Guarded({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Завантаження…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/books/:id" element={<BookDetail />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="/subscriptions" element={<Navigate to="/catalog" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/reader/:id" element={<Guarded><Reader /></Guarded>} />
        <Route path="/player/:id" element={<Guarded><Player /></Guarded>} />
        <Route path="/favorites" element={<Guarded><Favorites /></Guarded>} />
        <Route path="/achievements" element={<Guarded><Achievements /></Guarded>} />
        <Route path="/notifications" element={<Guarded><Notifications /></Guarded>} />
        <Route path="/settings" element={<Guarded><Settings /></Guarded>} />

        <Route path="/author" element={<Guarded roles={["author", "admin"]}><AuthorCabinet /></Guarded>} />
        <Route path="/author/analytics/:id" element={<Guarded roles={["author", "admin"]}><AuthorAnalytics /></Guarded>} />
        <Route path="/admin" element={<Guarded roles={["admin"]}><Admin /></Guarded>} />

        <Route path="*" element={<div className="p-8 text-center">Сторінку не знайдено (404)</div>} />
      </Route>
    </Routes>
  );
}
