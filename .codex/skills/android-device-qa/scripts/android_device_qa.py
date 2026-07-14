#!/usr/bin/env python3
"""Safe, standard-library Android QA evidence helper built around ADB."""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


class QaError(RuntimeError):
    pass


def timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


@dataclass
class CommandResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str
    duration_ms: int


class Adb:
    def __init__(self, serial: str | None = None) -> None:
        adb = shutil.which("adb")
        if not adb:
            raise QaError("adb was not found on PATH")
        self.executable = adb
        self.serial = serial

    def run(
        self,
        args: Iterable[str],
        *,
        targeted: bool = True,
        timeout: int = 30,
        binary: bool = False,
    ) -> CommandResult | tuple[CommandResult, bytes]:
        command = [self.executable]
        if targeted and self.serial:
            command.extend(["-s", self.serial])
        command.extend(str(arg) for arg in args)
        started = time.perf_counter()
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=False,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise QaError(f"command timed out after {timeout}s: {' '.join(command)}") from exc
        duration_ms = round((time.perf_counter() - started) * 1000)
        if binary:
            stdout_bytes = completed.stdout or b""
            stderr = (completed.stderr or b"").decode("utf-8", errors="replace")
            result = CommandResult(command, completed.returncode, "", stderr, duration_ms)
            return result, stdout_bytes
        stdout = (completed.stdout or b"").decode("utf-8", errors="replace")
        stderr = (completed.stderr or b"").decode("utf-8", errors="replace")
        return CommandResult(
            command,
            completed.returncode,
            stdout,
            stderr,
            duration_ms,
        )

    def text(self, args: Iterable[str], *, timeout: int = 30) -> str:
        result = self.run(args, timeout=timeout)
        assert isinstance(result, CommandResult)
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip()
            raise QaError(f"ADB command failed ({result.returncode}): {message}")
        return result.stdout.strip()

    def shell(self, *args: str, timeout: int = 30) -> str:
        return self.text(["shell", *args], timeout=timeout)


def parse_devices(raw: str) -> list[dict[str, str]]:
    devices: list[dict[str, str]] = []
    for line in raw.splitlines()[1:]:
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        serial_state = parts[0].split("\t", 1)
        if len(serial_state) == 2:
            serial, state = serial_state
            rest = parts[1:]
        elif len(parts) >= 2:
            serial, state, *rest = parts
        else:
            continue
        metadata = {"serial": serial, "state": state}
        for item in rest:
            if ":" in item:
                key, value = item.split(":", 1)
                metadata[key] = value
        devices.append(metadata)
    return devices


def resolve_serial(requested: str | None) -> tuple[str, list[dict[str, str]]]:
    adb = Adb()
    result = adb.run(["devices", "-l"], targeted=False)
    assert isinstance(result, CommandResult)
    if result.returncode != 0:
        raise QaError(result.stderr.strip() or "adb devices failed")
    devices = parse_devices(result.stdout)
    if requested:
        matches = [device for device in devices if device["serial"] == requested]
        if not matches:
            raise QaError(f"requested device {requested!r} is not connected")
        if matches[0]["state"] != "device":
            raise QaError(f"device {requested!r} is {matches[0]['state']!r}, not authorized/ready")
        return requested, devices
    ready = [device for device in devices if device["state"] == "device"]
    if len(ready) == 1:
        return ready[0]["serial"], devices
    if not ready:
        states = ", ".join(f"{d['serial']}={d['state']}" for d in devices) or "none"
        raise QaError(f"no authorized Android device is ready ({states})")
    serials = ", ".join(device["serial"] for device in ready)
    raise QaError(f"multiple devices are ready; pass --serial ({serials})")


def get_setting(adb: Adb, namespace: str, key: str) -> str | None:
    value = adb.shell("settings", "get", namespace, key).strip()
    return None if value in {"", "null", "undefined"} else value


def get_device_info(adb: Adb) -> dict[str, Any]:
    def prop(name: str) -> str:
        return adb.shell("getprop", name).strip()

    wm_size = adb.shell("wm", "size")
    wm_density = adb.shell("wm", "density")
    battery_raw = adb.shell("dumpsys", "battery")
    battery: dict[str, int | str] = {}
    for key in ("level", "status", "temperature", "plugged"):
        match = re.search(rf"^\s*{re.escape(key)}:\s*(.+)$", battery_raw, re.MULTILINE)
        if match:
            value = match.group(1).strip()
            battery[key] = int(value) if value.isdigit() else value
    return {
        "serial": adb.serial,
        "manufacturer": prop("ro.product.manufacturer"),
        "model": prop("ro.product.model"),
        "device": prop("ro.product.device"),
        "androidVersion": prop("ro.build.version.release"),
        "apiLevel": prop("ro.build.version.sdk"),
        "abi": prop("ro.product.cpu.abi"),
        "buildType": prop("ro.build.type"),
        "displaySize": wm_size.strip(),
        "displayDensity": wm_density.strip(),
        "battery": battery,
    }


