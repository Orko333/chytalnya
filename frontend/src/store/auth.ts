import { create } from "zustand";
import { api } from "@/api/client";
import type { User } from "@/api/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  async init() {
    const tok = localStorage.getItem("access_token");
    if (!tok) { set({ loading: false }); return; }
    try {
      const { data } = await api.get<User>("/api/auth/me");
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  async login(email, password) {
    const { data } = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    await get().refreshMe();
  },
  async register(email, username, password) {
    const { data } = await api.post("/api/auth/register", { email, username, password });
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    await get().refreshMe();
  },
  logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null });
  },
  async refreshMe() {
    try {
      const { data } = await api.get<User>("/api/auth/me");
      set({ user: data });
    } catch { /* ignore */ }
  },
}));
