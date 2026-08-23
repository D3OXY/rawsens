# RawSens product and engineering specification

Status: accepted for implementation  
Target: `v0.1.0` functional alpha  
Platforms: Windows 10/11 and macOS 13+

## 1. Product

RawSens is a free, open-source desktop aim sensitivity finder. It measures aim
performance across several sensitivity candidates, adapts the test sequence,
and recommends a defensible range rather than pretending there is one perfect
number.

The app requires no account. Its calibration engine works without AI. AI can
choose useful follow-up trials, combine performance with subjective feedback,
explain tradeoffs, and produce a training recommendation. Every AI conclusion
must remain bounded by locally calculated evidence.

### Product promise

After a 15–30 minute session, a user receives:

- a recommended sensitivity range in cm/360;
- a balanced recommendation with an honest confidence level;
- separate flicking, tracking, target-switching, and micro-correction results;
- exact settings and copyable setup instructions for supported games;
- optional AI interpretation and training advice;
- a locally saved history that makes later retests comparable.

### Non-goals

- Claiming a universally perfect sensitivity.
- Injecting into games, hooking game processes, reading game memory, or
  automating game input.
- Editing game configuration files.
- Accounts, social features, cloud sync, competitive leaderboards, or
  telemetry in the functional alpha.
- Marketing RawSens as a privacy product. Data handling should be clear and
  restrained because that is good engineering, not a marketing claim.

## 2. Experience

### First run

1. Choose a primary game.
2. Enter mouse DPI and current in-game sensitivity.
3. RawSens converts the starting value to cm/360 and explains any game-specific
   assumptions.
4. Verify input capture. The app shows the active input mode:
   `hardware raw`, `native relative`, or `compatibility relative`.
5. Optionally configure AI:
   - sponsored Ox Alpha;
   - an OpenRouter key and preset model;
   - an OpenRouter key and custom model ID;
   - no AI.
6. Start calibration.

### Calibration

The session alternates short trials and intentional breaks. Each trial states
its dimension, duration, candidate sensitivity, and controls. Candidate order
is randomized so the user cannot infer that later or numerically larger values
are expected to be better.

Users can pause, restart the current trial, or abandon the session. Losing
focus or input capture invalidates the current trial instead of scoring it.

After initial screening, the app narrows the search around the strongest
candidates. It finishes with blind validation against the user's starting
sensitivity and nearby alternatives.

### Results

Results show:

- recommended range, central recommendation, and confidence;
- starting sensitivity versus recommendation;
- dimension scores and their uncertainty;
- speed/accuracy and comfort/performance tradeoffs;
- validation outcome and warnings for insufficient or inconsistent data;
- per-game converted values with copy buttons and manual instructions;
- AI explanation when enabled, clearly separated from measured results.

RawSens must say when the session is inconclusive and recommend a retest rather
than manufacturing certainty.

## 3. Calibration model

### Canonical unit

`cm/360` is the canonical sensitivity. Game settings are inputs and outputs of
conversion adapters only. The session stores DPI, field-of-view assumptions,
game version metadata, and input mode alongside every result.

### Dimensions

| Dimension | Primary observations | Typical trial |
| --- | --- | --- |
| Flicking | hit rate, angular error, acquisition time | acquire isolated targets |
| Tracking | time on target, mean error, error variance | follow a moving target |
| Target switching | transitions per second, first-shot error | alternate among targets |
| Micro-correction | correction count, overshoot, settle time | resolve small offsets |

All raw observations use monotonic timestamps. Scores are normalized within a
session so display size and refresh rate do not make different candidates look
artificially better.

### Protocol

1. **Warm-up:** establish controls and discard the measurements.
2. **Baseline:** measure the user's current sensitivity in every dimension.
3. **Screening:** test a shuffled broad range around baseline.
4. **Refinement:** test the strongest region at smaller intervals.
5. **Validation:** blindly compare the recommendation, baseline, and adjacent
   candidates with repeated trials.
6. **Report:** calculate the range, central recommendation, tradeoffs, and
   confidence.

The deterministic controller owns legal candidate bounds, minimum sample
counts, invalid-trial detection, scoring, ranking, and confidence. The AI may
propose the next candidate or dimension, but the controller rejects proposals
outside those bounds and has a deterministic fallback.

### Performance and subjective data

Measured performance is primary. After a block, the user may record comfort,
fatigue, shakiness, and perceived control. These values are stored and shown as
a separate contribution; they never silently rewrite the performance score.

The exact weighting constants must live in one versioned calibration policy.
Every session records the policy version so old results remain interpretable.

### Confidence

Confidence incorporates sample count, repeatability, separation between the
top candidates, and validation performance. It is reported as `low`, `medium`,
or `high`, with the reason visible. A narrow range is forbidden when the data
does not support one.

## 4. Input

Input capture is a platform adapter, not part of scoring.

- **Windows:** hardware Raw Input is the authoritative mode.
- **macOS:** native relative mouse deltas are the target mode. If permissions or
  runtime support prevent native capture, Pointer Lock provides a compatibility
  mode so the full flow can still be tested on macOS.
- **Web preview:** Pointer Lock compatibility mode is allowed for development.

A small native helper is acceptable when Electrobun cannot expose the required
OS primitive directly. It must communicate through a narrow typed protocol and
must not inspect other processes. macOS permission prompts must explain why
input access is needed. Results always carry their input mode, and comparisons
across materially different modes display a warning.

## 5. Game support

CS2 and Valorant receive deep support: verified conversions, current setting
locations, field-of-view assumptions, and illustrated manual instructions.

