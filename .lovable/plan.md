

## Fix Build Error in camera-service.ts

### Problem
A duplicate `isNativePlatform()` function and a broken `captureVideo()` stub with literal `...` were appended to the file, causing TS1128.

### Fix — `src/lib/camera-service.ts`

Remove lines 183–191 (the duplicate function and broken stub) so the file ends cleanly after the original `isNativePlatform()` at line 182.

