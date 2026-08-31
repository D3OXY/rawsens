# Game conversion research

Verified on 2026-08-23. Sources are first-party product documentation, patch notes, support pages, or source code published by the game owner. Community calculators, wikis, leaked code, and reverse-engineered constants were excluded.

## What an exact conversion needs

For DPI `d`, target distance `c` in cm/360, and a game's horizontal coefficient `k` in degrees per mouse count per sensitivity unit:

```text
countsPer360 = d * c / 2.54
sensitivity = 360 / (countsPer360 * k)
```

The `2.54` conversion is exact: NIST defines one inch as exactly 2.54 cm. [NIST length units](https://www.nist.gov/pml/owm/si-units-length)

FOV is not part of a hip-fire cm/360 conversion. It changes the visible portion of the rotation and can change perceived speed. It matters for FOV-matched ADS conversions.

An exact manifest therefore needs first-party evidence for all of these:

- horizontal setting name and input mode
- coefficient or equivalent camera-rotation formula
- accepted range
- accepted/displayed precision
- any acceleration, axis, ADS, or FOV condition that changes the result

None of the eight games currently publishes that complete set. RawSens should not label a constant `verified` until a first-party source appears or the project records a controlled, reproducible measurement against a named game build.

## Decision matrix

| Game | First-party setting facts | Absolute cm/360 formula | Manifest decision |
| --- | --- | --- | --- |
| Counter-Strike 2 | Console path verified; current sensitivity field, range, and precision not documented | Not published for CS2 | Unavailable pending current-build measurement |
| VALORANT | Raw input is always enabled on PC | Not published | Unavailable pending current-build measurement |
| Apex Legends | `Mouse Sensitivity`, `ADS Mouse Sensitivity Multiplier`, and `Mouse Acceleration` are documented | Not published | Unavailable |
| Overwatch 2 | `Enable High Precision Mouse Input` is documented | Not published | Unavailable |
| Fortnite | `Mouse Sensitivity X` and `Mouse Sensitivity Y` are documented | Not published | Unavailable |
| Rainbow Six Siege | Hip-fire relative multiplier and integer sliders are documented | Missing the base angular coefficient | Unavailable from DPI and cm/360 alone |
| Call of Duty | `Mouse Sensitivity` and ADS controls are documented per title | Not published; franchise target is ambiguous | Unavailable; require a title/build ID |
| THE FINALS | Mouse/keyboard settings path and scoped multiplier are documented | Not published | Unavailable |

## Counter-Strike 2

Current first-party facts:

- Steam Support documents **Settings > Game > Enable Developer Console (~)** for Counter-Strike 2 and explains that the console changes game settings. It does not document the current sensitivity command, valid range, or UI precision. [Steam Support](https://help.steampowered.com/en/faqs/view/4700-D10E-26BE-DDDD)
- Valve's open-source Half-Life client scales mouse deltas by `sensitivity`, then changes yaw by `m_yaw * scaledDelta`. It registers `m_yaw` with a default of `0.022`. This is useful provenance for older Valve engines, not proof of Counter-Strike 2 behavior. [input scaling](https://github.com/ValveSoftware/halflife/blob/master/cl_dll/inputw32.cpp) [default `m_yaw`](https://github.com/ValveSoftware/halflife/blob/master/cl_dll/input.cpp)

Do not promote the older Valve formula to a CS2 manifest. Source 2 and the current CS2 input path are not the code cited above. Current range, stored precision, displayed precision, acceleration behavior, and the default yaw coefficient remain unverified.

Safe product instruction: show the calculated value only after current-build verification. Ask the user to copy it into the in-game mouse sensitivity control. Do not claim RawSens changed a config or console variable.

## VALORANT

Current first-party facts:

- Riot says VALORANT has used raw input since launch. [Patch 3.07](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-3-07/)
- Riot removed the configurable `RawInputBuffer` option in Patch 11.06 and now enables it at all times on PC. RawSens should not instruct users to find or toggle that removed setting. [Patch 11.06](https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-11-06/)
- Riot fixed dropped small mouse movements for low sensitivities during beta, but published no coefficient, range, or precision. [Patch 0.49](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-0-49/)

No Riot source found defines degrees per mouse count, the PC hip-fire setting's accepted range, or its displayed/stored precision. The commonly circulated conversion factor cannot be marked verified from first-party evidence. CS2 to VALORANT fixtures need controlled measurement on a named VALORANT build before release.

Safe product instruction: keep the game unavailable until that measurement exists. Once verified, direct users to copy the value into the PC aim sensitivity control. Do not show the console-only holistic sensitivity slider or its 0.1 precision as PC evidence. Riot added those features specifically under the console section. [Patch 9.0](https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-9-0/)

## Apex Legends

First-party facts:

- EA names the PC controls `Mouse Sensitivity`, `ADS Mouse Sensitivity Multiplier`, and `Mouse Acceleration`. The first two change camera speed; acceleration makes camera rotation depend on mouse speed. [EA accessibility guide](https://www.ea.com/able/resources/apex-legends/pc/features)
- EA directs users to the `Mouse/Keyboard` settings tab. It describes 0.5 to 5 as suggested low-to-high bands, not hard input limits. [EA settings guide](https://help.ea.com/en/articles/apex-legends/best-settings-pc/)
- EA publishes an ADS multiplier range of 0.2 to 20 and an FOV slider range of 70 to 110. It does not publish a base mouse-sensitivity range or angular coefficient. [EA PC options](https://www.ea.com/en-au/games/apex-legends/about/pc-system-requirements)

An exact hip-fire conversion is unavailable. Do not reinterpret EA's suggested 0.5 to 5 bands as validation limits. If support is later measured, require `Mouse Acceleration: Off` and treat ADS separately.

Safe product instruction: **Settings > Mouse/Keyboard > Mouse Sensitivity**. Copy only. Also tell the user that ADS and per-optic multipliers are separate from the hip-fire result.

## Overwatch 2

Blizzard documents `Enable High Precision Mouse Input` under gameplay options. The option increases how frequently the game captures mouse position. Blizzard does not publish the hip-fire sensitivity coefficient, range, or precision. [Overwatch 2 developer update](https://overwatch.blizzard.com/en-us/news/23865965/)

Exact conversion is unavailable. Forum posts by players, even on Blizzard-hosted forums, are not first-party implementation evidence.

Safe product instruction after future verification: copy the value into the all-heroes mouse sensitivity setting and enable `Enable High Precision Mouse Input`. Hero-specific scoped sensitivities need separate adapters and are out of scope for hip-fire cm/360.

## Fortnite

First-party facts:

- Epic added separate `Mouse Sensitivity X` and `Mouse Sensitivity Y` controls. New players started with equal X and Y values. [Fortnite v4.4 notes](https://www.fortnite.com/patch-notes/v4-4?lang=en-US)
- An old patch changed mouse sensitivity sliders so they stopped at 0.01 rather than 0.0. This does not establish the current range or display precision. [Fortnite v1.10 notes](https://www.fortnite.com/news/v-1-10-patch-notes?lang=en-US)
- Epic added separate `Building Sensitivity` and `Editing Sensitivity` settings under Mouse and Keyboard. They are not the base camera sensitivity. [Fortnite v24.10 notes](https://www.fortnite.com/news/fortnite-battle-royale-v24-10-let-your-eggcitement-bloom-during-spring-breakout-2023?lang=en-US)
- Epic's current support path is menu, gear icon, then the mouse-and-keyboard tab. [Epic support](https://www.epicgames.com/help/c-202300000001690/a202300000014546?lang=en-US)

Epic does not publish the angular coefficient, current range, or current precision. Exact conversion is unavailable. If support is later measured, output equal X and Y values for isotropic hip-fire aim. Keep Targeting, Scoped, Building, and Editing multipliers separate.

Safe product instruction: open **Settings > Mouse and Keyboard**, then copy the same verified base value into `Mouse Sensitivity X` and `Mouse Sensitivity Y`.

## Rainbow Six Siege

Ubisoft publishes more input math than the other games:

- `Mouse Sensitivity Horizontal` and `Mouse Sensitivity Vertical` are integer sliders from 1 to 100, default 50.
- `MouseSensitivityMultiplierUnit` defaults to 0.02 in `GameSettings.ini`.
- Ubisoft defines `Hipfire Input Yaw = Input Yaw * (MouseSensitivityMultiplierUnit * Mouse Sensitivity Horizontal)` and the equivalent pitch equation. [Ubisoft FOV and input sensitivity](https://www.ubisoft.com/en-ca/game/rainbow-six/siege/news-updates/6kY6b5JByBY3P6vQWWinla/fov-and-input-sensitivity)
- The newer ADS system has Standard and per-zoom Advanced controls. Ubisoft later raised the ADS slider maximum to 200. ADS uses visuomotor gain and FOV-dependent zoom behavior, not a single hip-fire cm/360 conversion. [ADS guide](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3IMlDGlaRFgdvQNq3BOSFv/guide-to-ads-sensitivity-in-y5s3) [Y5S3 addendum](https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3D6v1UHB1uL9bJRhVBshjw/y5s3-shadow-legacy-patch-notes-addendum)

The hip-fire equation proves relative scaling, but Ubisoft does not define the angular meaning of one unit of `Input Yaw`. DPI plus target cm/360 is therefore insufficient for an absolute slider value.

There is also a documentation error worth guarding against. Ubisoft's worked example changes an actual 31 cm/360 to a desired 30 cm/360 by multiplying the sensitivity factor by `30 / 31`. The published hip-fire equation implies the opposite direction because lowering the factor increases cm/360. Do not implement that worked example without a live measurement.

RawSens must not recommend editing `GameSettings.ini`, because the product contract says copy-only and no direct config changes. A future verified adapter may assume the documented default multiplier of 0.02 and output the two 1 to 100 sliders. It must display that assumption and keep ADS unavailable.

Safe product instruction after verification: **Options > Controls > Keyboard & Mouse Options**. Copy the same integer into `Mouse Sensitivity Horizontal` and `Mouse Sensitivity Vertical`. State that the result assumes an unchanged `MouseSensitivityMultiplierUnit` of 0.02.

## Call of Duty

`Call of Duty` is not a stable conversion target. Each title can change its input implementation and settings.

- Modern Warfare III documents `Mouse Sensitivity`, `ADS Sensitivity Multiplier`, and mouse calibration settings. [MWIII PC controls](https://www.callofduty.com/guides/training/call-of-duty-modern-warfare-III-play-guides-training-controls-pc)
- Black Ops 6 separately documents `Mouse Sensitivity`, ADS multipliers, per-zoom advanced settings, and a 1.00 default for multipliers. [Black Ops 6 controls](https://www.callofduty.com/guides/blackops6/training/call-of-duty-guides-black-ops-6-multiplayer-training-controls)

Neither guide publishes degrees per mouse count, the base setting range, or precision. Do not create one generic Call of Duty manifest. A future entry needs a canonical ID such as `call-of-duty-black-ops-6`, a build/version note, and its own measurement.

Safe product instruction after title-specific verification: **Settings > Keyboard & Mouse > Mouse > Mouse Sensitivity**. Keep ADS mode, transition timing, monitor-distance coefficient, and per-zoom multipliers outside the hip-fire result.

## THE FINALS

Embark documents **Settings > Mouse and Keyboard** as the mouse/keyboard settings path. [THE FINALS support](https://id.embark.games/uk/the-finals/support/faq/56-accessibility-and-button-remapping)

Embark has also documented a `Scoped Zoom Sensitivity Multiplier`, confirming that scoped behavior is a separate setting. [Update 1.5.0](https://www.reachthefinals.com/patchnotes/150)

No first-party source found names the base mouse sensitivity field or publishes its coefficient, range, or precision. Exact conversion is unavailable. Do not derive mouse behavior from Embark's published controller sensitivity values.

Safe product instruction after future verification: open **Settings > Mouse and Keyboard**, copy the verified base value, and leave `Scoped Zoom Sensitivity Multiplier` unchanged unless a separate scoped adapter exists.

## Required verification before enabling a manifest

CS2 and VALORANT cannot meet the ticket's `deeply verified` acceptance criterion from current first-party documentation alone. Use a manual, reproducible current-build test:

1. Record game name, build, platform, DPI, polling rate, resolution, aspect ratio, FOV, acceleration settings, and raw-input state.
2. Test at three in-game sensitivity values. Measure several full rotations in both directions and average the physical distance.
3. Confirm linearity and derive the angular coefficient. Repeat at another DPI to catch scaling or buffering errors.
4. Probe the UI's minimum, maximum, step size, displayed precision, and stored round-trip precision.
5. Test the rounded output against cm/360 and keep the error within one displayed step.
6. Commit the raw observations and calculations. Tag the manifest with the tested build and date.

Until that evidence exists, return a typed `conversion_unverified` result. Generic cm/360 remains available without a game setting.
