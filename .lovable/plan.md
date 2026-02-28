

## Fix "Mutual Friends" text overflow in Select pill

The `min-w-[150px]` is still too narrow. The icon + "Mutual Friends" text + chevron need more room.

**`src/pages/Profile.tsx`, line 633**: Change `min-w-[150px]` to `min-w-[170px]` on the `SelectTrigger`.

