# RawSens

Free, open-source aim sensitivity calibration for Windows. Local-first, no account, no telemetry by default.

> Pre-alpha foundation. The calibration protocol is being specified before implementation.

## Stack

- Electrobun 2 with a Bun main process and native WebView2 UI
- React + TanStack Router + Vite
- GitHub Releases for unsigned Windows installers and differential updates
- Changesets for reviewed versioning and changelogs

## Development

Requirements: Node.js 24, pnpm 11, and the Windows toolchain for desktop builds.

```sh
pnpm install
pnpm dev
pnpm check
```

Dependencies are exact and lockfile-pinned.

## Releases

1. Add a Changeset with a user-visible change.
2. Push to `main`; GitHub opens or updates `changeset-release/main`.
3. Merge the release PR after CI passes.
4. CI builds the unsigned Windows installer and every Electrobun update artifact, then publishes `vX.Y.Z` to GitHub Releases.
5. Installed clients check `releases/latest/download` according to the user's update policy.

Update policies are manual, notify-only (default), background download, and fully automatic. Electrobun validates update hashes and installs transactionally; Windows code signing is intentionally deferred.

## Privacy

Training data and configuration stay on-device. Planned AI assistance is optional: sponsored requests will use only `stealth/ox-alpha` through a narrow Cloudflare Worker, while BYOK requests go directly to a user-selected OpenRouter model. No proxy is deployed yet.

## License

AGPL-3.0-only.
