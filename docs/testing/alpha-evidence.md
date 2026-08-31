# Functional alpha evidence

Validated on 2026-08-23 against the stacked alpha branches. Commands and checks below are repeatable from a clean checkout.

| Spec criterion | Evidence |
| --- | --- |
| Complete adaptive session | `src/main/functional-alpha.test.ts` completes warmup, baseline, screening, refinement, and blind validation using `native-relative` input, including an invalid retry and comfort feedback. Packaged macOS onboarding reached live native trials without development tools. |
| Four dimensions | Score and recorder tests cover flicking, tracking, target switching, and micro-correction. The functional-alpha test requires all four in the completed session. |
| Recommendation or inconclusive result | Session tests cover a bounded recommendation plus validation disagreement, ties, and noisy-repeat inconclusive results with reasons. |
| Platform input | The packaged Apple-silicon app reported **Native relative input** and started native capture. Protocol tests cover native capability and compatibility warnings. Windows CI builds the Raw Input helper; the release checklist requires a live **Hardware Raw Input** result. |
| Games | Manifest/conversion tests cover canonical conversion math, ranges, precision, and typed unavailable states. Browser validation confirmed result cm/360 and DPI prefill. CS2/Valorant remain visibly **Not verified** rather than shipping guessed coefficients. |
| AI modes and failures | Orchestrator tests cover disabled, sponsored Ox Alpha enforcement, BYOK/custom model, disclosure, invalid output, missing key, timeout, and cancellation. The live OpenRouter catalog returned Ox Alpha as available/free on the validation date; the UI makes no duration promise. |
| Credentials and portable history | Repository tests prove restart recovery, export/import, future-schema rejection, and credential-field rejection. The functional-alpha test restarts mid-session and imports the completed result into a clean repository. |
| Confirmation-gated updates | The updater has no automatic policy or startup apply path. The only renderer apply action is behind the final install dialog. Artifact tests validate both update manifests and full archives. |
| CI and releases | PR CI runs lint, types, 64+ tests, web/Worker builds, and stable Windows/macOS packaging. Release jobs have job-scoped permissions, pinned actions, isolated artifacts, and a collision/missing-file assertion before one publisher. |
| Accessibility/window behavior | Semantic browser snapshots exposed labelled navigation, inputs, alerts, progress, buttons, and headings. Keyboard and reduced-motion behavior is CSS-supported. Browser passes at 390×844 and 1080×720 had no horizontal overflow in light or dark mode. |

## Mac run

- Built `build/dev-macos-arm64/RawSens-dev.app` with `pnpm build:desktop:dev`.
- Launched the packaged app on Apple silicon.
- Completed first-run setup at 800 DPI / 40 cm/360.
- Recorded input mode: `native-relative` (`Native relative input is available`).
- Started a real native flicking capture.
- Verified elapsed-time completion while rendering was suspended, then started a second native retry without restarting the app.
- Completed the full adaptive/restart/export path through the deterministic functional-alpha test using the same persisted session contract.

## Commands

```sh
pnpm run check
pnpm build:desktop:dev
pnpm build:desktop
pnpm assert:release --platform macos --dir artifacts
```

Windows release-candidate validation follows [`windows-alpha.md`](windows-alpha.md). CI proves the Windows package and updater file contract; Raw Input and SmartScreen still require the physical PC pass before merging the release PR.
