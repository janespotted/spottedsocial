# October 16 UI and photo regressions

Run `node --test tests/*.test.cjs` and `npm run typecheck` from `mobile/`. The expanded UI tests cover popup bounds across phone sizes and font scales, local Demo media isolation, photo retry/account changes, intended area versus intended venue, and all three plan audiences.

Run `SPOTTED_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node tests/ui-fixes/plan-audience.cjs` for the isolated database tests. This applies the migration twice to a disposable local database and checks all three audiences, blocks, removed mutual relationships, expired plans, child rows, invalid values, and ownership. It never deploys a migration.

## Required native screenshot checks

Use the `spotted-regression` skill's fresh-run recorder. Identify the actual source, native shell, JavaScript bundle, backend and measured phone/font sizes. Inspect screenshots; an element's existence or a successful callback is insufficient. Preserve failed iterations and unsettled/blocked captures separately from final evidence.

- Map popup: reproduce the LA Demo crowded cluster near the top right, then all four edges. Check header, close, first and last rows, scrolling, pointer attachment, tabs and banner. Repeat compact width <=375, large width >=414, text scale >=1.3, banner on/off and short/long names. Test native dismiss and selecting a person.
- Map controls: show both Out and TBD counts. Count, legend, status, recenter and tabs must not overlap. Test day and night.
- Filters: compact phone and larger text; scroll to the last category, then tap Done. It must stay visible above the safe area.
- Share post: crowded recipient list, scroll to the final recipient; the final Send and external share footer must remain separate and reachable.
- Back controls: navigate into notification settings and a valid private party. No internal `(tabs)` label.
- Large text: Demo banner/Exit, Hot Spots title/filter and long venue hero. Venue close remains usable. “How spots rank” is absent.
- TBD: select area, replace it with a searched venue, remove it, save and reopen. Verify only one intended place is stored, status stays planning, no live coordinates/check-in are created, and chosen audience persists. Compact/larger-text layouts must keep Set as TBD reachable; long area lists and keyboard search must scroll.
- Plan: open the dropdown, select/save each of Close Friends, Friends, Friends + Mutuals, reopen for editing and verify selection. Dismiss the menu before leaving. Finish or explicitly discard the draft before navigating elsewhere. Check compact/larger text and keyboard. Do not test mutual-plan creation against a hosted backend until its migration is deployed.
- Feed photo: supply a synthetic image through the rendered camera/library callback, tap Share, verify progress/error/retry at the top, published confirmation and feed image. Test Demo (local only) and the isolated test backend separately. Repeat an upload failure then retry; verify no duplicate post.
- DM photo: attach synthetic image, verify sent image as sender and authorized recipient. Reject unrelated recipient/media resolution. Simulate failed upload and retry; draft image remains visible, successful upload is reused after message-save failure, and account changes cannot send it under another user.

Physical camera/library permissions, physical iPhone background upload and the release/TestFlight binary require a separate device smoke check. Never infer these from a development simulator. Do not change venue catalogs, rankings or production data to produce screenshots.

## Release dependency

`supabase/migrations/20261016112214_plan_mutual_audience.sql` must reach the intended backend before distributing the app with the third plan audience. It preserves existing plan audiences; only an explicit new choice broadens a plan. Deployment is separate from local implementation and regression testing.
