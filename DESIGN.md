# Design Direction: Fabric Inventory Aging & Liability Dashboard

## 1. Identity & Purpose
- **System**: Monthly Fabric Stock, Aging & Financial Liability Control Center.
- **Audience**: Supply chain directors, procurement managers, plant inventory controllers, and financial auditors at Rochdale Spears Co.
- **Visual Character**: High-density operational precision. Utilitarian, clear hierarchy, high data-ink ratio. Avoid decorative AI slop, floating cards, or gratuitous gradients.

## 2. Antislop Dials
- **ENERGY**: 1 (Calm, structured, authoritative executive view)
- **RHYTHM**: 2 (Clear functional hierarchy: Global Metrics -> Filter Matrix -> Aging Distribution -> 4-Month Projection -> Batch Inspection Grid)
- **MOTION**: 1 (Instantaneous or subtle 150ms ease-out transitions on hover/tab switch only; no scroll-jacking or entrance bouncing)

## 3. Color Palette & Accessibility (WCAG AA Compliance $\ge$ 4.5:1)
- **Primary Surface**: `#ffffff` (Card background: `#ffffff`, Base page: `#f8fafc`)
- **Primary Text**: `#0f172a` (Slate 900, contrast 16.1:1 on white)
- **Secondary Text / Muted**: `#475569` (Slate 600, contrast 5.8:1 on white)
- **Border / Structural Dividers**: `#cbd5e1` / `#e2e8f0` (Slate 300/200)
- **Aging Status / Risk Accents**:
  - `0 - 3 months` (Active stock): Text `#047857` (Emerald 700), Background `#ecfdf5`
  - `3 - 6 months` (Standard buffer): Text `#0369a1` (Sky 700), Background `#f0f9ff`
  - `6 - 12 months` (Aging attention): Text `#b45309` (Amber 700), Background `#fffbeb`
  - `12 - 24 months` (High risk liability): Text `#c2410c` (Orange 700), Background `#fff7ed`
  - `+24 months` (Critical aged liability): Text `#b91c1c` (Red 700), Background `#fef2f2`
- **Brand / Focus Indicator**: `#1e40af` (Blue 800) with 2px offset for keyboard navigation.

## 4. Typography
- **Font Stack**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `'Segoe UI'`, `Roboto`, sans-serif.
- **Numerical Figures**: `tabular-nums` enabled on all metric cards and data tables to prevent horizontal jitter during filtering.

## 5. Layout & Functional Patterns
- **No dead controls**: Every filter, dropdown, search box, pagination button, and export action must be fully functional.
- **Resilient States**: Explicit views for loading, empty search results, and data error fallback.
- **Zero Fabricated Content**: Every row, figure, standard cost, customer link, and calculation is derived from real enterprise data extracts.
