# NeoReader diagnostics report

Generated at: 2026-06-14T03:09:39.874Z

## Executive summary

- Artifacts analyzed: 2
- Lines analyzed: 15
- Structured events: 7
- Malformed diagnostic lines: 1
- Error groups: 4
- Slow operations with duration: 6
- Network timeouts: 1
- TTS fallbacks: 1
- Android crash/ANR/jank/memory signals: 5

## Top errors

| Count | Event | Screen | Provider | Message |
| --- | --- | --- | --- | --- |
| 1 | network.timeout |  |  |  |
| 1 | tts.provider.fallback |  | speechify | Speechify error: 500 |
| 1 | bookinfo.collect.failure | book-details | google-books | HTTP 500 |
| 1 | import.failure | import |  | bad epub |

## Slow operations

| Duration ms | Event | Status | Screen | Provider | Flow |
| --- | --- | --- | --- | --- | --- |
| 10000 | network.timeout | timeout |  |  | network-2 |
| 4210 | reader.open.success | success | reader |  | reader-1 |
| 890 | bookinfo.collect.failure | failure | book-details | google-books | bookinfo-1 |
| 650 | import.failure | failure | import |  | web-1 |
| 120 | network.request | success |  |  | network-1 |
| 0 | import.start | start | import |  | web-1 |

## Failures by provider

| Provider | Failures | Timeouts | Fallbacks |
| --- | --- | --- | --- |
| speechify | 1 | 0 | 1 |
| google-books | 1 | 0 | 0 |

## Network timeouts

| Duration ms | URL | Flow |
| --- | --- | --- |
| 10000 | https://api.example.com/books?token=[redacted] | network-2 |

## TTS premium fallback

| Provider | Fallback | Reason/Error | Flow |
| --- | --- | --- | --- |
| speechify | native | Speechify error: 500 | tts-1 |

## Android signals

| Kind | Count |
| --- | --- |
| crash | 1 |
| anr | 1 |
| jank | 2 |
| memory | 1 |

## Problematic flows

| Flow | Events | Failures | Timeouts | Max duration ms |
| --- | --- | --- | --- | --- |
| bookinfo-1 | 1 | 1 | 0 | 890 |
| web-1 | 2 | 1 | 0 | 650 |
| tts-1 | 1 | 1 | 0 | 0 |
| network-2 | 1 | 0 | 1 | 10000 |
| reader-1 | 1 | 0 | 0 | 4210 |

## Suggested next actions

- Investigate the top error group first: network.timeout.
- Review network timeout clusters by URL/provider; consider cache, retry policy, timeout tuning or clearer fallback UI.
- Review TTS premium fallback reasons; validate API keys, credits, selected voices and provider availability.
- Profile the slowest reader/import/network flows and compare before/after durations in the next optimization pass.
- Prioritize Android crash/ANR signals before UI polish; capture the surrounding logcat window for stack context.
- For jank signals, capture gfxinfo framestats or Perfetto around the affected flow.
- Inspect malformed diagnostic lines; they may indicate truncated logcat output or a parser format mismatch.

## Artifacts

| Path | Lines |
| --- | --- |
| C:\Users\johns\Documents\Projetos\NeoReader\NeoReader\src\__tests__\fixtures\diagnostics\malformed-android.log | 7 |
| C:\Users\johns\Documents\Projetos\NeoReader\NeoReader\src\__tests__\fixtures\diagnostics\sample-logcat.log | 8 |

