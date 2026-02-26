

# Hide Search Icon on Map Page

## Change (1 file)

### `src/pages/Map.tsx` — lines 1242-1248

Remove the search/magnifying glass button from the Map page header. The "8 friends out" pull-up panel already provides the same friends list, making it redundant.

Simply delete these 7 lines (the search button block):
```tsx
<button
  onClick={() => setShowFriendSearch(true)}
  className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
  aria-label="Search friends"
>
  <Search className="w-5 h-5" />
</button>
```

No other pages are affected — Home, Feed, Profile, Leaderboard, and Messages all keep their search icons.

