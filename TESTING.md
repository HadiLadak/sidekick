# Sid QA — November 7, 2026

## Verified

- Local Next.js app starts at http://localhost:3000.
- In Chrome, video-call example renders its instruction and highlights the camera icon correctly.
- Follow-up composer is present. Selecting `public/demos/video-call.jpg` through the file picker shows a screenshot preview, replacement/removal controls, and enables Help me.
- `node scripts/check-api.mjs`: six invalid/oversized request cases and two streamed screenshot cases pass. Streaming tests use saved answers via the development-only mock header; these do not measure model accuracy.
- `node scripts/check-core.cjs`: coordinate conversion, reversed boxes, clipping, non-finite/zero-area boxes, and partial JSON at every character boundary pass.
- ESLint, TypeScript and production build pass. Next.js reports a non-blocking missing font fallback metrics warning for Atkinson Hyperlegible Next.

## Real deployed API run

Command: `node scripts/check-scenarios.mjs --live https://sidekick-eosin-seven.vercel.app`

| Scenario | Result |
| --- | --- |
| Sign-in page without address bar | Pass |
| Unrequested verification code | Fail: account security check omitted |
| Unexpected payroll notification | Pass |
| Computer scam popup, Click wording and safe close target | Pass |
| Phone storage screenshot | API timeout |
| Back arrow absent from screenshot | API timeout |
| Canada Post scam text | API timeout |
| Video-call target | Pass |
| Urdu code explanation | Pass |

Saved baseline checks also fail the unsolicited-code security-check assertion. Saved answers were not modified to hide that failure.

## Changes made

- Reject null/array JSON bodies instead of returning HTTP 500.
- Filter and bound malformed history; retain the original goal in long conversations.
- Show and read scam action steps, including instructions previously hidden by the UI.
- Stop speech recognition and detach callbacks when the composer unmounts.
- Reject invalid and zero-area highlight boxes and clamp coordinates to the image.
- Strengthen the unsolicited-code prompt to explicitly include the security check in the displayed advice. This change requires a fresh live-model evaluation after deployment; it is not yet proven to resolve the model omission.
- Set the social metadata base URL so generated image links resolve to the deployed site.

## Coverage limits

This is not a claim of exhaustive testing. Live microphone/camera/screen sharing, interruption/reconnection, mobile hardware, clipboard paste/drop, native sharing, and all language/theme combinations were not exercised end to end. Production timeouts need investigation with provider/server logs. The local prompt changes have not been deployed or validated against Gemini. No private screenshots were used.
