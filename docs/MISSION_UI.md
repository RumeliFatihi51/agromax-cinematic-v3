> Historical design. Replaced by [Fieldwork](FIELDWORK_UI.md) on 5 November 2026.

# Mission Control interface · 5 November 2026

The interface now uses distinct page compositions instead of recoloring the previous dashboard.

- Overview: editorial heading, large CSS 3D terrain stage, a record-backed parcel inspector, integrated telemetry strip, action launchers, satellite map and task timeline.
- Fields: searchable parcel atlas with geometry previews, crop/location information and direct access to each parcel. Map editing and comparison table remain available through view controls.
- Tasks: date-based board for due/upcoming/completed work, list view, task creation and reversible completion. All counts and completion percentages use actual records. Dates use Europe/Istanbul.
- Entrance: full-height orbital terrain composition paired with the existing login and account forms.
- Navigation: compact sidebar and desktop shortcuts. Commercial workspaces retain their organization selector without overfilling the header.

Terrain is explicitly labeled conceptual artwork. It does not present synthetic satellite measurements. Animation can be paused and respects reduced-motion preferences. No additional 3D dependency is required.

Verification: production and commercial builds, TypeScript, 56 server tests, 18 commercial tests, and browser checks against an isolated in-memory API. The browser checks exercise parcel selection/search, map switching, task creation/completion and persistence, and parcel editor entry at widths 390, 768, 1024 and 1440.
