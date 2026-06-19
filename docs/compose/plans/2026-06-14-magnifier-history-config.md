# Mobile Magnifier, History Isolation, Config Panel — Implementation Plan

> **For agentic workers:** Use compose:subagent or compose:execute to implement task-by-task.

**Goal:** Add mobile crop magnifier, per-browser history isolation, and a frontend config panel with admin auth.

**Architecture:**
1. Magnifier: Custom touch overlay on ImageCropper, tracks finger position, shows zoomed canvas
2. History: Session ID via localStorage UUID, `X-Session-ID` header, `session_id` column in DB
3. Config: Admin password in `.env`, `/api/settings` endpoints, settings panel in Header ⚙️

**Tech Stack:** React, TypeScript, Tailwind, FastAPI, SQLAlchemy, Pydantic

---

### Task 1: Mobile Crop Magnifier

**Files:**
- Modify: `frontend/src/components/ImageCropper.tsx`

- [ ] Add magnifier state (`magnifierPos`, `showMagnifier`) and touch event handlers
- [ ] Create `MagnifierOverlay` component that renders a circular zoomed view
- [ ] Attach `onTouchStart`/`onTouchMove`/`onTouchEnd` to the crop container
- [ ] Use canvas to draw zoomed region (2x scale) centered on touch point
- [ ] Position magnifier above the touch point (offset upward so finger doesn't block it)
- [ ] Only show on touch devices (`'ontouchstart' in window`)

### Task 2: User-Isolated History (Backend)

**Files:**
- Modify: `backend/app/services/db.py` — add `session_id` column
- Modify: `backend/app/routers/history.py` — filter by session_id from header
- Modify: `backend/app/routers/ocr.py` — pass session_id when creating history

- [ ] Add `session_id: Mapped[str]` column to `HistoryRecord`
- [ ] Update `create_history()` to accept `session_id` parameter
- [ ] Update `list_history()` to filter by `session_id`
- [ ] Update `clear_history()` and `delete_history()` to filter by `session_id`
- [ ] Extract `X-Session-ID` header in history router endpoints
- [ ] Pass `session_id` from OCR router when creating history after recognition

### Task 3: User-Isolated History (Frontend)

**Files:**
- Create: `frontend/src/stores/sessionStore.ts` — session ID management
- Modify: `frontend/src/services/api.ts` — add session header to requests
- Modify: `frontend/src/App.tsx` — initialize session

- [ ] Generate UUID on first visit, store in `localStorage` as `localmathocr-session-id`
- [ ] Create `useSessionStore` with `sessionId` state
- [ ] Add `X-Session-ID` header to all API requests in `request()` helper
- [ ] Initialize session on app mount

### Task 4: Admin Auth Backend

**Files:**
- Modify: `backend/app/config.py` — add `admin_password` field
- Create: `backend/app/routers/settings.py` — settings API

- [ ] Add `admin_password: str = ""` to Settings class
- [ ] Create `POST /api/auth/admin` endpoint — validate password, return admin session token
- [ ] Create `GET /api/settings` endpoint — return all settings (user-visible subset for non-admin)
- [ ] Create `PUT /api/settings` endpoint — update settings (admin only, validated by token)
- [ ] Admin token = HMAC hash of password + session_id, stored in memory with TTL
- [ ] Middleware/helper to verify admin token from `X-Admin-Token` header

### Task 5: Admin Auth Frontend

**Files:**
- Create: `frontend/src/stores/settingsStore.ts` — settings state
- Create: `frontend/src/components/SettingsPanel.tsx` — settings UI
- Modify: `frontend/src/components/Header.tsx` — integrate settings panel

- [ ] Add admin login dialog (password input) in settings panel
- [ ] User settings section: preprocess toggle, default model selector
- [ ] Admin settings section (only visible when admin): device mode, preload models, model enable/disable, HF endpoint, etc.
- [ ] Save button calls `PUT /api/settings` with admin token
- [ ] Admin token stored in sessionStorage (cleared on tab close)

### Task 6: Integration & Testing

- [ ] Test magnifier on mobile viewport
- [ ] Test history isolation across browser tabs
- [ ] Test admin login/logout flow
- [ ] Test settings save/reload
- [ ] Verify non-admin users can't see admin settings
- [ ] `npm run build` passes
