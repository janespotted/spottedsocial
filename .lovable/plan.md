

## Fix Build Errors + Hide Scrollbars

### Build Errors
The `process` and `NodeJS` namespace errors are because `@types/node` isn't referenced. Fix by adding `"types": ["node"]` to `tsconfig.app.json` compilerOptions. The package is likely already installed (Vite depends on it).

### Scrollbars
The current `index.css` already has global scrollbar hiding on `*` selector (lines ~155-162). The styles are correct but they're inside `@layer base` which has lower specificity. Moving the scrollbar rules outside `@layer base` or adding them at global scope will ensure they override everything.

### Changes

**`tsconfig.app.json`** — Add `"types": ["node"]` to compilerOptions.

**`src/index.css`** — Add a global (non-layered) scrollbar-hide rule at the end of the file to ensure it overrides all component styles:
```css
*,
*::before,
*::after {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}
*::-webkit-scrollbar {
  display: none !important;
}
```

Two files, no layout or spacing changes.

