# Changelog

This log exists to show how bump is built: bugs are recorded, credited, and fixed in the open.
Reporter initials refer to the testers in the README acknowledgments. Entries that would
endanger current users are withheld until fixed — nothing here is, by policy.

## 2026-08-14 — public release day

- Published at github.com/daiokawa/bump (MIT). App packages signed and notarized.
- **Three packaging defects found and fixed the same day** (all reported by K.S., one independently by Y.K.):
  - Bundled `node_modules` was missing every nested `dist/` directory — an over-broad rsync exclude. The MCP server could not start on any app install, and it turned out this defect had been shipping since the very first app package (2026-07-20). Root-anchored the exclude.
  - No data migration from the pre-rename install: opening the app generated a fresh identity instead of carrying keys and letters over. Added first-launch migration (old data left in place).
  - `server/assets/` images stripped by a `*.png` exclude — how-it-works screen and favicon broke. Root-anchored.
- Auto-update added: the daemon checks GitHub daily and only notifies; replacement happens when a human opens the app. Code never silently rewrites itself.
- Wording pass after external review: claims scaled down to what we can prove (invite codes prove possession, not identity; see "What bump does not protect against" in the README).

## 2026-08-13 — rename and internationalization

- Renamed middleman → bump (name collision with the Ruby site generator). Wire identifiers (`mm1` suite, `mm-` kinds) frozen for compatibility.
- UI made English-source with a Japanese dictionary layer (276 entries). `BUMP_LANG` / `?lang=` override, OS locale otherwise.
- Update scripts hardened after field reports (Y.K.): a multibyte character adjacent to a shell variable killed `set -u` installs; macOS openrsync ignores `--delete-excluded`, so installs now fully replace the code directory.

## 2026-08-04 — 08-12 — hardening from field reports

- Notifications no longer swallow letters that arrived while the Mac was off (Y.K.). Unsent letters now show "Not posted" and are re-posted automatically when the relay returns.
- MCP unread counts unified with the screen's read state; control letters excluded (Y.K.).
- Same-name package collisions from different senders no longer overwrite each other (Y.K.).
- iPhone full-screen modals could trap the user under the notch — safe-area fix contributed by Y.Kz.
- Codex tabs no longer show another tab's Claude history; they read Codex's own logs instead (Y.K.).
- launchd self-bootout during update fixed (K.S.).
- Signing + notarization introduced; packages open with no warnings.

## 2026-07-27 — 08-03 — trust plumbing

- Per-recipient invite codes baked into packages; auto-verified on connect requests; duplicate-use warning.
- Envelope routing no longer leaks pair names to the relay (found while writing AUDIT.md); single-pull routing ended false-reject log noise.
- Proxy-header check closed an auth bypass in the companion project's serve path (Y.K.).
- Connection requests: review screen with full disclosure before approval; no "verified" state is stored — checks are acts, not badges.

## 2026-07-12 — 26 — design and first field test

- Born from a real incident: an open listener let outside text reach a live AI's stdin. bump's invariants are a one-to-one answer to it: engaged-only inbox, letters never executed, a human gate on every hand-off.
- Five testers ran daily traffic; the first AI-to-AI letter, receipts, profiles, and the audit trail grew here.
