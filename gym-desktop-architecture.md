# GymApp Desktop Architecture

## Current scope

GymApp is an offline-first desktop application for a single gym reception desk. It manages local users, members, plans, memberships, expiry status, and an activity log. Arabic and English interfaces are supported, including RTL layout.

The document describes the implemented application only. New modules should be added when their requirements are approved rather than represented by placeholder tables, settings, or directories.

## Technology stack

| Layer           | Implementation                                                     |
| --------------- | ------------------------------------------------------------------ |
| Desktop runtime | Tauri v2                                                           |
| Frontend        | React 18, TypeScript, Vite 5                                       |
| UI              | Tailwind CSS, shadcn/ui, Radix primitives                          |
| Localization    | i18next and react-i18next                                          |
| Client data     | TanStack Query over typed Tauri IPC wrappers                       |
| Local UI state  | Zustand                                                            |
| Backend         | Rust Tauri commands                                                |
| Database        | SQLite through `rusqlite` and versioned `refinery` migrations      |
| Authentication  | Local username and Argon2-hashed PIN with in-memory session tokens |

## Repository structure

```text
gymApp/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   └── ui/
│   ├── features/
│   │   ├── activity/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── members/
│   │   ├── plans/
│   │   ├── settings/
│   │   └── subscriptions/
│   ├── hooks/
│   ├── i18n/
│   ├── lib/
│   └── stores/
├── src-tauri/
│   ├── migrations/
│   └── src/
│       ├── commands/
│       ├── db.rs
│       ├── error.rs
│       ├── lib.rs
│       ├── models.rs
│       └── session.rs
└── .github/workflows/
```

Each user-facing domain owns its React components. Shared Tauri IPC types and calls live in `src/lib/ipc.ts`; query and mutation orchestration lives in hooks. The Rust backend owns validation, authorization, transactions, SQL, and audit logging.

## Data flow

1. A user logs in with a username and PIN.
2. The Rust backend verifies the Argon2 hash and issues a random session token.
3. React hooks pass the token through typed IPC functions.
4. Every protected Rust command validates the session; management operations also validate the access level.
5. Mutations run in SQLite transactions and write their activity record before committing.

The frontend never executes SQL and is not the authorization boundary.

## Database model

| Table           | Purpose                                                  | Record lifecycle                                              |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `users`         | Login identity and `management`/`staff` access           | Deactivated with `is_active`                                  |
| `members`       | Current member profile and contact details               | Soft-deleted with `is_deleted` and `deleted_at`               |
| `plans`         | Current duration and price definitions                   | Referenced plans are deactivated; unused plans may be deleted |
| `subscriptions` | Membership history, payment, notes, and lifecycle status | Preserved; cancellation changes `status`                      |
| `activity_logs` | Before/after mutation history                            | Append-only                                                   |
| `settings`      | Singleton gym and appearance settings                    | Updated in place                                              |
| `member_flags`  | Queryable flags attached to members                      | Individual flags may be removed                               |

Money is stored as integer cents. Dates use `YYYY-MM-DD`; timestamps use ISO 8601 UTC text.

### Membership history

Every membership stores:

- `member_id` and `plan_id` foreign keys;
- a JSON snapshot containing all member details at creation time;
- a JSON snapshot containing the plan name, duration, and price at creation time;
- start and end dates;
- active, frozen, or cancelled status;
- freeze start and scheduled end dates;
- paid amount in cents;
- membership notes.

The snapshots make the membership historically accurate after the current member or plan is edited. Soft-deleting a member does not delete or hide membership rows from the membership history query.

### Schema evolution

`V001__initial.sql` represents the original database. `V002__membership_history_and_access.sql` migrates existing installations without resetting data. All future schema changes must be introduced as a new migration; released migration files must not be edited.

## Access control

| Capability                            | Staff | Management |
| ------------------------------------- | :---: | :--------: |
| View and edit members                 |  Yes  |    Yes     |
| Create and renew memberships          |  Yes  |    Yes     |
| Edit membership paid amount and notes |  Yes  |    Yes     |
| View activity history                 |  Yes  |    Yes     |
| Freeze or unfreeze memberships        |  No   |    Yes     |
| Cancel memberships                    |  No   |    Yes     |
| Delete members                        |  No   |    Yes     |
| Open and modify Plans                 |  No   |    Yes     |
| Open and modify Settings/users        |  No   |    Yes     |

Restricted navigation is hidden in React and the matching Rust commands enforce the same policy. The system prevents deactivating the current manager, removing their own management access, or leaving the application without an active management user.

## Extending the application

A new domain should be added without restructuring existing domains:

1. Add a feature directory under `src/features`.
2. Add typed IPC contracts to `src/lib/ipc.ts` and domain hooks under `src/hooks`.
3. Add a Rust command module under `src-tauri/src/commands`.
4. Enforce authorization and validation in Rust.
5. Add a new numbered migration when storage changes are required.
6. Wrap related writes and activity logging in one transaction.
7. Add matching Arabic and English translation keys and automated tests.

This approach preserves existing installations and data as features grow. Shipping new executable behavior still requires building a new application version, but it does not require rewriting the application or recreating its database.

## Build and release status

Frontend development checks are available through `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. Rust checks are `cargo test`, `cargo fmt --all -- --check`, and `cargo clippy --all-targets -- -D warnings`.

GitHub Actions contains CI and release scaffolding. A production release still requires real updater hosting, a Tauri signing key, repository secrets, and an end-to-end Windows installer test. Placeholder updater values in `src-tauri/tauri.conf.json` must be replaced before publishing.
