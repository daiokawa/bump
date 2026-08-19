# Changelog

This log exists to show how bump is built: bugs are recorded, credited, and fixed in the open.
Reporter initials refer to the testers in the README acknowledgments. Entries that would
endanger current users are withheld until fixed — nothing here is, by policy.

## 2026-08-19

- **The relay could silently stop delivering to a peer, permanently.** Mailbox sequence numbers were derived only from the files on disk; when the 7-day TTL emptied a quiet mailbox, numbering restarted at 1 while the recipient's cursor stayed high — every envelope after that was invisible to them. This hit Y.K.'s mailbox on 2026-08-12: two letters and three read receipts sat undelivered for a week. Found via his report that letters he sent stayed "unread" while their content was clearly being acted on. Sequence numbers now also persist in a counter file that survives the sweep and never rewind; the stranded envelopes were renumbered above the stuck cursor and delivered.
- **Reading letters over MCP now returns read receipts.** "Read" used to be recorded only when a letter was opened in the console — for peers whose letters are read by an AI via `bump_read`, the sender's history showed "unread" forever, which reads as "it never arrived" (Y.K.). An MCP read now records to the same ledger as the console (`opened.json`) and sends the same receipt; the per-bond receipt opt-out applies as before.

## 2026-08-17

- Blocked cross-site requests no longer appear in the "what went wrong" panel. A successful defense was being listed next to delivery failures, which reads as something broken.
- Verification builds no longer send a real connection request to the distributor's console (`BUMP_NO_CONNECT`). Testing the shipped package end to end had the side effect of five test requests landing in the maintainer's inbox.
- README: use `npm ci`, not `npm install` — the latter rewrites the lockfile, which is signed content, so `verify-release` then reports a mismatch (H.S. hit this while migrating).

## 2026-08-16 — security audit day

- **Cross-site requests can no longer reach the console.** A malicious page open in your browser could POST to bump on 127.0.0.1 and delete letters and audit logs, send letters as you, or rewrite your profile. Reported with a working exploit by K.K. after reading the whole codebase; reproduced here (worse than reported — the request succeeded, not just reached the handler). Mutating requests now require a same-origin signal.
- **Release signing.** Apple's notarization covers the `.app` you double-click, not the code auto-update later overlays from GitHub. Raised by Y.K. (scope of the seal) and deepened by K.K. from an attacker's angle: an account takeover would ship to every tester at once. Distributed code now carries an Ed25519 signature over its content hash; auto-update refuses anything that does not verify against the public key already on your machine. Anyone can check with `bump verify-release`.
- **The updater can now update itself.** The app entry became a thin stub so that `installer/launch.sh` — the thing that performs updates and now checks signatures — rides auto-update like everything else.
- Old-name launchd agents are swept on every open (K.K.); a migration-time crash used to skip that cleanup permanently.
- Quick replies keep their pressed state per letter, so you can tell whether you already answered.
- Fixed a shell bug class where a multibyte character next to a variable killed the installer under `set -u` (Y.Kz., second occurrence) — and added a pre-ship lint that refuses to build if any script contains the pattern.

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
