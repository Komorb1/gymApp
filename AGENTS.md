# AGENTS.md — GymApp

This file orients AI agents (and new human contributors) to the project. Read it before editing.

## Project

A desktop gym management system for Windows reception desks (developed on Linux). It is offline-first and currently manages one local gym without multi-branch scaffolding.

## Tech stack

- **Shell:** Tauri v2 (Rust)
- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS (logical properties only) + shadcn/ui (Radix)
- **i18n:** i18next + react-i18next — Arabic (RTL, default) + English (LTR)
- **Fonts:** Cairo (primary) / Tajawal (fallback) — loaded via Google Fonts in `index.html`
- **State:** Zustand (UI) + TanStack Query (IPC/cache)
- **DB:** SQLite via `rusqlite` + `refinery` migrations — SQL lives in Rust behind Tauri commands; the frontend never writes raw SQL
- **Forms:** react-hook-form + zod
- **Testing:** Vitest (TS) + Rust `#[test]` + migration tests

## Layout

```
gymApp/
├── src/                     # React frontend
│   ├── components/ui/       # shadcn/ui primitives (managed via `pnpm dlx shadcn@latest add ...`)
│   ├── features/            # Feature modules (members, plans, subscriptions, ...)
│   ├── hooks/               # Custom React hooks
│   ├── i18n/                # i18next config + ar.json + en.json
│   ├── lib/                 # Utilities (cn, date, ipc wrappers)
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/               # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/        # Tauri v2 permission scopes
│   ├── migrations/          # refinery SQL migrations (V001__*.sql, V002__*.sql, ...)
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── db.rs            # rusqlite connection + helpers
│       ├── session.rs       # session authentication + access checks
│       └── commands/        # Tauri IPC command handlers
└── .github/workflows/ci.yml
```

## Conventions

- **Logical CSS properties only.** Use `ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*` — never `pl-`/`pr-`/`ml-`/`mr-`/`left-`/`right-`. RTL must mirror automatically.
- **No emojis in code or comments unless the user asks.**
- **No comments** unless the user asks.
- **TypeScript strict mode** is on. Don't weaken it.
- **Foreign keys enforced** — every `rusqlite` connection runs `PRAGMA foreign_keys = ON`.
- **Member deletion** — members use `is_deleted` + `deleted_at`; their memberships remain queryable.
- **Plan deletion** — plans with membership references are deactivated rather than deleted.
- **ISO 8601 UTC** for all timestamps (`TEXT`), ISO `YYYY-MM-DD` for dates.
- **Price stored as INTEGER cents** (e.g. `5000` = 50.00); divide by 100 at display layer.
- **Schema changes use new migrations.** Never edit a migration after it has shipped.
- **Authorization is enforced in Rust.** UI visibility is not a security boundary.

## Commands

Frontend (run from repo root):

- `pnpm dev` — Vite dev server on port 1420
- `pnpm tauri dev` — full app (Tauri + Vite), launches the desktop window
- `pnpm build` — type-check + Vite production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Vitest
- `pnpm format` — Prettier write

Backend (run from `src-tauri/`):

- `cargo test` — Rust unit + migration tests
- `cargo fmt --all -- --check` — formatting check
- `cargo clippy --all-targets -- -D warnings` — lint
- `cargo tauri dev` — same as `pnpm tauri dev`
- `cargo tauri build` — production build

## shadcn/ui

Add components via:

```
pnpm dlx shadcn@latest add button card input label dialog badge table tabs
```

`components.json` is at the repo root. Components land in `src/components/ui/`.

## Git

- Don't commit unless the user explicitly asks.
- Don't update git config or skip hooks.
- Conventional commit style is fine but match the repo if it has a history.

## Implementation status

- [x] Database foundation and versioned migrations
- [x] Session-backed authentication and management/staff access levels
- [x] Members, plans, memberships, expiry dashboard, and activity history
- [x] Arabic/English and RTL/LTR interfaces
- [ ] Production updater configuration and signing
- [ ] End-to-end Windows installer verification

## Updater keys (before first release)

The updater ships with a placeholder pubkey in `tauri.conf.json`. Before tagging `v0.1.0`:

```bash
pnpm tauri signer generate -w ~/.tauri/gymapp.key
# Save the password somewhere safe.
# Copy the PUBLIC key into tauri.conf.json -> plugins.updater.pubkey
# Add repo secrets:
#   TAURI_SIGNING_PRIVATE_KEY        (contents of ~/.tauri/gymapp.key)
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# Update plugins.updater.endpoints to your real latest.json host (R2/MinIO/etc.)
```
