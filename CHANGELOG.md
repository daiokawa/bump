# Changelog

## 2026-10-25

- **A letter with a malformed id or sender can no longer write outside your inbox or stop delivery.** The relay accepts any text as a letter's id and sender, and your side used the id directly as a file name. Someone who knows your address could therefore have bump create a `.env.json` file in another folder you can write to (an existing file is never overwritten), or, by naming a built-in property as the sender, make every pull fail at that letter so later letters stopped arriving until it expired. Your side now places only letters whose id is a plain token (real ids are always random UUIDs) and whose sender is one of your own contacts; anything else is skipped and the rest of the mailbox is delivered. Message contents were never at risk: letters are still opened and verified end to end. Found in a security review of the relay; installs pick this up on the next app open.
- **The relay can no longer be knocked over by one request, and no longer drops undelivered letters to make room.** (Only matters if you run your own relay.) A mailbox could hold 500 letters of up to 1 MB, and a single read returned all of them at once; on the 128 MB container one such read killed the relay for everyone. A read now returns at most 100 letters or 4 MB, and your side picks up the rest on its next pull — no update needed on the receiving side. When a mailbox was full, the relay deleted its oldest letters even if they had never been delivered; now only delivered letters make room, and a mailbox full of undelivered mail politely refuses new ones, which stay in the sender's outbox and are sent again later. Letters past the 7-day limit are now cleared from every mailbox each hour, not only from mailboxes someone happens to open, and errors no longer echo internal details.

## 2026-10-24

- **Dependencies updated: `npm audit` is clean again.** `@modelcontextprotocol/sdk` 1.32.1 → 1.32.2 (zod 4.4.3 → 4.6.7), clearing a high-severity zod advisory where validating an oversized set could exhaust memory. bump only uses the SDK over stdio and the relay does not depend on it, so the practical exposure was low. Installs pick this up on the next app open.

## 2026-10-22

- **A quick reply now says what it is replying to.** "Thanks!" or "Likewise!" on their own don't tell you which letter they answer. A quick reply now carries the id of the letter it answers (`re`, inside the signed message), and the console, the conversation history, your sent letters and `bump_read` show "↩" with the first line of that letter. Quick replies from older versions carry no `re`; for those, the letter you sent just before is shown as a modest "↩ Probably re: …". voice-code's quick-reply buttons send the same `re`. Older versions receiving a letter with `re` read and verify it as before.
- **The watcher and the console can no longer run twice for one end, however they were started.** Yesterday's fix told your own launchd jobs apart by looking for `server/web.js` / `bump.js daemon` in their arguments, which misses jobs that start bump through a wrapper script — so both sets started at login (Y.K.). Now the running processes decide: the watcher holds a lock (`~/.bump/daemon.lock`) and a second one waits quietly, taking over if the first stops; a second console finding the port in use waits instead of crashing.

## 2026-10-21

