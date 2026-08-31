# RawSens

Free, open-source aim sensitivity calibration for Windows and macOS. No account required.

> Functional alpha. Core calibration is complete; unsigned distribution and platform validation are still in progress.

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
4. CI builds and validates Windows and macOS separately, then publishes one `vX.Y.Z` GitHub Release only when both artifact sets are complete.
5. Installed clients check `releases/latest/download` according to the user's update policy.

Unsigned builds support manual checks, notify-only checks (default), and background downloads. Applying an update requires confirmation. Unattended updates wait for authenticated, platform-signed releases.

Each release contains a Windows setup archive (with `RawSens-Setup.exe` inside), a macOS disk image, and each platform's `stable-<platform>-<arch>-update.json` plus full update archive. Windows SmartScreen or macOS Gatekeeper may warn about an unknown publisher:

- Windows: choose **More info → Run anyway** only when the release URL is `github.com/D3OXY/rawsens`.
- macOS: open **System Settings → Privacy & Security**, review the blocked RawSens app, then choose **Open Anyway**.

## Privacy

Training data and configuration are stored on-device. Optional AI sends derived trial data and feedback: sponsored requests use only `stealth/ox-alpha` through the narrow Worker in [`worker/`](worker/README.md), while BYOK requests go directly to a user-selected OpenRouter model. Production Worker deployment is an explicit operation.

## Known alpha limitations

- Releases are unsigned, so Windows SmartScreen and macOS Gatekeeper warn about an unknown publisher.
- CS2 and Valorant show manual setting locations, but stay visibly **Not verified** until their current coefficients, accepted ranges, and stored precision have reproducible source or build evidence. RawSens does not guess a game value.
- Sponsored AI works only after the project Worker is explicitly deployed and enabled. No-AI calibration remains complete; BYOK works independently.
- Unattended update apply and direct game-configuration writes are intentionally unavailable.

## License

AGPL-3.0-only.
