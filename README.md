# Fabric & Leather Inventory Aging & Liability Dashboard

An enterprise dashboard for monitoring monthly fabric, leather, and upholstery cover inventory valuation, statutory tax liabilities (12% Import Duty, 8% VAT), aging distribution, and 4-month demand projections at Rochdale Spears Co.

Live automated deployment via GitHub Pages.

---

## Business Logic & Calculation Rules

### 1. Scope & Filtering (per NOTES.md)
- **Product Groups**: Raw Materials (`RM_FABRIC`, `RM_LEATHER`, `RM_PU/PVC`, `RM_UPACCES`, `RM_BARRIER`).
- **Material Prefix Filtering**: Restricted to upholstery cover codes starting with `LH-01` (Leather), `LH-03` (Fabric), and `LH-07` (Microfiber / Other Covers).
- **Location Exclusion**: Filtered out locations containing `-DEFECT` and `UPH WIP`.
- **Quantity Basis**: Physical on-hand inventory (`PHYSICALINVENTORY`).

### 2. Standard Cost Valuation & Customer Mapping
- **Standard Costs**: Mapped from Dynamics 365 Supply Chain Management (`InventOnhandItem`). Items designated as Customer's Own Material (`COM`) carry $0.00 standard cost liability.
- **Customer Program**: Mapped from enterprise cross-reference table (`RM to Customer.xlsx`) into dedicated programs (RH, HS, Sonder, Arhaus, Soho, etc.).

### 3. Aging Buckets & Financial Liability
- **Aging Tiers**:
  - `0 - 3 months` (0 to 89 days)
  - `3 - 6 months` (90 to 179 days)
  - `6 - 12 months` (180 to 359 days)
  - `12 - 24 months` (360 to 719 days)
  - `+24 months` (720+ days)
- **Statutory Taxes**:
  - `Total Cost` = `PHYSICALINVENTORY` x `Standard Cost`
  - `Import Duty` = `Total Cost` x 12%
  - `VAT` = (`Total Cost` + `Import Duty`) x 8%
  - `Total After Tax` = `Total Cost` + `Import Duty` + `VAT`

### 4. 4-Month Raw Material Stock Projection
- **Formula**: `Ending Stock (M)` = `Starting Stock` + `Inbound (Registered PO)` - `Monthly Allocated Demand`
- **Horizon**: November 2026, December 2026, January 2027, and February 2027.
- **AWS (Average Weeks of Stock)**: Measured against forward average weekly demand.

---

## Architecture & Tech Stack

- **ETL Data Pipeline**: Python 3 (`scripts/build_data.py`) reading source workbooks and generating normalized `inventory_data.json`.
- **Frontend Dashboard**: React 18, Vite 6, Tailwind CSS. Built to zero-dependency static assets (`base: './'`).
- **Antislop Compliance**: Purposeful UI adhering strictly to Mode 1 guidelines (WCAG AA $\ge$ 4.5:1 contrast, zero AI filler or placeholder buzzwords, resilient loading/empty states, keyboard accessibility with visible focus rings).
- **CI/CD Deployment**: GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically builds and publishes to GitHub Pages on every push to `main`.

---

## Local Development

```bash
# 1. Run data ETL pipeline
python scripts/build_data.py

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev

# 4. Compile static production build
npm run build
```
