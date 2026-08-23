# RawSens

Free, open-source aim sensitivity calibration for Windows and macOS. No account required.

> Pre-alpha foundation. The calibration protocol is being specified before implementation.

The accepted product and engineering contract lives in
[`docs/spec.md`](docs/spec.md).

## Stack

- Electrobun 2 with a Bun main process and platform webviews
- React + TanStack Router + Vite
- GitHub Releases for unsigned desktop installers and differential updates
- Changesets for reviewed versioning and changelogs

## Development

Requirements: Node.js 24, pnpm 11, and the platform toolchain for desktop builds.

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
4. CI builds the unsigned desktop installers and Electrobun update artifacts, then publishes `vX.Y.Z` to GitHub Releases.
5. Installed clients check `releases/latest/download` according to the user's update policy.

Unsigned builds support manual checks, notify-only checks (default), and background downloads. Applying an update requires confirmation. Unattended updates wait for authenticated, platform-signed releases.

## Privacy

Training data and configuration are stored on-device. Optional AI sends derived trial data and feedback: sponsored requests use only `stealth/ox-alpha` through a narrow Cloudflare Worker, while BYOK requests go directly to a user-selected OpenRouter model. No proxy is deployed yet.

## License

AGPL-3.0-only.
