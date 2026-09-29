# TMC – B2B Client-wise Profitability Dashboard (FY 2026-27 YTD)

An interactive dashboard for **The Migration Company (TMC)**. It turns the B2B figures in the "TMC YTD
Profitability Analysis" workbook (April–August 2026) into views a client can read without going
through the spreadsheet. You can view the full year to date or any single month.

## Open it

- **Locally:** download or clone the repo and double-click `index.html`. No server or install is needed.
- **Online:** https://rohitarjun1020.github.io/Client-Wise-Gross-Magin--August-26/ (GitHub Pages, published from the `gh-pages` branch).

## What's inside

| Tab | What it shows |
|---|---|
| **Overview** | Headline KPIs for the chosen period, a month-by-month split of revenue, where every ₹100 goes, a billing-to-contribution waterfall, and auto-generated takeaways |
| **Month by month** | Revenue and cost split per month, gross and contribution margin trends, a client × month table (as on the YTD Summary), and the monthly P&L totals |
| **Clients** | Revenue and margin by client, Group vs Non-group, client cards, and the client summary table |
| **Batches** | Margin for every batch, the Batch P&L, and a drill-down per batch showing its month-by-month figures, how each month was calculated, and a "what if" simulator |
| **How it's calculated** | The model's logic in plain language, a worked example, the monthly ops cost pool, the tie-out to the MIS books, and a glossary |

Filters apply across all tabs: period (YTD or a single month), segment (All / Group / Non-group), client, and
the margin view (after teacher cost, or after teacher + ops cost). The dashboard reports figures only. It gives no
ratings or recommendations.

## Margin definitions

- **Gross margin** = Net revenue − Teacher cost (the "Contribution" column on the workbook's Client Summary sheet)
- **Contribution** = Gross margin − share of the operations team cost. Each month's ops pool (B2B operations salaries less full-time teacher cost already in COGS) is shared 40% by active batch-days and 60% by learner-days.

## Files

```
index.html               page layout and styles
app.js                   calculations, charts and interactions (plain JS + SVG)
data/data.js             batch-by-month data, monthly ops pools and MIS tie-out extracted from the workbook
assets/tmc-logo.png      TMC logo
scripts/extract_data.py  regenerates data/data.js from a new month's workbook
```

## Updating for a new month

Add the new month's sheets to the workbook, add the month to `MONTHS` in `scripts/extract_data.py`, then run:

```bash
pip install openpyxl
python3 scripts/extract_data.py "TMC_YTD_Profitability_Analysis.xlsx"
```

Then update the period text in `index.html`. The workbook itself is not committed, because this
repository is public and the workbook contains individual payroll lines. Only batch-level figures
and the total operations salary pool are exported.
