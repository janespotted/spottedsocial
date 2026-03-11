

## Make email the primary sign-in method

Remove the collapsible wrapper and empty social sign-in section. The email form becomes the default visible content directly inside CardContent.

### Changes — `src/pages/Auth.tsx`

1. **Remove unused imports**: `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, `ChevronDown`, `cn` (if not used elsewhere), and the `emailFormOpen` state variable.

2. **Replace lines 290-429** (from `<CardContent>` through the closing `</Collapsible>`) with the form rendered directly — no collapsible, no "or use email" divider, no empty social buttons div:

```tsx
<CardContent className="space-y-5 px-6 pb-8">
  <form onSubmit={handleAuth} className="space-y-4">
    {/* signup fields, email, password, terms, buttons — same as current form content */}
  </form>
</CardContent>
```

No logic changes. Just unwrapping the form from the collapsible container so it's immediately visible.

