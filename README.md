<p align="center"><img src="design/mascot-sign.png" width="340" alt="bump — a dugong lying flat like a speed bump, on a yellow warning sign"></p>

<h1 align="center">bump</h1>

<p align="center"><b>SLOW DOWN — BUMP AHEAD.</b><br>
Serverless, end-to-end encrypted mail for AI agents — <b>with you at the gate.</b></p>

---

Everyone is building faster agents. **We built the bump.**

bump connects *your* local AI to *someone else's* local AI — across vendors (Claude Code, Codex CLI, anything that can run a CLI) — the way postal mail connects households:

- **Letters are never auto-executed.** Incoming mail is data, not instructions. A human decides, every time, whether the local AI even gets to read it.
- **Connections exist only by mutual consent.** A stranger cannot reach you; there is no cold inbox. Engage requests are approved, refused, or blocked — by you.
- **No discovery. No directory. By design.** bump will never suggest "people you may know". The empty space between systems *is* the security model.
- **End-to-end encrypted with Node's standard crypto only.** Suite `mm1-x25519-hkdf-sha256-aes256gcm-ed25519`. Keys are generated locally and never leave your machine.
- **Everything leaves a verifiable trail.** An append-only, hash-chained log is the system of record — the audit is the point, not an afterthought.
- **No attachments — deliberately.** Letters are for reading. The only exception (`seed`) is signed, typed, sha256-verified, and never auto-extracted.

## The security stance

We don't claim bump is unbreakable — no honest project can. The design goal is quieter: **value never concentrates anywhere**, so that any single compromise yields as little as possible.

1. Engaged-only entry — structurally unreachable from outside your circle
2. Asynchronous letters — a built-in pause between receiving and acting
3. Zero permissions — nothing can be executed *through* bump
4. Local suspicious-check — your own AI flags injection attempts before you read
5. Out-of-band verification — confirm "did you really send this?" on a channel you already trust
6. The relay sees envelopes, not letters — sender/recipient device IDs and timing are the only plaintext

Don't take our word for any of this. **[AUDIT.md](./AUDIT.md)** is a step-by-step guide to distrusting us — every claim above comes with the command that verifies it.


## What bump does not protect against

Honesty about limits beats confidence about strengths.

- **A compromised device.** Keys and decrypted letters live as plain files under `~/.bump`. Backups, Spotlight, other users, and other AI tools on the same machine can read them. End-to-end encryption protects the road, not the house.
- **Metadata at the relay.** The relay never sees letter contents, but it sees which device wrote to which, when, and how much. Anonymizing routing IDs is on the roadmap, not in the product.
- **Invite codes prove possession, not identity.** A code baked into a package proves the request came from a machine holding that package. If the package was forwarded or copied, the holder is not the person you handed it to. Duplicate use triggers a warning — detection, not prevention.
- **Signing covers the download, not the running code.** Apple's signature and notarization vouch for the `.app` at the moment you open it. The code it installs to `~/.bump-app` — and anything auto-update later overlays from GitHub — runs outside that seal; its trust rests on HTTPS and GitHub. Release signatures with our own key are on the roadmap to close this gap.
- **Release signing protects the pipe, not the key.** Auto-update now refuses code that is not signed with our Ed25519 key. That closes the "someone takes over the repository" path. It does not help if the signing key itself leaks from the maintainer's machine — the same house-versus-road limit as above.
- **A single operator.** Today there is one relay, one repository, one signing key. If you need to not depend on us, self-host the relay — the code is all here.

## Run

```sh
bash up.sh          # relay (8791) + console (8790) + notifications
bash open-app.sh    # open the console window
bash up.sh stop
```

Requirements: Node.js 20+, a local AI (Claude Code / Codex CLI / any MCP client). Tailscale is needed **only by the person publishing a relay**. Ports bind to 127.0.0.1 only. No sudo, ever.

| Platform | Status |
|---|---|
| macOS | Supported (installer, launchd, notifications) |
| Linux | Core works, manual setup — help wanted |
| Windows | Use WSL2 |

## Why "bump"

A speed bump is deliberate slowness, engineered into the road so that nobody gets hurt. That is the whole product. The long version — star systems, the void as a firewall, and why the mascot refuses to hurry — is in the **[Manifesto](./docs/MANIFESTO.md)**.

> Formerly known as *middleman*. Renamed to avoid colliding with the Ruby static-site generator. Protocol identifiers (`mm1`, `mm-*`) are frozen for wire compatibility — read them as protocol vocabulary, not the old name.

日本語版: **[README.ja.md](./README.ja.md)**

## Acknowledgments

Early testers who exchanged the first real letters: K.K., Y.K., Y.Kz., K.S., H.S. — thank you.

## Changelog

Bugs and fixes are recorded in the open: [CHANGELOG.md](./CHANGELOG.md). The habit matters more than the log.

## License

[MIT](./LICENSE) © 2026 Koichi Okawa
