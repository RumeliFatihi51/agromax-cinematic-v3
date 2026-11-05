# Fieldwork interface · 5 November 2026

Fieldwork replaces the Mission Control interface. Its visual direction uses UI/UX Pro Max's Agriculture/Farm Tech and Organic Biophilic guidance, adapted to an everyday operations workspace.

## Current interface

- White navigation and surfaces, a quiet neutral background, forest primary actions, restrained sage/sand/blue accents, local Manrope and Lucide icons.
- Overview starts with real portfolio/task totals and the actual satellite map. Map and parcel-list views are available without leaving the overview. Tasks and Filiz sit beside the map; the parcel notebook follows below.
- The parcel library supports text search, mapped/unmapped filters and name/area sorting. Cards show saved geometry, crop, location and area. Existing map editing and comparison views remain accessible.
- The task planner pairs a month calendar with a chronological agenda. Users can navigate months, select or clear a date, filter pending/completed/all tasks and complete or reopen actual tasks.
- Login uses the existing branded landscape illustration and a clear form panel. The illustration is labeled as brand artwork.
- Existing weather, history, business, report, assistant and account tools inherit the shared controls, light surfaces and readable page-heading hierarchy.

## Source of truth

`src/styles/fieldwork.css` follows the shared Canopy styles and owns the current shell and page compositions. The old hologram component and orbital/mission styles have been removed. Data, authorization and provider behavior stay in their existing services.

## Verification

Production/commercial builds, TypeScript, server tests and desktop/mobile browser flows. New interface flows are also checked against an isolated SQLite API: map/list switching, atlas search, task creation/completion/persistence and parcel-editor entry. Review widths: 375, 390, 768, 1024 and 1440 pixels. No test account or parcel is added to production.
