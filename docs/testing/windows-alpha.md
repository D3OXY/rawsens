# Windows alpha release checklist

Run this against the exact Windows artifact from the candidate GitHub Release. Record the Windows build, mouse model/DPI, RawSens version, and result beside each checkbox.

## Install and first run

- [ ] Download `win-x64-RawSens-Setup.zip` only from `github.com/D3OXY/rawsens/releases` and extract it.
- [ ] Launch `RawSens-Setup.exe`. Confirm SmartScreen identifies an unknown publisher; use **More info → Run anyway** only after checking the release URL.
- [ ] Confirm RawSens appears in Windows Installed Apps and starts without an account or login.
- [ ] At the default 1080×720 window and the smallest practical resized window, confirm every control remains reachable with no horizontal overflow.
- [ ] Use Tab/Shift+Tab through onboarding and activate controls with the keyboard. Confirm focus is visible.

## Raw Input and complete calibration

- [ ] On onboarding, confirm the input card says **Hardware Raw Input**. Treat compatibility input on Windows as a release-blocking defect.
- [ ] Set the mouse to a known DPI, enter that DPI and the measured current cm/360, and create a profile.
- [ ] Complete flicking, tracking, target switching, and micro-correction warmup/baseline trials.
- [ ] During screening, move focus away once. Confirm the trial is invalidated and repeated without advancing.
- [ ] Close RawSens during screening, reopen it, and resume the same candidate and stage with completed trials intact.
- [ ] Finish refinement and blind validation. Confirm validation uses `Option` labels instead of revealing cm/360.
- [ ] Confirm the result shows a central cm/360, useful range, confidence, reasons, dimension tradeoffs, and invalid-trial count—or plainly says the result is inconclusive.
- [ ] Run a deliberately inconsistent session. Confirm low confidence and the inconclusive warning are impossible to miss.

## History, games, and AI

- [ ] Open History, compare the latest completed result with the prior result, then resume any unfinished session.
- [ ] Export JSON, verify it contains no OpenRouter key, import it into a clean RawSens data set, and confirm profiles/sessions/results return.
- [ ] Open Games from a result. Confirm cm/360 and DPI are prefilled.
- [ ] Check CS2 and Valorant. Until verified coefficients ship, both must say **Not verified**, preserve the canonical cm/360, show the current in-game setting path, and never change game files.
- [ ] Finish a calibration with AI disabled.
- [ ] Enable sponsored AI and confirm the exact temporary-free-access message. If the Worker is not deployed/enabled, confirm the failure is recoverable and calibration continues.
- [ ] In BYOK mode, save an OpenRouter key, test a preset and a custom model ID, then remove the key. Confirm exported JSON never contains it.

## Updates and uninstall

- [ ] Install the previous candidate release, choose each update policy, and check for the newer release.
- [ ] Confirm manual mode never checks at startup; notify mode does not download; download mode prepares the update but does not install it.
- [ ] Confirm **Restart and install** opens a final confirmation dialog. Cancel once and verify the current version keeps running.
- [ ] Confirm the update only applies after explicit confirmation and the new version reopens with history intact.
- [ ] Uninstall from Windows Installed Apps. Confirm the app is removed; record whether app data was kept or removed by the chosen uninstall option.
