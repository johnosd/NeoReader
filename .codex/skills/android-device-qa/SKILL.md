---
name: android-device-qa
description: Run evidence-based Android device QA and debugging over ADB. Use when a user connects an Android phone or emulator and asks Codex to navigate an app, reproduce a bug, inspect native or WebView UI, collect logcat/crash/network/performance evidence, compare runs, or return a diagnostic report. Handles safe device selection, device-state snapshot and restoration, adaptive navigation, privacy-aware evidence collection, and report synthesis.
---

# Android Device QA

Diagnose an Android app on a connected device while preserving user data and restoring temporary device changes. Prefer observed evidence over assumptions and return a concise, reproducible report.

## Workflow

1. Resolve the target.
   - Run `adb devices -l` and require exactly one authorized device unless the user identifies a serial.
   - Discover the package from the repository (`capacitor.config.*`, Gradle `applicationId`, manifest, or running activity) before asking.
   - Confirm the bug or QA objective from the request and existing plan. Do not broaden a diagnostic request into a code fix.
2. Create an evidence directory outside version control, normally under the OS temporary directory.
3. Capture device state before changing anything:

   ```powershell
   python <skill-dir>/scripts/android_device_qa.py snapshot --output <session>/device-before.json --serial <serial>
   ```

4. Collect a read-only baseline before clearing logs or changing app/device state:

   ```powershell
   python <skill-dir>/scripts/android_device_qa.py collect --output <session>/baseline --package <package> --serial <serial>
   ```

5. Reproduce the behavior.
   - Inspect each screen with a UI dump and screenshot; derive taps from current bounds instead of reusing coordinates from another screen/device.
   - Use short waits, verify the resulting state, and record the exact action sequence.
   - Preserve existing logcat before `adb logcat -c`. Clear only for a controlled reproduction after baseline evidence exists.
   - Use multiple equivalent runs for intermittent or performance issues.
6. Collect post-reproduction evidence and analyze it:

   ```powershell
   python <skill-dir>/scripts/android_device_qa.py collect --output <session>/reproduction --package <package> --serial <serial>
   python <skill-dir>/scripts/android_device_qa.py analyze --input <session>/reproduction/logcat-app.txt --output <session>/reproduction/analysis.json
   ```

7. Correlate device evidence with repository code and tests. Separate confirmed defects, likely causes, unrelated fixture/content problems, and unverified hypotheses.
8. Restore device state in a `finally`-equivalent step, even when reproduction fails:

   ```powershell
   python <skill-dir>/scripts/android_device_qa.py restore --snapshot <session>/device-before.json
   ```

9. Verify restoration explicitly and produce the report using [report-format.md](references/report-format.md).

## Navigation Rules

- Ask the user to unlock a protected device; never request or handle a PIN/password.
- Keep interactions inside the target app. Ignore notifications and other applications.
- Do not uninstall, clear app data, log out, delete content, make purchases, send messages, grant sensitive permissions, or replace the installed build without explicit authorization.
- Treat settings, reading progress, bookmarks, saved vocabulary, and test-account data as user data. Prefer non-mutating smoke checks.
- Announce temporary disruptive changes such as disabling Wi-Fi/mobile data or enabling stay-awake. Snapshot first and restore afterward.
- Do not leave ADB forwards, preview servers, background loggers, temporary device settings, or local screenshots running/present after the report unless the user asks to retain them.
- For detailed WebView/CDP, performance, and logcat procedures, read [navigation-diagnostics.md](references/navigation-diagnostics.md) only when that surface is relevant.

## Evidence Standards

- Record device model, Android/API, ABI, display, package/version, timestamp, network state, and whether the run was cold or warm.
- Save raw artifacts locally, but quote only the minimum safe excerpt in the report.
- Redact credentials, tokens, email addresses, URL query strings, book text, translated text, and other personal content.
- For performance comparisons, keep book/screen/position/build/network equivalent, report sample count, raw values, median and p95, and distinguish wall time from incremental CPU time.
- A successful screen render does not prove the absence of errors; inspect logs. A log message alone does not prove user impact; correlate it with the reproduction timeline.
- Never mark a check passed when it was covered only indirectly. State whether evidence is manual-device, automated-test, static inspection, or inferred.

## Report Requirements

- Lead with the outcome and severity.
- Include reproduction status, exact steps, device/app/build, observed versus expected behavior, findings with confidence, performance data when applicable, evidence paths, privacy check, and restoration status.
- Include actionable next steps. Implement a fix only when the user asked for one.
- Mention limitations such as locked device, release WebView without debugging, missing symbols, no reproducible failure, or only a high-end reference device.
- Return the report in the final response. Save it under `docs/qa/android/` only when the user asks for a durable repository artifact or an existing plan requires one.

## Bundled Script

Use `scripts/android_device_qa.py` for deterministic device selection, state capture/restoration, evidence collection, and first-pass log classification. It uses only the Python standard library and ADB. Read or patch it only when a platform-specific failure requires adaptation.
