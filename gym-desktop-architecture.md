# Gym Management System — Desktop Architecture & Technical Specification

## 1. Executive Summary & Tech Stack Overview

A high-performance, lightweight, multi-platform desktop application engineered primarily for Windows reception desks with a development environment on Linux. The system is designed to be offline-first, extensible for multi-branch sync, fully localized in English and Arabic (RTL), and packaged into ultra-compact installers.

| Architectural Layer | Technology Choice | Rationale & Specifications |
| :--- | :--- | :--- |
| **Desktop Shell** | **Tauri v2** (Rust) | Minimal RAM footprint (~30–40 MB idle), native OS integration, small bundle size. |
| **Frontend Framework** | **React 18/19 + TypeScript (Vite)** | High developer velocity, strong type safety, mature component ecosystem. |
| **Styling & Design System** | **Tailwind CSS + CSS Logical Properties** | Modern dark/light gym styling with zero-effort RTL layout mirroring. |
| **UI Components** | **shadcn/ui (Radix Primitives)** | Accessible, customizable components (data tables, dialogs, badges, metric cards). |
| **Localization (i18n)** | **i18next + react-i18next** | Dynamic language & document direction (`ltr` / `rtl`) switching on runtime. |
| **Typography** | **Cairo / Tajawal** (Embedded WebFonts) | Optimal geometric harmony and high readability for paired Arabic & English UI. |
| **Embedded Database** | **SQLite** (`tauri-plugin-sql` / `rusqlite`) | Zero-config, ACID-compliant local storage ensuring 100% offline desk uptime. |
| **Hardware Integration** | **Rust Native IO & Serial Crates** | Seamless connection to USB HID barcode/RFID readers and ESC/POS thermal receipt printers. |
| **CI/CD & Delivery** | **GitHub Actions (Private Repo)** | Automated Windows (`.msi` / `.exe`) cross-compilation and artifact generation. |

---

## 2. Directory & Modular Architecture

The application adopts a feature-driven modular structure to facilitate frictionless feature expansion over time.

```text
gym-desktop-app/
├── .github/
│   └── workflows/
│       └── release.yml             # Automated Windows & Linux build pipeline
├── src-tauri/                       # Rust Backend & Native Bindings
│   ├── Cargo.toml
│   ├── tauri.conf.json              # App configuration, window bounds, security scopes
│   ├── migrations/                  # SQLite versioned database schema migrations
│   └── src/
│       ├── main.rs                  # Application bootstrap & plugin registration
│       ├── commands/                # Tauri IPC command handlers
│       │   ├── printer.rs           # ESC/POS thermal printing routines
│       │   ├── scanner.rs           # Barcode & RFID reader serial listeners
│       │   └── backup.rs            # SQLite database snapshot & export handlers
│       └── db.rs                    # Connection pool & query helpers
├── src/                             # React / TypeScript Frontend
│   ├── assets/                      # Icons, logos, and embedded font binaries
│   ├── components/                  # Shared UI primitives (Buttons, Inputs, Modals, Tables)
│   ├── features/                    # Feature modules (Domain-driven)
│   │   ├── members/                 # Member enrollment, profile, ID card generation
│   │   ├── subscriptions/           # Membership plans, renewal flows, expiry alerts
│   │   ├── attendance/              # Real-time check-in stream, manual overrides
│   │   ├── pos/                     # Point of sale: water, supplements, custom invoices
│   │   └── reports/                 # Attendance metrics, revenue analytics, charts
│   ├── hooks/                       # Custom React hooks (useScanner, useTheme, useI18n)
│   ├── i18n/                        # Localization dictionaries
│   │   ├── ar.json                  # Arabic strings (RTL)
│   │   ├── en.json                  # English strings (LTR)
│   │   └── config.ts                # i18next initialization logic
│   ├── lib/                         # Utilities, SQLite client wrappers, date-fns helpers
│   ├── App.tsx                      # Root provider wrapping & navigation layout
│   └── main.tsx                     # React entrypoint
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Frontend & Localization (Arabic & English)

### 3.1. Dynamic RTL / LTR Switching
The root document attributes dynamically adapt upon language change to invert padding, margins, borders, and icon orientations automatically:

```typescript
// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: 'ar', // Default or user-persisted preference
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
});

export default i18n;
```

### 3.2. Tailwind CSS Logical Properties Rule
To avoid maintaining two distinct stylesheets, all components must utilize logical property classes:
* Use `ps-*` (padding-start) and `pe-*` (padding-end) instead of `pl-*` / `pr-*`.
* Use `ms-*` (margin-start) and `me-*` (margin-end) instead of `ml-*` / `mr-*`.
* Use `start-*` and `end-*` instead of `left-*` / `right-*`.
* Font family: `font-cairo` or `font-tajawal` for crisp Arabic ligature rendering.

---

## 4. Local-First Database Strategy (SQLite)

The local SQLite database guarantees zero check-in downtime regardless of internet stability.

### Recommended Core Schema
* `members`: Personal information, unique code (Barcode/RFID), phone, status.
* `plans`: Plan duration (days), allowed entries, price, active flag.
* `subscriptions`: `member_id`, `plan_id`, `start_date`, `end_date`, `remaining_sessions`, `payment_status`.
* `attendance_logs`: `member_id`, `timestamp`, `status` (Granted/Denied/Expired), `gate_id`.
* `payments`: Transaction records, payment method (Cash/Card/Transfer), invoice numbers.

---

## 5. Build, Release & CI/CD Pipeline

Targeting Windows production binaries while developing on a Linux workstation is solved via **GitHub Actions** in a **private repository**.

### 5.1. Build & Release Architecture

```
[Linux Development Machine]
            │
            │  (git push tag v1.0.0)
            ▼
[Private GitHub Repository]
            │
            │  (Triggers Release Workflow)
            ▼
[GitHub Actions Runner (windows-latest)]
            │
            ├── Setup Node.js & Rust toolchain
            ├── Install dependencies (`pnpm install`)
            ├── Compile frontend assets (`pnpm build`)
            └── Execute Tauri Build (`cargo tauri build`)
            │
            ▼
[Output Artifacts (~10–15 MB Installer)]
            ├── Windows MSI Installer (.msi)
            ├── Windows NSIS Setup (.exe)
            └── Update Manifest (latest.json)
```

### 5.2. Private Repository CI/CD Configuration (`.github/workflows/release.yml`)

```yaml
name: Release Desktop App

on:
  push:
    tags:
      - 'v*'

jobs:
  release-windows:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        platform: [windows-latest]

    runs-on: ${{ matrix.platform }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Setup PNPM
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Install Frontend Dependencies
        run: pnpm install

      - name: Build Tauri Desktop Application
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: __VERSION__
          releaseName: 'Gym App v__VERSION__'
          releaseBody: 'Automated release build for Windows desk machines.'
          releaseDraft: false
          prerelease: false
          args: --target x86_64-pc-windows-msvc
```

---

## 6. Distribution & Auto-Updates for Private Repos

1. **Standalone Direct Delivery:** The generated `.msi` and `.exe` files can be downloaded directly from GitHub Workflow Artifacts / Releases and installed via USB or standard download.
2. **Auto-Updater Mechanism:** 
   * Tauri updater uses an encrypted public/private key signature verification.
   * Host the `latest.json` file and installer binaries on an S3-compatible private/public bucket (e.g., Cloudflare R2 or MinIO) to provide seamless over-the-air client updates without exposing private repository access tokens.
