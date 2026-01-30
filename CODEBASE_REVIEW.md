# ExtraBrain Codebase Review

**Review Date:** January 30, 2026
**Reviewer:** Claude (Automated Analysis)
**Current State:** Desktop app (Tauri + React) with Chrome extension

---

## Executive Summary

ExtraBrain is a well-architected local-first note-taking application built with modern technologies (Tauri 1.5, React 18, TypeScript, SQLite). The codebase demonstrates good foundational patterns but has significant gaps that should be addressed before scaling to iOS/iPad and implementing synchronization.

**Overall Assessment:** Solid foundation with technical debt to address

| Category | Score | Notes |
|----------|-------|-------|
| Architecture | B+ | Clean separation, modern stack |
| Security | C | Critical issues with hardcoded tokens, CSP |
| Code Quality | B- | Some duplication, long files |
| Test Coverage | F | No tests exist |
| Documentation | D | Minimal, no API docs |
| Multi-Platform Readiness | D | Significant work needed |
| Sync Readiness | F | No infrastructure exists |

---

## Critical Issues (Fix Immediately)

### 1. Hardcoded Security Token

**Severity:** CRITICAL
**Files:**
- `src-tauri/src/server_config.rs:7`
- `chrome-extension/popup.js:5`
- `chrome-extension/background.js:4`

```rust
pub const EXTENSION_TOKEN: &str = "extrabrain-extension-token";
```

**Risk:** Anyone with source code access can authenticate to the HTTP API.

**Recommendation:**
- Generate random token at first launch
- Store in system keychain/secure storage
- Expose to extension via secure handshake or OAuth flow

---

### 2. Weak Content Security Policy

**Severity:** CRITICAL
**File:** `src-tauri/tauri.conf.json:81`

```json
"csp": "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' asset: blob: data: https:;"
```

**Risk:** `'unsafe-inline'` and `'unsafe-eval'` enable XSS attacks if sanitization is bypassed.

**Recommendation:**
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: blob: data: https:;"
```

---

### 3. `dangerouslySetInnerHTML` Usage

**Severity:** CRITICAL
**File:** `src/components/NoteEditor.tsx:857`

```typescript
dangerouslySetInnerHTML={{ __html: sanitizedContent }}
```

**Risk:** If HTML sanitization is ever bypassed, XSS is guaranteed.

**Recommendation:**
- Consider using a React-based HTML renderer library (e.g., `html-react-parser`)
- Add additional server-side sanitization
- Implement content validation on save

---

### 4. No Test Coverage

**Severity:** CRITICAL
**Impact:** Cannot safely refactor or add features without regression risk.

**Recommendation:**
- Add Vitest for unit tests
- Add React Testing Library for component tests
- Add Rust `#[test]` modules for backend
- Target 60%+ coverage before major changes

---

## High Priority Issues (Fix Soon)

### 5. Missing Input Validation

**Severity:** HIGH
**Files:** `src-tauri/src/commands/mod.rs`, `src-tauri/src/db/mod.rs`

**Issues:**
- No maximum length for note titles, content, notebook names
- Tag names only trimmed, no length/character restrictions
- Could enable resource exhaustion attacks

**Recommendation:**
```rust
const MAX_TITLE_LENGTH: usize = 500;
const MAX_CONTENT_LENGTH: usize = 10_000_000; // 10MB
const MAX_TAG_LENGTH: usize = 100;
const MAX_NOTEBOOK_NAME_LENGTH: usize = 200;
```

---

### 6. Silent Error Suppression

**Severity:** HIGH
**File:** `src-tauri/src/commands/mod.rs:229-230`

```rust
std::fs::create_dir_all(&attachments_dir).ok();
std::fs::create_dir_all(data_dir.join("pdfs")).ok();
```

**Impact:** Failures are silently ignored, making debugging difficult.

**Recommendation:** Log errors even if continuing:
```rust
if let Err(e) = std::fs::create_dir_all(&attachments_dir) {
    eprintln!("Warning: Failed to create attachments dir: {}", e);
}
```

---

### 7. No Rate Limiting on HTTP API

**Severity:** HIGH
**File:** `src-tauri/src/server.rs`

**Risk:** API endpoints can be abused for DoS.

**Recommendation:** Add tower-governor or similar rate limiting middleware.

---

### 8. Regex-Based HTML Sanitization

**Severity:** HIGH
**Files:**
- `src-tauri/src/sanitize.rs`
- `src/utils/sanitizeHtml.ts`

**Risk:** Regex-based sanitization is fragile and can be bypassed.

