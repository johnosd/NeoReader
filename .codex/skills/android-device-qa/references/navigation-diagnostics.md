# Navigation And Diagnostics Reference

## Adaptive navigation

1. Capture a screenshot and `uiautomator dump` before the first interaction and after every uncertain transition.
2. Parse visible nodes with text/content-desc and non-zero bounds.
3. Tap the center of the current node bounds. Avoid coordinates copied from a previous route, orientation, density, or device.
4. Verify screen identity through two signals when possible: visible UI plus current activity, log event, or DOM state.
5. Prefer Android Back for reversible dismissal. Confirm whether it closed a sheet, left a reader, or exited the app.

Use `view_image` for screenshots already pulled to disk. UI Automator may expose hidden WebView accessibility nodes with `[0,0][0,0]`; do not treat them as visible.

## Controlled reproduction

- Collect baseline logs before clearing logcat.
- Clear with `adb logcat -c` only immediately before a timed reproduction.
- Record start/end timestamps and all input actions.
- After the behavior settles, collect app-PID logs plus AndroidRuntime/ActivityManager errors.
- If the process dies, the PID-filtered log may be incomplete; use the crash-filter artifact and `dumpsys activity exit-info <package>` when supported.

## WebView and CDP

Use CDP only for debuggable WebViews and only when DOM/computed-style/runtime evidence is needed.

1. Discover sockets:

   ```powershell
   adb shell cat /proc/net/unix | Select-String webview_devtools_remote
   ```

2. Forward a free local port to the exact `localabstract:` socket.
3. Read `http://127.0.0.1:<port>/json` and select the target app page, not ad or third-party frames.
4. Inspect DOM, open shadow roots, iframe documents, computed styles, performance entries, or app state without mutating user data.
5. Remove the forward with `adb forward --remove tcp:<port>`.

Do not expose the DevTools endpoint beyond loopback. Do not leave forwards active.

## Performance

- Separate cold install/start, cold process start, warm start, reader/app readiness, and post-ready enhancement work.
- Use at least 10 equivalent samples for median/p95 when practical. For `n` sorted samples, p95 is index `ceil(0.95*n)-1`.
- Capture raw values in the report so calculations are auditable.
- Do not run build/test workloads on the host in parallel with device timing.
- Inspect `dumpsys gfxinfo <package> framestats`, app diagnostics, and long tasks. A large total incremental duration is acceptable only when individual batches remain within the agreed frame budget.

## Offline checks

Snapshot state first. Prefer reversible service commands:

```powershell
adb shell svc wifi disable
adb shell svc data disable
```

Verify both reported settings and actual app behavior. Restore via the bundled script even if the test fails. Do not toggle airplane mode unless explicitly required because it can affect calls, Bluetooth, and other user activity.

## Log interpretation

Prioritize:

- `FATAL EXCEPTION`, native fatal signals, tombstones, and process death.
- ANR/input dispatch timeouts.
- `OutOfMemoryError`, allocation failures, or low-memory kills.
- `SecurityException` and permission denials.
- storage/database corruption or `ENOSPC`.
- network DNS/connect/timeout/TLS failures.
- WebView/chromium renderer crashes and Capacitor plugin failures.

Correlate timestamps with actions. Errors from unrelated packages, malformed test books, ads, operating-system services, or prior sessions are not app findings unless they affect the reproduced flow.

## Privacy

Treat raw logcat, UI XML, screenshots, translations, book content, account identifiers, URLs, and filesystem paths as potentially sensitive. Keep raw artifacts local, redact report excerpts, and delete temporary evidence after synthesis unless retention was requested.
