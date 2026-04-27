# Spotted — Development Notes

## Camera Plugin Setup

We're using a local fork of `@capgo/camera-preview` for the custom camera experience.

- **Fork location:** `../capacitor-camera-preview` (one directory up from this repo)
- **Link method:** `file:` reference in `package.json`:
  ```json
  "@capgo/camera-preview": "file:../capacitor-camera-preview"
  ```
- **Podfile.lock** references the local path, not a remote version.

### Workflow after modifying plugin Swift code:

1. `cd ../capacitor-camera-preview && npm run build`
2. `cd ../spottedsocial && npm install --legacy-peer-deps`
3. `npx cap sync ios`
4. Rebuild in Xcode (Cmd+R)

### Test route

`/camera-test` — opens the camera preview for testing. Navigate to it from any screen.