**Recommendation:** Use established libraries:
- Rust: `ammonia` crate
- TypeScript: `DOMPurify` library

---

### 9. Large Files Need Refactoring

**Severity:** HIGH

| File | Lines | Issues |
|------|-------|--------|
| `NoteEditor.tsx` | 877 | 10+ responsibilities, complex state |
| `Sidebar.tsx` | 639 | Mixed concerns |
| `useStore.ts` | 400+ | Monolithic store |

**Recommendation:** Extract into smaller modules:
- `NoteEditor` → `MilkdownEditor`, `useImageHandler`, `useDragDrop`
- `Sidebar` → `NotebookList`, `NotebookMenu`, `ImportExport`
- `useStore` → Split by feature (notebooks, notes, search, ui)

---

### 10. No Error Boundaries

**Severity:** HIGH
**Impact:** Component errors crash the entire app.

**Recommendation:**
```typescript
// Add ErrorBoundary component
class ErrorBoundary extends React.Component {
  componentDidCatch(error, info) {
    // Log to error reporting service
    console.error('Component error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

---

## Medium Priority Issues (Plan to Fix)

### 11. Code Duplication

**Files with duplicated patterns:**

| Pattern | Locations |
|---------|-----------|
| Click-outside menu handler | `Sidebar.tsx:77-102`, `NoteList.tsx:42-68` |
| Preview text generation | `Home.tsx:10-19`, `NoteList.tsx:132-141` |
| Drag state management | Multiple components |

**Recommendation:** Extract to custom hooks:
```typescript
// hooks/useClickOutside.ts
export function useClickOutside(ref: RefObject, onClose: () => void) { ... }

// utils/preview.ts
export function getPreviewText(content: string, maxLength: number): string { ... }
```

---

### 12. Magic Numbers Throughout Code

**Examples:**
- `5 * 1024 * 1024` (5MB limit) - `NoteEditor.tsx:480`
- `300` (debounce ms) - `SearchBar.tsx:17`
- `192`, `150` (menu dimensions) - `NoteList.tsx:99, 397`

**Recommendation:** Create constants file:
```typescript
// constants/index.ts
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const SEARCH_DEBOUNCE_MS = 300;
export const MENU_WIDTH = 192;
export const MENU_MIN_HEIGHT = 150;
```

---

### 13. Console Logging in Production

**Severity:** MEDIUM
**Locations:** 20+ instances across frontend and backend

**Recommendation:**
- Remove `console.log` statements from production code
- Implement structured logging (Rust: `tracing`, Frontend: custom logger)
- Add log levels (DEBUG, INFO, WARN, ERROR)

---

### 14. Missing Keyboard Accessibility

**Issues:**
- Drag & drop has no keyboard alternative
- Menu navigation via keyboard incomplete
- Missing ARIA attributes on menus

**Recommendation:**
- Add `role="menu"`, `role="menuitem"` attributes
- Implement arrow key navigation for menus
- Add keyboard shortcuts for move operations

---

### 15. No Loading States for Async Operations

**File:** Multiple components

**Issue:** Users can trigger multiple imports, no feedback on progress.

**Recommendation:**
```typescript
const [isImporting, setIsImporting] = useState(false);
// Disable buttons and show spinner during operations
```

---

## Low Priority Issues (Nice to Have)

### 16. No Dark Mode Toggle

**Current:** Hardcoded light content area with dark sidebar.

**Recommendation:** Add theme context and CSS variables for dark mode support.

---

### 17. No Undo/Redo

**Risk:** Accidental deletions cannot be recovered.

**Recommendation:**
- Implement soft delete with 30-day retention
- Add undo stack for recent operations
- Consider using a state management library with time-travel (Immer)

---

### 18. Menu Position Not Responsive

**File:** `NoteList.tsx:393-404`

**Issue:** Menu position calculated once, not updated on resize.

**Recommendation:** Add ResizeObserver or window resize listener.

---

### 19. TypeScript Any Suppressions

**File:** `NoteEditor.tsx:112-118`

**Issue:** 4 consecutive `@typescript-eslint/no-explicit-any` suppressions for Milkdown.

**Recommendation:** Create proper type definitions or use generics.

---

### 20. Unused Type Definition

**File:** `src/types/index.ts`

**Issue:** `AppState` interface defined but never used.

**Recommendation:** Remove or implement.

---

## Future State Preparation

### For iOS/iPad Version

**Critical Changes Needed:**

1. **Extract Shared Core Library**
   - Create `extrabrain-core` Rust library
   - Define platform-agnostic models
   - Compile to iOS via FFI

2. **Abstract Storage Layer**
   ```rust
   pub trait StorageBackend: Send + Sync {
       fn create_note(&self, note: &Note) -> Result<()>;
       fn get_note(&self, id: &str) -> Result<Note>;
       // ...
   }
   ```

3. **Remove Platform-Specific Code**
   - `~/.extrabrain` path → Use platform document directories
   - Tauri asset protocol → Cross-platform file handling
   - Windows drive letter handling → Platform abstraction

4. **Shared Components:**
   - Data models (70-90% shareable)
   - Validation rules (90% shareable)
   - Sync logic (once implemented)
   - HTML sanitization logic

---

### For Synchronization

**Schema Changes Required:**

```sql
-- Add to notebooks and notes tables:
ALTER TABLE notebooks ADD COLUMN deleted_at TEXT;
ALTER TABLE notebooks ADD COLUMN sync_version INTEGER DEFAULT 1;
ALTER TABLE notebooks ADD COLUMN device_id TEXT;
ALTER TABLE notebooks ADD COLUMN content_hash TEXT;