- **The background watcher now checks the relay once a minute, in one request.** It used to ask every 5 seconds, and once per contact — but your relay mailbox is a single box addressed to you, so a machine with 8 contacts read the same box 8 times every 5 seconds. Measured on 10-18: about 282,000 requests a day across the relay, half of them from one machine. The watcher now pulls the box once and sorts letters to each contact (the same path the console already used), and the default interval is 60 seconds. bump is a tool for letters people read and think over with their local AI; a minute's delay is shorter than that conversation. `bump daemon --every <ms>` still overrides. Opening the console still pulls immediately, as before.
- **Reading letters through your AI no longer stalls for minutes.** Before handing letters over, `bump_read` checks each new one for prompt-injection by asking your local `claude` — one at a time, a few to tens of seconds each, and including plain read receipts. A handful of new arrivals took over two minutes (seen in the maintainer's own session). Read receipts in their fixed form (`{re, status: read|declined, reason: ""}`, no free text) are now not sent for checking; a decline carrying a reason, anything off that shape, and profile or package letters are still checked. The remaining letters are checked in parallel (up to four at once). The check itself is unchanged.
- **Opening the app now actually updates dependencies — this morning's SDK update did not reach app installs.** An app opened from Finder starts with a bare PATH, so `npm` (which looks for `node` on PATH) could not run: the update logged "dependency update failed (continuing with bundled)" and left `@modelcontextprotocol/sdk` at 1.29.0, the version with the advisories. Reported by Y.K. with the cause and the fix. The launcher now puts the found Node (and the usual install places for `claude`) on PATH, installs dependencies in a side folder and swaps them in only on success — `npm ci` empties `node_modules` first, so a failure in place could have left no dependencies at all — and after every open it compares installed versions against `package-lock.json` and tells you if they differ, instead of carrying on quietly. **Because the launcher itself rides the update, this takes effect from the second open after updating.**
- **The app no longer removes your own launchd setup, and sets up its own.** To avoid running twice, every open stopped every launchd job with "bump" in its name — including ones users had registered themselves, which then had to be re-registered after each update (Y.K.). The app now stops only its own jobs and old-name leftovers. If you have registered your own job for the console or the watcher, the app restarts it (and reloads it if an earlier version unloaded it) and does not start a second copy; otherwise it registers its own (`chat.bump.app.web`, `chat.bump.app.daemon`) so both come back after a restart or login without any setup on your side.
- **Dependencies updated: `npm audit` is clean again.** `@modelcontextprotocol/sdk` 1.29 → 1.32.1, which also clears advisories in packages it pulls in (proxy-addr, fast-uri, ip-address, hono, @hono/node-server, qs). bump only uses the SDK over stdio and the relay does not depend on it, so the practical exposure was low. Installs pick this up with a one-time `npm ci` on the next app open.
- **The relay no longer reports where it stores mailboxes.** `/` and `/health` returned the storage path, which over a public tunnel revealed the host's user name and folder layout. Noticed when a scanner probed the relay (all probes got 404). They now return only `{ ok: true }`.

## 2026-10-15

- **Contacts now show how they were confirmed — invite code, in-person QR, or not confirmed — instead of verified/unverified.** Every bond read "…unverified" in `bump pairs`, even ones approved through a matched invite code: approval matched the code but never recorded it. The two-state label also implied a chore (reading numbers aloud) nobody needed. Approvals where the invite code matched now record `invite`; a camera scan records `qr`; `bump verify` records `number`. Shown quietly in `bump pairs`, contact settings, and the MCP `trust` field (`invite` / `qr` / `number` / `none`). Old `peer.json` files read as before (`verified: true` → in-person QR), and `verified` is still written so older versions see the same meaning.
- **A changed key now says what to do.** The refusal stays — bump still never silently re-pairs a contact to a new key — but instead of "delete peer.json by hand" it says *"X's key has changed. If they reinstalled, reconnect with a new package."* That advice now actually works: a connection request whose invite code from a new package matches can replace the key on approval (the old record is kept beside it as `peer.replaced-*.json`). Without a matching code, approval is refused. The request card flags the key change before you approve.

## 2026-09-14

- **The stale-session counter now works for git-pull installs too.** The console's "N sessions running old code" check keyed off `build.txt`, which only the app's launcher writes — a repo install has no such file, so the check silently reported nothing at all, and the layer it was built for (long-lived sessions) stayed invisible exactly where sessions live longest. Found by H.S. via `/api/health` right after applying eight releases in one pull. When `build.txt` is absent the console now takes the applied-time from the git reflog — the moment HEAD last moved on that machine, i.e. when the pull actually landed, not when the commit was authored. App installs are unchanged.

## 2026-09-09

- **You can now recall a letter while it still sits undelivered on the relay.** Sometimes a letter becomes moot before the other side reads it — the concrete case: a request letter made obsolete when the conversation moved to another channel, left cluttering the peer's mailbox (raised via K.O.). New `bump_unsend` MCP tool and a "recall" button on sent letters in the console. The honest boundary is delivery, not reading: the relay can only remove what it still holds, so a recall succeeds before the peer's device pulls the envelope and reports failure after — nothing ever reaches into the other side's machine. The blind relay stays blind: it keeps no key registry, but since a device id is the hash of its public key, a recall request carrying the sender's public key and an Ed25519 signature proves "the envelope's sender asked this" without the relay learning who that is. Recalled letters keep their place in your own history, marked ↩. Removing an envelope never touches the mailbox's sequence counter, so this coexists with the rollback protections from 08-19/20.

This log exists to show how bump is built: bugs are recorded, credited, and fixed in the open.
Reporter initials refer to the testers in the README acknowledgments. Entries that would
endanger current users are withheld until fixed — nothing here is, by policy.

## 2026-08-22

- **Sessions too old to announce themselves are now counted from the new side.** The 08-20 stale-process notice only works if the old process itself carries the feature — an MCP process started before 08-20 can never say so, and those long-lived sessions are exactly the layer the notice was built to protect. Spotted by K.S. from live measurement: 3 of the 6 MCP processes on his machine were in that blind spot, and the longer a session stays open the older its code — the wrong way around. The console, which always runs current code, now checks `ps` for MCP processes of this install that started before the last update was applied (the `build.txt` timestamp; no new bookkeeping) and shows "N sessions running old code" with a restart hint. The in-band notice stays — it is the only channel that reaches the affected Claude directly — this covers the layer it structurally cannot, and closes the same gap for any future feature.

## 2026-08-21

- **The rollback self-heal now also covers the console pull path.** Yesterday's fix said "both pull paths" — in fact it patched the per-bond and connect-request paths but missed `pullAllFromRelay`, the combined path the console and dashboard use, which would still have stalled silently on a rolled-back mailbox. The commit message claimed coverage the code didn't have; found while preparing the change below.
- **Re-pulled envelopes are no longer re-placed or re-counted.** A rollback recovery re-fetches envelopes you already have. Letters were never doubled (the message-level check catches them), but the envelopes were rewritten into the inbox, decrypted again, and counted — visible as an inflated `pulled N` in `bump sync`. Raised by K.S. while reviewing the self-heal. Envelopes already present, including processed ones, are now skipped at placement.

## 2026-08-20

- **The morning release shipped with a bad signature — auto-update refused it and rolled installs back to the app-bundled version.** The signing step hashes the working directory, which contained a local scheduler file (under `.claude/`, gitignored, so invisible to `git status`) that no clone has: the maintainer's own verify passed while every tester's failed. Worse, a failed verify restores the bundled version, so opening the app during the bad window *downgraded* the install (K.S. went 08-19 → 08-16). Caught within two hours by K.S. with a control experiment (r2026-08-19 verified fine, same key, same steps) and per-commit tree-hash comparison that pinned the mismatch to the signing side. Fixed twice over: `.claude` is now excluded from both signature and package, and `sign-release` refuses to sign at all unless the working tree hashes identically to a clean export of git HEAD — a signature that only verifies on the maintainer's machine can no longer be produced. If you opened the app during the bad window, open it again to get current. Also queued: a failed verify should fall back to the newest version that ever verified, not all the way to the bundled one.
- **Receivers now recover from a relay mailbox rollback on their own.** The 2026-08-19 fix stopped mailboxes from rewinding, but a receiver whose cursor was already ahead of a rewound mailbox would still wait forever. `/get` now reports the mailbox's highest sequence number; when a receiver's cursor is beyond it, it treats the mailbox as rolled back and re-reads from the start — already-delivered letters are dropped by the duplicate check, so nothing arrives twice. This closes the last known path of the Y.K. incident from the receiving side.
- **A stale MCP process now says so.** An update is applied when you open the app, but an MCP process started before that keeps running the old code and fails in confusing ways — K.S. saw `fetch failed` from `bump_read` with no hint of the cause until the session was reopened. Every MCP response (including errors) now carries a notice when the installed version no longer matches the code the process started with: restart your Claude session to load the new version.

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
