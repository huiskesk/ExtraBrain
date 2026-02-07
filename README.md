# ExtraBrain

A modern, privacy-focused note-taking app to replace Evernote. Built with Tauri, React, and SQLite for Mac.

## Features

- **Web Clipper**: Chrome extension to save web pages
- **PDF Support**: Upload and organize PDFs
- **Notebooks**: Organize notes into notebooks with drag & drop
- **Local Storage**: Your data stays on your Mac
- **Fast Search**: Full-text search across all notes

## Tech Stack

- **Desktop App**: Tauri (Rust backend)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Database**: SQLite (local storage)
- **Web Clipper**: Chrome Extension (Manifest V3)

## Getting Started

### Prerequisites

- Node.js 18+
- Rust (install via rustup)
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Tauri v2 + iOS init

Use the local CLI from this project (via `pnpm`) so you do not accidentally run a global v1 binary:

```bash
pnpm tauri:ios:init
```

If you see schema errors about `devPath`, `distDir`, `package`, or `tauri`, you are using an old v1 config.
This repo uses Tauri v2 config in `src-tauri/tauri.conf.json` (`identifier`, `build.devUrl`, `build.frontendDist`, `app`, `bundle`, `plugins`).

### Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `chrome-extension` folder

## Project Structure

```
ExtraBrain/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # State management
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── db/             # SQLite database
│   │   └── commands/       # Tauri commands
│   └── Cargo.toml
├── chrome-extension/       # Chrome web clipper
└── package.json
```

## Roadmap

- [x] Core note-taking functionality
- [x] Notebook organization
- [x] PDF upload support
- [x] Chrome web clipper
- [ ] Evernote import
- [ ] Google Drive sync
- [ ] iOS/Android apps

## License

MIT