def get_device_state(adb: Adb) -> dict[str, str | None]:
    return {
        "wifi_on": get_setting(adb, "global", "wifi_on"),
        "mobile_data": get_setting(adb, "global", "mobile_data"),
        "stay_on_while_plugged_in": get_setting(adb, "global", "stay_on_while_plugged_in"),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def snapshot_command(args: argparse.Namespace) -> int:
    serial, devices = resolve_serial(args.serial)
    adb = Adb(serial)
    snapshot = {
        "schemaVersion": 1,
        "capturedAt": timestamp(),
        "device": get_device_info(adb),
        "state": get_device_state(adb),
        "connectedDevices": devices,
    }
    output = Path(args.output).resolve()
    write_json(output, snapshot)
    print(json.dumps({"snapshot": str(output), "serial": serial, "state": snapshot["state"]}, ensure_ascii=False))
    return 0


def restore_command(args: argparse.Namespace) -> int:
    snapshot_path = Path(args.snapshot).resolve()
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    captured_serial = snapshot.get("device", {}).get("serial")
    requested = args.serial or captured_serial
    serial, _ = resolve_serial(requested)
    if captured_serial and serial != captured_serial:
        raise QaError(f"snapshot belongs to {captured_serial!r}, not {serial!r}")
    adb = Adb(serial)
    state = snapshot.get("state", {})
    attempts: list[dict[str, Any]] = []

    def attempt(name: str, command: list[str]) -> None:
        result = adb.run(command)
        assert isinstance(result, CommandResult)
        attempts.append({
            "name": name,
            "returncode": result.returncode,
            "stderr": result.stderr.strip(),
        })

    wifi = state.get("wifi_on")
    if wifi in {"0", "1"}:
        attempt("wifi_on", ["shell", "svc", "wifi", "enable" if wifi == "1" else "disable"])
    mobile = state.get("mobile_data")
    if mobile in {"0", "1"}:
        attempt("mobile_data", ["shell", "svc", "data", "enable" if mobile == "1" else "disable"])
    stay = state.get("stay_on_while_plugged_in")
    if stay is not None and re.fullmatch(r"\d+", str(stay)):
        attempt(
            "stay_on_while_plugged_in",
            ["shell", "settings", "put", "global", "stay_on_while_plugged_in", str(stay)],
        )

    restored = get_device_state(adb)
    for _ in range(5):
        pending = {
            key: value
            for key, value in state.items()
            if value is not None and restored.get(key) != value
        }
        if not pending:
            break
        time.sleep(1)
        restored = get_device_state(adb)
    mismatches = {
        key: {"expected": value, "actual": restored.get(key)}
        for key, value in state.items()
        if value is not None and restored.get(key) != value
    }
    result = {
        "serial": serial,
        "snapshot": str(snapshot_path),
        "attempts": attempts,
        "restoredState": restored,
        "mismatches": mismatches,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 2 if mismatches or any(item["returncode"] != 0 for item in attempts) else 0


SENSITIVE_PATTERNS = [
    (re.compile(r"(?i)Bearer\s+[A-Za-z0-9._~+/-]+=*"), "Bearer [redacted]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"), "[jwt-redacted]"),
    (re.compile(r"\b(?:sk|pk)-[A-Za-z0-9_-]{12,}\b"), "[key-redacted]"),
    (re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"), "[email-redacted]"),
    (re.compile(r"(https?://[^\s?]+)\?[^\s]+"), r"\1?[query-redacted]"),
    (re.compile(r"(?i)\b(token|api[_-]?key|access_token|refresh_token|password)=([^&\s]+)"), r"\1=[redacted]"),
]


LOG_PATTERNS = [
    ("crash", "critical", re.compile(r"FATAL EXCEPTION|Fatal signal|tombstone|Process .* has died", re.I)),
    ("anr", "high", re.compile(r"\bANR in\b|Input dispatching timed out|not responding", re.I)),
    ("memory", "high", re.compile(r"OutOfMemoryError|Failed to allocate|low memory killer|lmkd", re.I)),
    ("permission", "high", re.compile(r"SecurityException|Permission Denial|permission denied", re.I)),
    ("storage", "high", re.compile(r"ENOSPC|SQLite(?:Exception|DatabaseCorrupt)|database disk image is malformed", re.I)),
    ("network", "medium", re.compile(r"UnknownHostException|ConnectException|SocketTimeoutException|SSLHandshakeException|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED", re.I)),
    ("webview", "medium", re.compile(r"RenderProcessGone|AwContents.*destroy|chromium.*(?:error|crash)|WebView.*(?:error|crash)", re.I)),
    ("capacitor", "medium", re.compile(r"Capacitor.*(?:error|failed)|Plugin.*not implemented|Unable to load.*plugin", re.I)),
]


def redact(line: str) -> str:
    value = line.lstrip("\ufeff")
    for pattern, replacement in SENSITIVE_PATTERNS:
        value = pattern.sub(replacement, value)
    return value[:800]


def analyze_logs(paths: list[Path]) -> dict[str, Any]:
    buckets: dict[str, dict[str, Any]] = {}
    line_count = 0
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), start=1):
            line_count += 1
            for category, severity, pattern in LOG_PATTERNS:
                if not pattern.search(line):
                    continue
                bucket = buckets.setdefault(category, {
                    "category": category,
                    "severity": severity,
                    "count": 0,
                    "samples": [],
                })
                bucket["count"] += 1
                if len(bucket["samples"]) < 3:
                    bucket["samples"].append({
                        "source": path.name,
                        "line": number,
                        "text": redact(line),
                    })
    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
    findings = sorted(buckets.values(), key=lambda item: (rank[item["severity"]], item["category"]))
    return {
        "analyzedAt": timestamp(),
        "sources": [str(path) for path in paths],
        "lineCount": line_count,
        "findings": findings,
        "privacyNote": "Samples are heuristically redacted; inspect raw artifacts locally and never publish them unreviewed.",
    }