The initial verified set is:

- Counter-Strike 2
- Valorant
- Apex Legends
- Overwatch 2
- Fortnite
- Rainbow Six Siege
- Call of Duty
- The Finals

Game definitions live in a typed, versioned manifest. Each entry contains its
canonical ID, display name, conversion formula, valid range/precision, setting
label, instructions, assumptions, verification date, and source notes. Adding
a conversion should not require changing session logic.

RawSens never writes game configuration. It produces exact values, one-click
copy actions, and instructions. Unsupported games still receive cm/360.

## 6. AI

### Role

AI is an optional adaptive controller and interpreter. It receives structured
derived features, trial history, deterministic confidence information, and
user feedback. It does not receive high-frequency mouse events because those
are poor model input and waste tokens.

AI output must use a versioned schema. The app validates it before use. Invalid,
unsafe, unavailable, or slow output falls back to deterministic behavior
without losing the session.

### Modes

#### Sponsored

- Requests pass through a Cloudflare Worker.
- The Worker only permits `stealth/ox-alpha`.
- The app never receives the sponsor's OpenRouter credential.
- Per-IP Cloudflare rate limiting is accepted despite shared-IP and rotation
  limitations.
- A server-side kill switch can disable sponsored inference immediately.
- The Worker does not persist prompts or responses. Operational request and
  rejection counts are allowed.

Required UI copy:

> Sponsored AI is free while OpenRouter offers Ox Alpha for free. If that
> changes, use your own OpenRouter key. We'll try to keep a free option
> available, but can't promise one.

OpenRouter currently reports Ox Alpha as free and exposes a far-future
expiration value. RawSens must not present that value as a guarantee.

#### Bring your own key

- Requests go directly from the desktop main process to OpenRouter.
- Keys are stored using macOS Keychain or Windows DPAPI-backed storage.
- Raw keys never enter renderer storage, logs, exports, crash reports, or RPC
  responses.
- The app offers a small maintained preset list and accepts any custom
  OpenRouter model ID.
- Model capabilities are checked where possible; schema failures use the same
  deterministic fallback.

#### Disabled or unavailable

The complete deterministic finder, result report, history, and game conversion
remain usable.

## 7. Local data

Store settings, profiles, sessions, trials, derived observations, results, and
calibration policy versions on-device. The persistence boundary belongs to the
Electrobun main process; the renderer uses typed RPC.

The alpha needs portable JSON export/import with an explicit schema version.
AI credentials are excluded. Corrupt or newer data must fail safely without
destroying existing history.

No account, cloud sync, or product telemetry is included. When AI is enabled,
the UI discloses the categories of data sent and the selected provider before
the first request.

## 8. Architecture

```text
React/TanStack UI
    │ typed commands/events
Electrobun main process
    ├── session coordinator
    ├── local repository + credential vault
    ├── updater
    ├── OpenRouter client
    └── platform input adapter ── optional native helper

Pure TypeScript domain
    ├── calibration policy
    ├── scoring + confidence
    ├── adaptive candidate selection
    └── game conversion manifests

Cloudflare Worker
    └── IP limit + Ox Alpha-only OpenRouter proxy + kill switch
```

Rules:

- Domain scoring, selection, confidence, and conversion code is pure and fully
  testable without React, Electrobun, network access, or the filesystem.
- Platform input is replaceable and reports capabilities explicitly.
- Renderer code cannot access credentials or write persistence directly.
- AI suggestions cannot bypass deterministic policy.
- Shared wire formats are runtime-validated at trust boundaries.

## 9. Updates and distribution

GitHub Releases is the distribution and update source. Windows is the primary
release target; macOS is also built so the product can be exercised live on the
development Mac.

Unsigned alpha behavior:

- manual and notify-only checks are supported;
- downloading may happen in the background when selected;
- applying an update always requires explicit confirmation;
- unattended apply remains disabled until release authentication and platform
  signing are in place;
- the UI plainly warns about Windows SmartScreen and macOS Gatekeeper.

Changesets owns versions and changelogs. A changeset on `main` opens or updates
one release PR. Merging that PR runs CI, builds all supported release artifacts,
publishes one GitHub Release, and provides the metadata expected by Electrobun's
updater.

## 10. Functional-alpha acceptance criteria

The alpha is complete when:

1. A new user can configure DPI/current sensitivity and finish a complete
   adaptive session on Windows and macOS.
2. All four dimensions produce deterministic, tested scores.
3. Refinement and blind validation produce a range, central recommendation,
   and explained confidence—or an honest inconclusive result.
4. Windows uses hardware Raw Input. macOS exposes native or clearly labelled
   compatibility input and can exercise the complete product flow.
5. CS2 and Valorant conversions/instructions are deeply verified; every other
   listed game has a verified manifest entry or is visibly marked unavailable.
6. Sponsored Ox Alpha, BYOK presets/custom IDs, and no-AI mode all work with
   deterministic fallback.
7. Credentials remain outside renderer storage and exported data.
8. Sessions survive restart and portable JSON export/import works.
9. Update application requires confirmation on unsigned builds.
10. CI checks domain tests, types, formatting, web build, Windows packaging,
    and macOS packaging.
11. Merging a Changesets release PR publishes install/update artifacts for both
    platforms without manual version editing.

## 11. Deferred beyond `v0.1.0`

- Signed Windows and notarized macOS releases.
- Automatic unattended update application.
- Linux support.
- Direct game configuration writes.
- Accounts, sync, community benchmarks, or competitive rankings.
- Training plans that continue across multiple applications.

