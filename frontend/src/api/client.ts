import axios, { AxiosError } from "axios";

const BASE = import.meta.env.VITE_API_URL || "";

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((cfg) => {
  const tok = localStorage.getItem("access_token");
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

let isRefreshing = false;
let pending: Array<(ok: boolean) => void> = [];

async function refreshTokens(): Promise<boolean> {
  const rt = localStorage.getItem("refresh_token");
  if (!rt) return false;
  try {
    const { data } = await axios.post(`${BASE}/api/auth/refresh`, { refresh_token: rt });
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const cfg: any = err.config;
    if (err.response?.status === 401 && !cfg._retry) {
      cfg._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pending.push((ok) => (ok ? resolve(api(cfg)) : reject(err)));
        });
      }
      isRefreshing = true;
      const ok = await refreshTokens();
      isRefreshing = false;
      pending.forEach((fn) => fn(ok));
      pending = [];
      if (ok) return api(cfg);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      if (location.pathname !== "/login") location.assign("/login");
    }
    return Promise.reject(err);
  }
);

export function fileUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `${BASE}${pathOrUrl}`;
}

export function streamUrl(bookId: number, kind: "text" | "audio"): string {
  const tok = localStorage.getItem("access_token") || "";
  // token sent via header by axios; for <audio> we use fetch-to-blob in player
  return `${BASE}/api/books/${bookId}/stream/${kind}`;
}
