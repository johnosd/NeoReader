# Android Device QA Report Format

Use only sections supported by evidence; omit empty sections.

```markdown
# Android QA: <objective or issue>

- Result: Passed | Failed | Reproduced | Not reproduced | Blocked
- Severity: Critical | High | Medium | Low | Informational
- Confidence: High | Medium | Low
- Date/time and timezone:

## Environment

- Device / Android / API / ABI / display:
- App package / version / build:
- Network and power state:
- Test data or screen position:

## Reproduction

1. <exact user-visible action>
2. <next action>

Expected: <behavior>

Observed: <behavior, timing, frequency>

## Findings

1. **<severity>: <finding>** — <confirmed evidence and likely source>
2. **<severity>: <finding>** — <evidence>

Keep unrelated errors in a separate subsection. Distinguish confirmed cause from inference.

## Performance

- Conditions and sample count:
- Raw values:
- Median / p95 / maximum batch or long task:
- Comparison and configured gate:

## Regression Checks

- Manual device checks:
- Automated checks:
- Not exercised:

## Evidence

- Session/artifact path:
- Relevant log timestamps/events:
- Screenshots/UI dumps:
- Commands/tests:

## Privacy And Restoration

- Sensitive-content check:
- Original state restored:
- Remaining device/repository changes:

## Recommendation

- Immediate action:
- Follow-up validation:
- Limitations or residual risk:
```

Do not paste full logcat output or screenshots into the Markdown report. Link or name local artifacts and include short redacted excerpts only when they materially support a finding.
