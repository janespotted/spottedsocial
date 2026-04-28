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

## Header Patterns

- **Newsfeed**: Has a collapsing header. The page title ("Newsfeed") and tagline ("Everything disappears by 5am") collapse on scroll. The "Spotted" wordmark, LA pill, search, notification bell, and S logo are anchored and do not animate.
- **Other pages** (Plans, Map, Chat, Profile, Leaderboard): Do not have collapsing headers. Static headers only.
- Implementation is inline in `src/pages/Home.tsx`, not a shared component. If a second page needs the same pattern, do not extract a component until that second page is built — duplicate the pattern first, abstract on the third use.
- Padding and sizing of the expanded header have not been intentionally changed and should not be changed without an explicit task.
