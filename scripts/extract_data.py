"""Extract the TMC YTD profitability workbook into data/data.js for the dashboard.

Usage: python3 scripts/extract_data.py <path-to-YTD-workbook.xlsx>

Reads each month's "<Mon> Batch P&L", "<Mon> Revenue" and "<Mon> Cogs" sheets, the
"YTD Batch P&L" (for YTD learner counts) and the "MIS Reconciliation" sheet.
Only batch-level figures and aggregate payroll totals are exported; individual
payroll lines and the names on internal (non-client) sessions are left out.
"""
import calendar
import datetime as dt
import json
import sys

import openpyxl

MONTHS = ["Apr", "May", "Jun", "Jul", "Aug"]
MONTH_NUM = {"Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8}
YEAR = 2026

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)


def num(v):
    return v if isinstance(v, (int, float)) else 0


def iso(v):
    return v.strftime("%Y-%m-%d") if isinstance(v, (dt.date, dt.datetime)) else None


def clean(v):
    return v.strip() if isinstance(v, str) else v


months, rows = [], []
for m in MONTHS:
    pl, rev, cogs = wb[f"{m} Batch P&L"], wb[f"{m} Revenue"], wb[f"{m} Cogs"]

    total_row = next(r for r in range(5, pl.max_row + 1) if pl.cell(r, 1).value == "Total")
    side = {clean(pl.cell(r, 20).value): pl.cell(r, 21).value for r in range(5, 12) if pl.cell(r, 20).value}
    months.append({
        "key": m,
        "label": f"{m}-{str(YEAR)[2:]}",
        "long": f"{calendar.month_name[MONTH_NUM[m]]} {YEAR}",
        "days": calendar.monthrange(YEAR, MONTH_NUM[m])[1],
        "opsPayroll": next(v for k, v in side.items() if k.startswith("Operations salaries")),
        "ftTeacherCostInCogs": -side["Less: FT teacher cost already charged in Cogs"],
        "opsPool": side["Total to allocate"],
        "fixedShare": side["Fixed share of pool (split by active batch-days)"],
        "variableShare": side["Variable share of pool (split by learner-days)"],
        "totalActiveDays": pl.cell(total_row, 13).value,
        "totalLearnerDays": pl.cell(total_row, 14).value,
    })

    rev_rows = {}
    for r in range(6, rev.max_row + 1):
        bid = clean(rev.cell(r, 2).value)
        if bid and not str(bid).endswith(".r"):
            rev_rows[bid] = r
    cogs_lines = {}
    for r in range(6, cogs.max_row + 1):
        bid = clean(cogs.cell(r, 2).value)
        if not bid or not isinstance(cogs.cell(r, 15).value, (int, float)):
            continue
        teacher, ttype = clean(cogs.cell(r, 3).value), clean(cogs.cell(r, 4).value)
        if teacher == "RTD":  # RTD remedial rows are shifted one column to the right
            teacher, ttype = ttype, None
        rate = cogs.cell(r, 14).value
        cogs_lines.setdefault(bid, []).append({
            "teacher": teacher,
            "type": ttype if ttype in ("Full Time", "Consultant") else None,
            "courseHours": num(cogs.cell(r, 10).value),
            "monthHours": num(cogs.cell(r, 11).value),
            "hourlyRate": rate if isinstance(rate, (int, float)) and rate > 0 else None,
            "cost": cogs.cell(r, 15).value,
        })

    for r in range(5, total_row):
        bid = clean(pl.cell(r, 1).value)
        if not bid:
            continue
        client = clean(pl.cell(r, 2).value)
        net = num(pl.cell(r, 9).value)
        teacher_cost = num(pl.cell(r, 10).value)
        ops = num(pl.cell(r, 15).value)
        rr = rev_rows.get(bid)
        row = {
            "month": m,
            "id": bid,
            "client": client,
            "segment": clean(pl.cell(r, 3).value) or ("RTD" if client == "RTD" else "Unmapped"),
            "teacher": clean(pl.cell(r, 4).value) or "-",
            "teacherType": clean(pl.cell(r, 5).value) or "-",
            "learners": num(pl.cell(r, 6).value),
            "grossRevenue": num(pl.cell(r, 7).value),
            "creditNotes": num(pl.cell(r, 8).value),
            "netRevenue": net,
            "teacherCost": teacher_cost,
            "activeDays": num(pl.cell(r, 13).value),
            "learnerDays": num(pl.cell(r, 14).value),
            "opsCost": ops,
            # Contribution recomputed so rows with blank P&L formulas (RTD) still tie to the YTD Summary.
            "contribution": net - teacher_cost - ops,
            "teacherLines": cogs_lines.get(bid, []),
        }
        if rr:
            row.update({
                "start": iso(rev.cell(rr, 4).value),
                "end": iso(rev.cell(rr, 5).value),
                "feePerLearner": num(rev.cell(rr, 7).value),
                "courseDays": num(rev.cell(rr, 8).value),
                "monthDays": num(rev.cell(rr, 9).value),
                "contractValue": num(rev.cell(rr, 11).value),
            })
        rows.append(row)

# YTD learner counts as used on the YTD Summary (one figure per batch).
ytd = wb["YTD Batch P&L"]
ytd_learners = {}
for r in range(5, ytd.max_row + 1):
    bid = clean(ytd.cell(r, 1).value)
    if bid and bid != "Total":
        ytd_learners[bid] = num(ytd.cell(r, 6).value)

# MIS reconciliation (model vs books), month columns C..G plus YTD in H.
mis_ws = wb["MIS Reconciliation"]
mis = []
for r in range(5, 37):
    label = mis_ws.cell(r, 1).value
    if not label:
        continue
    vals = [mis_ws.cell(r, c).value for c in range(3, 9)]  # Apr..Aug + YTD
    mis.append({"label": label, "values": vals if any(isinstance(v, (int, float)) for v in vals) else None})

data = {
    "fy": "FY 2026-27",
    "periodLabel": "April – August 2026",
    "groupNote": "Group includes Somika & Vinmart",
    "months": months,
    "rows": rows,
    "ytdLearners": ytd_learners,
    "mis": mis,
}
with open("data/data.js", "w") as f:
    f.write("// Generated by scripts/extract_data.py from the TMC YTD profitability workbook.\n")
    f.write("window.TMC_DATA = " + json.dumps(data, indent=1, default=str) + ";\n")

tot = lambda k: round(sum(r[k] for r in rows), 2)
print(len(rows), "batch-month rows;", "net", tot("netRevenue"), "teacher", tot("teacherCost"),
      "ops", tot("opsCost"), "contribution", tot("contribution"), "learners(YTD)", sum(ytd_learners.values()))
