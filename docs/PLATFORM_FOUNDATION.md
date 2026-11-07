# AgroMax platform foundation — 7 November 2026

The 14 requested capabilities have dedicated catalog entries, grouped navigation and explicit runtime scope. The platform is available to existing accounts without replacing login, fields or satellite history.

| Capability | Available in this release | Next dependency |
| --- | --- | --- |
| 1. Multi-source satellite | Source adapter catalog; existing Sentinel-2 analysis workflow | Sentinel-1, Landsat and licensed commercial processing adapters |
| 2. Digital twin | Current geometry, crop, area, location, analysis provenance and readiness checks | Calibrated crop/soil/sensor model |
| 3. Scenarios | Persistent water/fertilizer/labor assumptions and server-calculated cost comparison | Validated crop response, yield and risk simulation |
| 4. AI field analysis | Explainable record checks and existing Filiz entry point | Validated anomaly model; no diagnosis is generated |
| 5. Temporal Earth Model | Saved analysis timeline, geometry compatibility and versioned field observations | Cross-season aligned observation series |
| 6. Prescription maps | Versioned parcel-level rate/scope drafts, application/unit validation, review flag | Spatial zones, expert identity/approval and validated variable-rate plan |
| 7. Multi-brand drones | DJI/XAG/other device profiles, adapter requirements and review-only JSON | Device/model/task-specific tested exporter |
| 8. Evidence engine | Actual saved period means and index differences, source/range references | Intervention-specific controls and causal verification |
| 9. Contradiction engine | Missing geometry/crop/observation, changed boundaries and latest failed job checks | Cross-source semantic contradiction rules |
| 10. Investigation engine | Saved priority, region, requested data and notes | Validated spatial risk prioritization |
| 11. Economics | Quantity × unit-price arithmetic; integer minor-unit totals per currency | Validated yield, price and realized impact assumptions |
| 12. MRV | JSON evidence bundle, revision references, content digest and existing PDF report link | Defined MRV standard and independent certification |
| 13. Parcel management | Existing map, atlas, records and organization modules | Organization features continue under their existing permissions |
| 14. Web/mobile | Responsive browser UI and all module links | Native/offline synchronization is not enabled |

## Data and API

- `shared/platform.js`: module, source and drone-adapter registry; readiness is explicit.
- `shared/platform-contracts.js`: strict typed-at-runtime payload validation and bounded monetary arithmetic.
- `server/platform.js`: authenticated service, field context, immutable revisions, drafts and exports.
- `GET /api/platform/bootstrap`: 14 capabilities, source configuration (not health claims), adapter states and storage scope.
- `GET /api/platform/fields/:id`: owned field, recent analysis references, preparation checks and saved files.
- `POST /api/platform/records`: create a versioned file.
- `PATCH /api/platform/records/:id`: compare-and-swap update using the expected version. Changed parcel geometry requires a new file; old provenance is preserved.
- `GET /api/platform/records/:id/revisions`: immutable saved versions.
- `GET /api/platform/records/:id/export`: **review-only** JSON; never a drone mission.
- `GET /api/platform/fields/:id/export`: evidence bundle and SHA-256 content digest. A digest is not a signature, certification or independent verification.

The release adds `platform_records` and `platform_revisions` plus indexes using idempotent, additive creation. It does not rewrite or delete existing account, field, analysis or workspace tables. Production account files are scoped to the authenticated account. The full commercial runtime maps these tables to separate `farm_platform_*` tables and scopes them to the selected organization, enforces membership/write permissions and records the actual actor. Drafts are not automatically promoted to expert-approved state. The review flag does not send an expert notification or claim delivery.

`scenarios` and `economics` use the same saved scenario data. Exported file snapshots retain geometry hashes and versions. Current-field evidence excludes results computed for a different geometry; incompatible historical jobs remain visible. Missing measurements remain missing, including zero-valued valid observations. Comparisons are observational and never presented as causal agronomic findings.

## Provider references

- [Copernicus API documentation](https://documentation.dataspace.copernicus.eu/APIs.html)
- [USGS Landsat Collection 2 Level-2 science products](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products)
- [DJI Terra agricultural prescription guide](https://repair.dji.com/help/content?customId=en-us03400005201&documentType=artical&lang=en&paperDocType=paper&re=US&spaceId=34)

These references define future adapter requirements; they are not claims that an unimplemented source or device is already connected.

## Verification

Isolated API/database tests cover ownership, tenant boundaries, viewer writes, optimistic locking, immutable revisions, zero/missing values, units, calculation bounds, geometry changes and review-only exports. Browser tests cover all new module routes, persistence after reload, edits, revision history, saved observations, exports and mobile/desktop layouts. Test accounts and parcels remain in ignored isolated fixture stores, never in the production experience.
