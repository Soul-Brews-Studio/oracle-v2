# Dropdown Hover Bridge Pattern

**Date**: 2026-01-27
**Context**: Oracle Traces UI - fixing dropdown menu that disappeared when hovering
**Confidence**: High

## Key Learning

When a dropdown menu has a gap between the trigger element and the menu itself (common with `margin-top` or `top: calc(100% + Xpx)`), users lose hover state when moving the mouse across the gap. The menu disappears before they can click an item.

The solution is a "hover bridge" - an invisible pseudo-element that extends the hover area to cover the gap.

## The Pattern

```css
/* The dropdown container */
.dropdown {
  position: relative;
}

/* Invisible bridge that extends hover area */
.dropdown::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 8px; /* Match or exceed the gap size */
}

/* The actual menu */
.dropdownMenu {
  position: absolute;
  top: calc(100% + 4px); /* Creates a 4px gap */
  /* ... other styles */
}
```

The `::after` pseudo-element creates an invisible hover-able area between the trigger and menu. When the mouse moves through this area, it stays within the `.dropdown` element, so the hover state is maintained.

## Why This Matters

- Dropdown menus with visual gaps are common design patterns
- Without the bridge, the UX is frustrating - menu keeps closing
- This is a pure CSS solution - no JavaScript timers or complex state
- Works with both mouse hover and touch (as hover proxy)

## Alternative Approaches

1. **Remove the gap entirely**: Menu touches trigger - visually dense
2. **JavaScript delay**: Add timeout before closing - feels sluggish
3. **Transparent padding**: Increase padding on menu - affects layout
4. **This pattern**: Zero visual impact, instant response

## Tags

`css`, `ux`, `dropdown`, `hover`, `pseudo-element`, `pattern`
