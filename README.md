# 📖 Читальня

Hybrid Spotify-+-Instagram platform for books: read text, listen to audio, sync progress across both, follow authors and readers, leave reviews with nested discussions, collect achievements, subscribe to premium content.

Coursework project — built entirely on free tiers.

---

## Stack

| Layer    | Tech                                                                  |
|----------|-----------------------------------------------------------------------|
| Backend  | FastAPI · SQLAlchemy 2 · Pydantic v2 · JWT · aiosmtplib · scikit-learn |
| Frontend | React 18 · Vite · TypeScript · Tailwind · TanStack Query · Zustand    |
| Storage  | SQLite (dev) / Postgres (prod) · Local filesystem for media           |
| Payments | Stripe (demo-mode fallback when no key)                               |
| Email    | Gmail SMTP (App Password)                                             |
| Deploy   | Render (backend) · Vercel (frontend) — both free                       |

---

## Features

- 🔐 JWT auth (access + refresh) with password reset via email
- 📚 Book catalogue: text (.txt/.md) + audio (.mp3/.m4a), covers, genres, language
- 🔄 **Seamless text↔audio sync** — close the reader at character 1240, open the player, resumes at matching timestamp (and vice versa)
- 🔒 JWT-gated streaming with HTTP Range support
- ⭐ Ratings, reviews, nested threaded comments, follow feed, favorites, reports
- 🏆 Achievement engine (9 badges, auto-awarded)
- 🧠 TF-IDF content recommender + trending/new sections
- 👑 Premium subscriptions (Stripe checkout, demo fallback)
- ✍️ Author cabinet with upload + analytics (views / reads / listens / completes / favorites / rating)
- 🛡️ Admin panel: user management, reports, content moderation, site stats

---

## Local development

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill SMTP creds if you want real emails
python seed.py              # creates chytalnya.db + demo data
uvicorn app.main:app --reload --port 8000
```

API: <http://127.0.0.1:8000> · OpenAPI: <http://127.0.0.1:8000/docs>

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

UI: <http://localhost:5173> (Vite proxies `/api` and `/uploads` to backend).

### Demo accounts

| Role   | Email                    | Password    |
|--------|--------------------------|-------------|
| Reader | reader@chytalnya.app     | reader1234  |
| Author | author@chytalnya.app     | author1234  |
| Admin  | admin@chytalnya.app      | admin1234   |

---

## Gmail SMTP setup

1. Turn on 2-Step Verification on the Gmail account.
2. Generate an **App Password** at <https://myaccount.google.com/apppasswords>.
3. In `backend/.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=a7654837383@gmail.com
   SMTP_PASSWORD=<16-char app password, no spaces>
   SMTP_FROM=a7654837383@gmail.com
   SMTP_TLS=true
   PUBLIC_FRONTEND_URL=https://your-frontend.vercel.app
   ```
4. Password-reset emails will now be delivered to real inboxes.

Without SMTP config, the reset endpoint still returns `{"status":"ok"}` (to avoid email enumeration) — the reset link is logged to the server console.

---

## Deploy (free)

### Backend → Render

1. Push the repo to GitHub.
2. Render → New → Web Service → connect repo → select `backend/` as root.
3. Render reads `backend/render.yaml` / `Procfile`:
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables: copy from `.env.example`, set `JWT_SECRET`, SMTP config, `DATABASE_URL` (Render can provision free Postgres), `PUBLIC_FRONTEND_URL` = Vercel URL, `CORS_ORIGINS` = Vercel URL.
5. Add a Render persistent disk mounted at `/opt/render/project/src/uploads` (1 GB free) so user uploads survive restarts, or swap `app/core/storage.py` for S3/R2.
6. After first deploy, open a Render shell and run `python seed.py` once.

### Frontend → Vercel

1. Vercel → Import Project → pick `frontend/`.
2. Env var `VITE_API_URL=https://<your-render-service>.onrender.com`
3. Deploy. `vercel.json` already rewrites all SPA routes to `index.html`.

---

## Security checklist

- Passwords hashed with bcrypt (passlib)
- JWT with separate access/refresh; refresh issues new pair
- All file uploads validated by extension whitelist
- Premium content gated server-side (`/stream/*` returns 402)
- Email enumeration prevented in forgot-password
- CORS restricted via `CORS_ORIGINS`
- No secrets in frontend bundle
- Content reports + admin moderation for UGC

---

## Project structure

```
backend/
  app/
    core/       # config, db, security, email, storage
    routers/    # auth, books, social, recommendations, achievements, subscriptions, author, admin
    services/   # achievements, recommender (TF-IDF + collab)
    main.py     # FastAPI app
  seed.py       # demo data
  requirements.txt
  render.yaml · Procfile
frontend/
  src/
    api/        # axios client + types
    components/ # Layout, BookCard
    pages/      # Landing, Login, Register, ForgotPassword, ResetPassword,
                # Catalog, BookDetail, Reader, Player, Profile, Feed,
                # Favorites, Notifications, Achievements, Subscriptions,
                # AuthorCabinet, AuthorAnalytics, Admin, Settings
    store/      # zustand auth store
  vite.config.ts · tailwind.config.js · vercel.json
```