-- New tables:
CREATE TABLE sync_metadata (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    sync_status TEXT NOT NULL,  -- 'pending', 'synced', 'error'
    last_sync_at TEXT
);

CREATE TABLE sync_queue (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,  -- 'create', 'update', 'delete'
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    synced INTEGER DEFAULT 0
);

CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    last_sync_at TEXT
);
```

**API Design for Sync Server:**

```
POST /api/v1/auth/login
POST /api/v1/sync/pull
  Request: { last_sync_at, device_id, version_vector }
  Response: { changes: [], conflicts: [] }
POST /api/v1/sync/push
  Request: { device_id, changes: [], version_vector }
POST /api/v1/sync/conflicts/resolve
```

**Conflict Resolution Strategy:**
- Implement Vector Clocks for distributed version tracking
- Last-write-wins as default, with user override option
- Store conflict history for audit

---

## Recommended Action Plan

### Phase 1: Critical Fixes (1-2 weeks)
- [ ] Generate dynamic extension token
- [ ] Fix CSP policy
- [ ] Add input validation with length limits
- [ ] Set up basic test infrastructure (Vitest + RTL)

### Phase 2: Code Quality (2-3 weeks)
- [ ] Refactor NoteEditor.tsx into smaller components
- [ ] Extract shared utilities and hooks
- [ ] Add error boundaries
- [ ] Replace regex HTML sanitization with library
- [ ] Remove console.log statements

### Phase 3: Testing & Documentation (2-3 weeks)
- [ ] Write unit tests for critical paths
- [ ] Add integration tests for Tauri commands
- [ ] Document API contracts
- [ ] Create architecture decision records

### Phase 4: Sync Foundation (4-6 weeks)
- [ ] Update database schema for sync
- [ ] Implement change tracking
- [ ] Create sync server skeleton
- [ ] Add device management

### Phase 5: Multi-Platform Prep (4-6 weeks)
- [ ] Extract shared core library
- [ ] Abstract storage layer
- [ ] Create iOS project structure
- [ ] Implement FFI bindings

---

## Files Requiring Immediate Attention

| File | Priority | Issues |
|------|----------|--------|
| `src-tauri/src/server_config.rs` | CRITICAL | Hardcoded token |
| `src-tauri/tauri.conf.json` | CRITICAL | Weak CSP |
| `src/components/NoteEditor.tsx` | HIGH | 877 lines, needs split |
| `src-tauri/src/commands/mod.rs` | HIGH | Missing validation, `.ok()` abuse |
| `src/components/Sidebar.tsx` | MEDIUM | 639 lines, needs split |
| `src-tauri/src/sanitize.rs` | MEDIUM | Weak regex sanitization |

---

## Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Test Coverage | 0% | 60%+ |
| TypeScript Errors | Unknown | 0 |
| ESLint Warnings | Unknown | 0 |
| Largest Component | 877 lines | <300 lines |
| Security Vulnerabilities | 4 critical | 0 |
| Documentation Coverage | ~10% | 60%+ |

---

## Conclusion

ExtraBrain has a solid architectural foundation with modern technologies. However, before expanding to iOS/iPad and implementing sync, the following must be addressed:

1. **Security hardening** - Token generation, CSP fixes
2. **Code quality** - Component refactoring, test coverage
3. **Sync infrastructure** - Schema changes, API design
4. **Platform abstraction** - Shared core library, storage traits

The recommended timeline for full multi-platform readiness is **12-18 months**, with sync infrastructure being the most complex undertaking.

---

*This review was generated by automated analysis. Manual review is recommended for critical security changes.*