def analyze_command(args: argparse.Namespace) -> int:
    paths = [Path(value).resolve() for value in args.input]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise QaError(f"log input not found: {', '.join(missing)}")
    analysis = analyze_logs(paths)
    output = Path(args.output).resolve()
    write_json(output, analysis)
    print(json.dumps({"analysis": str(output), "findings": len(analysis["findings"])}, ensure_ascii=False))
    return 0


def package_metadata(package_text: str) -> dict[str, str | None]:
    def match(pattern: str) -> str | None:
        found = re.search(pattern, package_text, re.MULTILINE)
        return found.group(1).strip() if found else None

    return {
        "versionName": match(r"^\s*versionName=([^\s]+)"),
        "versionCode": match(r"^\s*versionCode=(\d+)"),
        "firstInstallTime": match(r"^\s*firstInstallTime=(.+)$"),
        "lastUpdateTime": match(r"^\s*lastUpdateTime=(.+)$"),
    }


def collect_command(args: argparse.Namespace) -> int:
    serial, devices = resolve_serial(args.serial)
    adb = Adb(serial)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {
        "schemaVersion": 1,
        "collectedAt": timestamp(),
        "serial": serial,
        "package": args.package,
        "artifacts": [],
        "errors": [],
    }

    def collect_text(name: str, command: list[str], *, targeted: bool = True, timeout: int = 30) -> str:
        result = adb.run(command, targeted=targeted, timeout=timeout)
        assert isinstance(result, CommandResult)
        path = output / name
        content = result.stdout
        if result.stderr:
            content += ("\n" if content else "") + "[stderr]\n" + result.stderr
        path.write_text(content, encoding="utf-8", errors="replace")
        manifest["artifacts"].append({
            "path": name,
            "command": result.command,
            "returncode": result.returncode,
            "durationMs": result.duration_ms,
        })
        if result.returncode != 0:
            manifest["errors"].append({"artifact": name, "returncode": result.returncode})
        return result.stdout

    write_json(output / "device.json", get_device_info(adb))
    write_json(output / "state.json", get_device_state(adb))
    write_json(output / "connected-devices.json", devices)
    collect_text("devices.txt", ["devices", "-l"], targeted=False)
    window_text = collect_text("window.txt", ["shell", "dumpsys", "window"], timeout=45)
    collect_text("activity.txt", ["shell", "dumpsys", "activity", "activities"], timeout=45)

    package_text = ""
    pid = ""
    if args.package:
        package_text = collect_text("package.txt", ["shell", "dumpsys", "package", args.package], timeout=45)
        write_json(output / "app.json", {
            "package": args.package,
            "metadata": package_metadata(package_text),
            "currentFocus": next((line.strip() for line in window_text.splitlines() if "mCurrentFocus=" in line), None),
        })
        pid_result = adb.run(["shell", "pidof", args.package])
        assert isinstance(pid_result, CommandResult)
        pid = (pid_result.stdout or "").strip().split(" ")[0]
        if pid.isdigit():
            collect_text("logcat-app.txt", ["logcat", "-d", "-v", "threadtime", f"--pid={pid}"], timeout=45)
        else:
            (output / "logcat-app.txt").write_text("", encoding="utf-8")
            manifest["errors"].append({"artifact": "logcat-app.txt", "message": "target process was not running"})
        collect_text(
            "logcat-crash.txt",
            ["logcat", "-d", "-v", "threadtime", "AndroidRuntime:E", "ActivityManager:E", "DEBUG:E", "libc:F", "chromium:E", "Capacitor:E", "*:S"],
            timeout=45,
        )
        collect_text("exit-info.txt", ["shell", "dumpsys", "activity", "exit-info", args.package], timeout=45)
        collect_text("meminfo.txt", ["shell", "dumpsys", "meminfo", args.package], timeout=45)
        collect_text("gfxinfo.txt", ["shell", "dumpsys", "gfxinfo", args.package, "framestats"], timeout=45)
    else:
        collect_text("logcat-app.txt", ["logcat", "-d", "-v", "threadtime", "*:W"], timeout=45)

    screenshot_result, screenshot = adb.run(["exec-out", "screencap", "-p"], binary=True, timeout=30)
    assert isinstance(screenshot_result, CommandResult)
    if screenshot_result.returncode == 0 and screenshot:
        (output / "screenshot.png").write_bytes(screenshot)
    manifest["artifacts"].append({
        "path": "screenshot.png",
        "command": screenshot_result.command,
        "returncode": screenshot_result.returncode,
        "durationMs": screenshot_result.duration_ms,
    })

    remote_ui = f"/sdcard/codex-android-device-qa-{int(time.time())}.xml"
    dump_result = adb.run(["shell", "uiautomator", "dump", remote_ui], timeout=45)
    assert isinstance(dump_result, CommandResult)
    ui_result, ui_bytes = adb.run(["exec-out", "cat", remote_ui], binary=True, timeout=30)
    assert isinstance(ui_result, CommandResult)
    adb.run(["shell", "rm", "-f", remote_ui], timeout=15)
    if ui_result.returncode == 0 and ui_bytes:
        (output / "ui.xml").write_bytes(ui_bytes)
    manifest["artifacts"].append({
        "path": "ui.xml",
        "command": dump_result.command,
        "returncode": dump_result.returncode or ui_result.returncode,
        "durationMs": dump_result.duration_ms + ui_result.duration_ms,
    })

    sockets = adb.shell("cat", "/proc/net/unix")
    webview_lines = [line for line in sockets.splitlines() if "webview_devtools_remote" in line]
    (output / "webview-sockets.txt").write_text("\n".join(webview_lines) + ("\n" if webview_lines else ""), encoding="utf-8")
    manifest["artifacts"].append({"path": "webview-sockets.txt", "command": "filtered /proc/net/unix", "returncode": 0})

    log_paths = [output / "logcat-app.txt"]
    crash_path = output / "logcat-crash.txt"
    if crash_path.exists():
        log_paths.append(crash_path)
    write_json(output / "analysis.json", analyze_logs(log_paths))
    write_json(output / "manifest.json", manifest)
    print(json.dumps({
        "output": str(output),
        "serial": serial,
        "package": args.package,
        "pid": pid or None,
        "errors": len(manifest["errors"]),
    }, ensure_ascii=False))
    return 0


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        raise QaError("at least one value is required")
    ordered = sorted(values)
    index = max(0, math.ceil(quantile * len(ordered)) - 1)
    return ordered[index]


