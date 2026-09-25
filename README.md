# TMC – Client-wise Gross Margin Dashboard (August 2026)

An interactive dashboard for **The Migration Company (TMC)**. It turns the August
"Profitability by Courses Segment" workbook into views a client can read without
going through the spreadsheet.

## Open it

- **Locally:** download or clone the repo and double-click `index.html`. No server or install is needed.
- **Online:** enable GitHub Pages (Settings → Pages → Deploy from branch, `/` root). The dashboard is then served at the Pages URL.

## What's inside

| Tab | What it shows |
|---|---|
| **Overview** | Headline KPIs, where every ₹100 of revenue goes, a billing-to-contribution waterfall, and auto-generated takeaways |
| **Clients** | Revenue and margin by client, Group vs Non-group comparison, client cards and the Client Summary table |
| **Batches** | Margin for every batch with a health rating, the full Batch P&L, and a drill-down per batch showing how its revenue and cost were calculated, plus a "what if" simulator for learners and fee |
| **Teachers** | Full-time vs consultant economics, cost per teaching hour, full-time capacity used, and a teacher table |
| **How it's calculated** | The model's logic in plain language, a worked example, the ops cost pool, and a glossary |

Filters apply across all tabs: segment, client, teacher type, and the margin view (after teacher cost, or after teacher + ops cost).

## Margin definitions

- **Gross margin** = Net revenue − Teacher cost (the "Contribution" column on the workbook's Client Summary sheet)
- **Contribution** = Gross margin − share of the operations team cost (the Batch P&L sheet). The ops cost is shared across batches by revenue.

## Files

```
index.html               page layout and styles
app.js                   calculations, charts and interactions (plain JS + SVG)
data/data.js             batch-level data extracted from the workbook
assets/tmc-logo.png      TMC logo
scripts/extract_data.py  regenerates data/data.js from a new month's workbook
```

## Updating for a new month

```bash
pip install openpyxl
python3 scripts/extract_data.py "Profitability_by_Courses_Segment_-_<Month>.xlsx"
```

Then update the month label in `index.html`. The workbook itself is not committed, because this
repository is public and the workbook contains individual payroll lines. Only batch-level figures
and the total operations salary pool are exported.
