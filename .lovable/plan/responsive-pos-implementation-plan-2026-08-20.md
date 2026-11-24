# Responsive POS Implementation Plan

Make the POS module fully device responsive for mobile, tablet, and desktop.

## User Review Required

> [!IMPORTANT]
> The POS layout will shift from a side-by-side grid to a stacked layout on smaller screens. The sidebar (Billing/Payment) will be collapsible or moved below the cart on mobile.

## Proposed Changes

### POS Layout (`src/routes/sales.pos.tsx`)
-   **Mobile Header**: Optimize the top bar to hide non-essential badges and text on small screens.
-   **Search & Scan Row**: Stack search, scan, and "Add Product" buttons on mobile.
-   **Main Grid**:
    -   Switch from `lg:grid-cols-[1fr_400px]` to a single column on mobile/tablet.
    -   Implement a "View Cart" vs "View Billing" toggle or scroll-down behavior for mobile.
-   **Cart Table**:
    -   Convert the grid-based cart lines to a more flexible card-like layout on mobile.
    -   Hide less important columns (SKU, Generic) or move them to a secondary line.
-   **Billing Sidebar**:
    -   Ensure inputs (Discount, Tax) are large enough for touch targets.
    -   Optimize the summary section for small widths.

### Search Dropdown (`src/components/pos/pos-search-dropdown.tsx`)
-   Adjust the absolute positioning and width for mobile screens.
-   Reduce padding and font sizes slightly to fit more information.

### UI Components
-   Check touch targets for all buttons and inputs in the POS flow.

## Technical Details
-   Use Tailwind CSS responsive modifiers (`sm:`, `md:`, `lg:`).
-   Utilize `lucide-react` icons effectively for mobile-only actions.
-   Ensure the viewport meta tag is correct (already handled by the framework).