def stats_command(args: argparse.Namespace) -> int:
    values = [float(value) for value in args.values]
    ordered = sorted(values)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    result = {
        "count": len(values),
        "values": values,
        "median": median,
        "p95": percentile(values, 0.95),
        "min": min(values),
        "max": max(values),
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot = subparsers.add_parser("snapshot", help="capture reversible device state")
    snapshot.add_argument("--output", required=True)
    snapshot.add_argument("--serial")
    snapshot.set_defaults(handler=snapshot_command)

    restore = subparsers.add_parser("restore", help="restore state captured by snapshot")
    restore.add_argument("--snapshot", required=True)
    restore.add_argument("--serial")
    restore.set_defaults(handler=restore_command)

    collect = subparsers.add_parser("collect", help="collect read-only QA evidence")
    collect.add_argument("--output", required=True)
    collect.add_argument("--package")
    collect.add_argument("--serial")
    collect.set_defaults(handler=collect_command)

    analyze = subparsers.add_parser("analyze", help="classify common Android log failures")
    analyze.add_argument("--input", nargs="+", required=True)
    analyze.add_argument("--output", required=True)
    analyze.set_defaults(handler=analyze_command)

    stats = subparsers.add_parser("stats", help="calculate auditable median and p95")
    stats.add_argument("values", nargs="+", help="numeric measurements")
    stats.set_defaults(handler=stats_command)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.handler(args))
    except (QaError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"android-device-qa: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
