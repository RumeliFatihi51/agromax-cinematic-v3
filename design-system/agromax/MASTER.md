# Agromax · Canopy design system

UI/UX Pro Max is installed at `~/.codex/skills/ui-ux-pro-max` from
[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

## Direction

Agricultural operations workspace for farmers, used in the office and in the field.
Organic Biophilic + Flat Design, with a readable analytics workspace. This direction
uses the skill's verified Agriculture/Farm Tech product match. The initial generic
enterprise gateway/blue palette was unsuitable for this product and was not adopted.

- Forest navigation; warm, quiet background; white surfaces.
- Lime for active navigation, peach for plans, blue for water/weather, lilac for money.
- Existing Agromax logo, locally hosted Manrope and Lucide outlines.
- Large, direct headings, 13–14px supporting data, 16px mobile form controls.
- No decorative metrics, fictional customers, fabricated forecasts or implied provider verification.

## Implementation

`src/styles/canopy/tokens.css`: semantic tokens and accessibility foundations.
`shell.css`: desktop sidebar, tablet rail, mobile drawer and four-item dock.
`components.css`: headings, controls, forms, tables, confirmations and feedback.
`screens.css`: auth, onboarding, overview, maps, analysis, operations, weather,
history, notifications, reports, Filiz, connections and account management.

Feature styles continue to own layout and map geometry. Canopy selectors explicitly
scope visual overrides under `.agromax-ui` so lazy feature styles cannot reset the
shared language. No map, provider or permission behavior belongs in these styles.

## Interaction rules

- One dominant action per screen; useful empty states with real next steps.
- Same map for drawing and editing. List is an optional view.
- Pending requests have feedback and disable duplicate submission.
- Destructive domain-record removal requires explicit confirmation.
- Hash routes support refresh, browser Back/Forward and shared screen links.
- Roles and missing integrations are stated accurately; unavailable data is not zero.
- Search and filters operate on saved records. Currency totals stay separate.
- Visible focus, labeled controls, reduced motion, no page-level horizontal overflow.
- Mobile drawer preserves access to every module and organization selection.

## Review widths

375px, 412px, 768px, 1024px, 1440px; phone landscape; keyboard and reduced motion.
Browser fixtures are isolated under ignored `data/browser-fixtures-*` and must never
be copied to a customer database or presented as measured agricultural data.
