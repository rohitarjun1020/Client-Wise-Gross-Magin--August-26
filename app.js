/* TMC B2B client-wise profitability dashboard (FY 2026-27 YTD). Plain JS + inline SVG, no build step. */
(function () {
  "use strict";

  const D = window.TMC_DATA;
  const MONTHS = D.months;
  const MONTH = Object.fromEntries(MONTHS.map((m) => [m.key, m]));

  // ---------- derived rows (one per batch per month) ----------
  const rows = D.rows.map((r) => {
    const grossMargin = r.netRevenue - r.teacherCost;
    const hours = (r.teacherLines || []).reduce((s, l) => s + (l.monthHours || 0), 0);
    return Object.assign({}, r, {
      grossMargin, hours,
      gm: r.netRevenue ? grossMargin / r.netRevenue : 0,
      cm: r.netRevenue ? r.contribution / r.netRevenue : 0,
    });
  });

  // ---------- state ----------
  const state = { tab: "overview", period: "YTD", segment: "All", client: "All", basis: "net", matrix: "netRevenue" };
  const sorts = { client: { key: "netRevenue", dir: -1 }, batch: { key: "netRevenue", dir: -1 } };

  // ---------- formatting ----------
  const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const rs = (n) => (n < 0 ? "−₹" : "₹") + inr.format(Math.abs(Math.round(n)));
  const rsShort = (n) => {
    const a = Math.abs(n), s = n < 0 ? "−₹" : "₹";
    if (a >= 1e5) return s + (a / 1e5).toFixed(2) + " L";
    if (a >= 1e3) return s + (a / 1e3).toFixed(1) + "K";
    return s + Math.round(a);
  };
  const pct = (x, d = 1) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtDate = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–");
  const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + "s"}`;
  const fit = (s, px, cw) => { const n = Math.floor(px / cw); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s; };

  const segColor = (s) => (s === "Group" ? "var(--seg-group)" : "var(--seg-non)");

  const isYTD = () => state.period === "YTD";
  const periodLabel = () => (isYTD() ? `YTD (${MONTHS[0].key}–${MONTHS[MONTHS.length - 1].key})` : MONTH[state.period].long);
  const periodShort = () => (isYTD() ? "YTD" : MONTH[state.period].label);
  const basisLabel = () => (state.basis === "gross" ? "Gross margin (after teacher cost)" : "Contribution margin (after teacher + ops cost)");
  const mOf = (x) => (state.basis === "gross" ? x.gm : x.cm);
  const profitOf = (x) => (state.basis === "gross" ? x.grossMargin : x.contribution);

  // ---------- filtering & aggregation ----------
  function passes(r) {
    return (state.segment === "All" || r.segment === state.segment) && (state.client === "All" || r.client === state.client);
  }
  const inPeriod = (r) => isYTD() || r.month === state.period;
  const filtered = () => rows.filter((r) => inPeriod(r) && passes(r));
  const filteredAllMonths = () => rows.filter(passes);

  // Learners are counted once per batch: the YTD Summary's figure for YTD, else that month's.
  function learnersOf(list, ytd) {
    const by = new Map();
    list.forEach((r) => by.set(r.id, Math.max(by.get(r.id) || 0, r.learners)));
    let n = 0;
    by.forEach((v, id) => { n += ytd && D.ytdLearners[id] !== undefined ? D.ytdLearners[id] : v; });
    return n;
  }
  function agg(list, ytd = isYTD()) {
    const a = { rows: list.length, batches: new Set(list.map((r) => r.id)).size, learners: learnersOf(list, ytd), grossRevenue: 0, creditNotes: 0, netRevenue: 0, teacherCost: 0, opsCost: 0, contribution: 0, hours: 0, activeDays: 0, learnerDays: 0 };
    list.forEach((r) => { for (const k of ["grossRevenue", "creditNotes", "netRevenue", "teacherCost", "opsCost", "contribution", "hours", "activeDays", "learnerDays"]) a[k] += r[k] || 0; });
    a.grossMargin = a.netRevenue - a.teacherCost;
    a.gm = a.netRevenue ? a.grossMargin / a.netRevenue : 0;
    a.cm = a.netRevenue ? a.contribution / a.netRevenue : 0;
    return a;
  }
  function groupBy(list, key) {
    const m = new Map();
    list.forEach((b) => { const k = typeof key === "function" ? key(b) : b[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(b); });
    return m;
  }
  const monthOrder = (k) => MONTHS.findIndex((m) => m.key === k);
  const monthSpan = (keys) => {
    const s = [...new Set(keys)].sort((a, b) => monthOrder(a) - monthOrder(b));
    return s.length === 1 ? s[0] : s.length === monthOrder(s[s.length - 1]) - monthOrder(s[0]) + 1 ? `${s[0]}–${s[s.length - 1]}` : s.join(", ");
  };
  function batchAgg(list) {
    return [...groupBy(list, "id")].map(([id, l]) => {
      l.sort((a, b) => monthOrder(a.month) - monthOrder(b.month));
      const teachers = [...new Set(l.map((r) => r.teacher))], types = [...new Set(l.map((r) => r.teacherType))];
      return Object.assign(agg(l), {
        id, client: l[0].client, segment: l[0].segment, teacher: teachers.join(" / "),
        teacherType: types.length === 1 ? types[0] : "Mixed", months: monthSpan(l.map((r) => r.month)), monthCount: l.length, last: l[l.length - 1],
      });
    });
  }

  // ---------- tooltip ----------
  const tipEl = document.getElementById("tooltip");
  let tips = [];
  const tipId = (html) => { tips.push(html); return tips.length - 1; };
  const ttRow = (label, value, color) => `<div class="tt-row"><span class="l">${color ? `<i class="swatch" style="background:${color}"></i>` : ""}${label}</span><b class="num">${value}</b></div>`;
  function aggTip(title, a, extra = "") {
    return `<div class="tt-title">${title}</div>` + ttRow("Net revenue", rs(a.netRevenue), "var(--revenue)") + ttRow("Teacher cost", rs(a.teacherCost), "var(--teacher)") +
      ttRow("Ops team cost", rs(a.opsCost), "var(--ops)") + ttRow("Contribution", rs(a.contribution), "var(--contrib)") + "<hr>" +
      ttRow("Gross margin", pct(a.gm)) + ttRow("Contribution margin", pct(a.cm)) + extra;
  }
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t || tips[t.dataset.tip] === undefined) { tipEl.style.opacity = 0; return; }
    tipEl.innerHTML = tips[t.dataset.tip];
    tipEl.style.opacity = 1;
    const r = tipEl.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tipEl.style.left = Math.max(8, x) + "px";
    tipEl.style.top = Math.max(8, y) + "px";
  });
  document.addEventListener("scroll", () => { tipEl.style.opacity = 0; }, { passive: true });

  // ---------- SVG helpers ----------
  // Bar with a 4px rounded data-end and a square baseline end.
  function hBarPath(x0, x1, y, h, r = 4) {
    if (Math.abs(x1 - x0) < 0.5) return "";
    const rr = Math.min(r, Math.abs(x1 - x0), h / 2);
    if (x1 > x0) return `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`;
    return `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
  }
  function vBarPath(x, w, yBase, yTop, r = 4) {
    if (Math.abs(yBase - yTop) < 0.5) return "";
    const rr = Math.min(r, Math.abs(yBase - yTop), w / 2);
    if (yTop < yBase) return `M${x},${yBase}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yBase}Z`;
    return `M${x},${yBase}V${yTop - rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop - rr}V${yBase}Z`;
  }
  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const out = [];
    for (let v = Math.floor(min / step) * step; ; v += step) { out.push(+v.toFixed(10)); if (v >= max - 1e-9) break; }
    return out;
  }
  const widthOf = (el) => Math.max(280, el.clientWidth);
  const empty = (el, msg = "Nothing matches these filters.") => { el.innerHTML = `<div class="empty">${msg}</div>`; };

  // Horizontal bar chart (single measure, may be negative).
  function hbarChart(el, items, o) {
    const W = widthOf(el), labelW = Math.min(o.labelW || 150, W * 0.36), valW = o.valW || 70, rowH = 34, barH = 18, top = 22;
    const vals = items.map((r) => r.value);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    if (o.max !== undefined) hi = Math.max(hi, o.max);
    const ticks = niceTicks(lo, hi, W < 500 ? 3 : 5);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const x0 = labelW + 8, x1 = W - valW;
    const sx = (v) => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0);
    const H = top + items.length * rowH + 6;
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.aria || "")}">`;
    ticks.forEach((t) => { s += `<line class="gridline" x1="${sx(t)}" x2="${sx(t)}" y1="${top - 6}" y2="${H - 4}"/><text x="${sx(t)}" y="${top - 10}" text-anchor="middle">${o.tick(t)}</text>`; });
    s += `<line class="axis" x1="${sx(0)}" x2="${sx(0)}" y1="${top - 6}" y2="${H - 4}"/>`;
    items.forEach((r, i) => {
      const y = top + i * rowH, by = y + (rowH - barH) / 2;
      s += `<g class="row" data-tip="${tipId(r.tip)}"${r.click ? ` data-click="${esc(r.click)}"` : ""}><rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}" rx="6"/>`;
      if (r.track !== undefined) s += `<path d="${hBarPath(sx(0), sx(r.track), by, barH)}" style="fill:var(--surface-2)"/>`;
      s += `<path d="${hBarPath(sx(0), sx(r.value), by, barH)}" style="fill:${r.color}"/>`;
      s += `<text x="${labelW}" y="${y + rowH / 2 + (r.sub ? -2 : 4)}" text-anchor="end" class="t-strong">${esc(fit(r.label, labelW, 6.6))}</text>`;
      if (r.sub) s += `<text x="${labelW}" y="${y + rowH / 2 + 11}" text-anchor="end" style="font-size:10px">${esc(fit(r.sub, labelW, 5.6))}</text>`;
      const vx = r.value >= 0 ? sx(Math.max(r.value, r.track || 0)) + 6 : sx(0) + 6;
      s += `<text x="${vx}" y="${y + rowH / 2 + 4}" class="t-strong num">${r.valueLabel}</text></g>`;
    });
    el.innerHTML = s + "</svg>";
  }

  // Stacked columns, one per month: teacher | ops | contribution (or teacher | gross margin).
  function stackLegend() {
    const gross = state.basis === "gross";
    return `<span><i class="swatch" style="background:var(--teacher)"></i>Teacher cost</span>` +
      (gross ? "" : `<span><i class="swatch" style="background:var(--ops)"></i>Ops team cost</span>`) +
      `<span><i class="swatch" style="background:var(--contrib)"></i>${gross ? "Gross margin" : "Contribution"}</span>` +
      `<span><i class="swatch" style="background:var(--text-primary);height:2px;width:14px;border-radius:0"></i>Net revenue (where costs exceed it)</span>`;
  }
  function monthStack(el, list, opts = {}) {
    const byM = groupBy(list, "month"), gross = state.basis === "gross";
    const cols = MONTHS.map((m) => ({ m, a: agg(byM.get(m.key) || [], false), has: byM.has(m.key) }));
    if (!cols.some((c) => c.has)) return empty(el);
    const W = widthOf(el), H = opts.height || 260, top = 24, bottom = 46, left = 50;
    const tops = cols.map((c) => Math.max(c.a.netRevenue, c.a.teacherCost + (gross ? 0 : c.a.opsCost)));
    const ticks = niceTicks(0, Math.max(...tops, 1), 4), ymax = ticks[ticks.length - 1];
    const sy = (v) => top + (1 - v / ymax) * (H - top - bottom);
    const band = (W - left) / cols.length, bw = Math.min(56, band * 0.55);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Monthly revenue split into costs and contribution">`;
    ticks.forEach((t) => { s += `<line class="gridline" x1="${left}" x2="${W}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${left - 6}" y="${sy(t) + 4}" text-anchor="end">${rsShort(t).replace(".00 L", " L")}</text>`; });
    s += `<line class="axis" x1="${left}" x2="${W}" y1="${sy(0)}" y2="${sy(0)}"/>`;
    cols.forEach((c, i) => {
      const cx = left + band * i + band / 2, x = cx - bw / 2, a = c.a;
      const dim = !isYTD() && state.period !== c.m.key;
      const left$ = gross ? a.grossMargin : a.contribution;
      const segs = [["Teacher cost", a.teacherCost, "var(--teacher)"]];
      if (!gross) segs.push(["Ops team cost", a.opsCost, "var(--ops)"]);
      if (left$ > 0) segs.push([gross ? "Gross margin" : "Contribution", left$, "var(--contrib)"]);
      const tip = aggTip(`${c.m.long}`, a, ttRow("Batches", a.batches) + `<div class="tt-row" style="margin-top:4px"><span>Click to ${dim || isYTD() ? "show only this month" : "go back to YTD"}</span></div>`);
      s += `<g class="row" data-tip="${tipId(tip)}" data-month="${c.m.key}" style="cursor:pointer${dim ? ";opacity:.35" : ""}"><rect class="hit" x="${cx - band / 2}" y="${top - 18}" width="${band}" height="${H - top + 18}" rx="6"/>`;
      let cur = 0;
      segs.forEach((sg, j) => {
        const y0 = sy(cur), y1 = sy(cur + sg[1]) + (j < segs.length - 1 ? 1 : 0);
        const last = j === segs.length - 1;
        s += last ? `<path d="${vBarPath(x, bw, y0 - (j ? 1 : 0), y1)}" style="fill:${sg[2]}"/>` : `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(0.5, Math.abs(y0 - y1) - (j ? 1 : 0))}" style="fill:${sg[2]}"/>`;
        cur += sg[1];
      });
      if (left$ < 0 && a.netRevenue > 0) s += `<line x1="${x - 4}" x2="${x + bw + 4}" y1="${sy(a.netRevenue)}" y2="${sy(a.netRevenue)}" style="stroke:var(--text-primary);stroke-width:2"/>`;
      if (c.has) s += `<text x="${cx}" y="${sy(Math.max(a.netRevenue, cur)) - 6}" text-anchor="middle" class="t-strong num" style="font-size:${W < 460 ? 9 : 11}px">${W < 460 ? rsShort(a.netRevenue).replace("₹", "").replace(" L", "L") : rsShort(a.netRevenue)}</text>`;
      s += `<text x="${cx}" y="${H - bottom + 16}" text-anchor="middle" class="${dim ? "" : "t-strong"}">${c.m.label}</text>`;
      if (c.has && a.netRevenue) s += `<text x="${cx}" y="${H - bottom + 30}" text-anchor="middle" class="num">${pct(mOf(a), 0)}</text>`;
      s += `</g>`;
    });
    s += `<text x="${left - 6}" y="${H - bottom + 30}" text-anchor="end" style="font-size:10px">${state.basis === "gross" ? "GM %" : "CM %"}</text>`;
    el.innerHTML = s + "</svg>";
  }

  // Two-series line chart of margin % by month.
  function marginLines(el, list) {
    const byM = groupBy(list, "month");
    const pts = MONTHS.map((m) => { const l = byM.get(m.key); const a = l ? agg(l, false) : null; return { m, a: a && a.netRevenue ? a : null }; });
    if (!pts.some((p) => p.a)) return empty(el);
    const series = [{ k: "gm", name: "Gross margin", color: "var(--revenue)" }, { k: "cm", name: "Contribution margin", color: "var(--contrib)" }];
    const vals = pts.filter((p) => p.a).flatMap((p) => [p.a.gm, p.a.cm]);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0.1, ...vals), 4);
    const W = widthOf(el), H = 260, top = 16, bottom = 30, left = 44, right = 58;
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const sy = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
    const band = (W - left - right) / pts.length, sx = (i) => left + band * i + band / 2;
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Margin percentage by month">`;
    ticks.forEach((t) => { s += `<line class="${t === 0 ? "axis" : "gridline"}" x1="${left}" x2="${W - right}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${left - 6}" y="${sy(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`; });
    pts.forEach((p, i) => {
      const tip = p.a ? `<div class="tt-title">${p.m.long}</div>${ttRow("Gross margin", pct(p.a.gm), "var(--revenue)")}${ttRow("Contribution margin", pct(p.a.cm), "var(--contrib)")}${ttRow("Net revenue", rs(p.a.netRevenue))}` : `<div class="tt-title">${p.m.long}</div>No revenue in this selection`;
      s += `<g class="row" data-tip="${tipId(tip)}" data-month="${p.m.key}" style="cursor:pointer"><rect class="hit" x="${sx(i) - band / 2}" y="${top}" width="${band}" height="${H - top - bottom}" rx="6"/></g>`;
      s += `<text x="${sx(i)}" y="${H - 10}" text-anchor="middle" class="${!isYTD() && state.period === p.m.key ? "t-strong" : ""}">${p.m.label}</text>`;
    });
    series.forEach((se) => {
      let d = "", pen = false;
      pts.forEach((p, i) => { if (p.a) { d += `${pen ? "L" : "M"}${sx(i)},${sy(p.a[se.k])}`; pen = true; } else pen = false; });
      s += `<path d="${d}" style="fill:none;stroke:${se.color};stroke-width:2;stroke-linejoin:round;stroke-linecap:round;pointer-events:none"/>`;
      pts.forEach((p, i) => { if (p.a) s += `<circle cx="${sx(i)}" cy="${sy(p.a[se.k])}" r="4.5" style="fill:${se.color};stroke:var(--surface-1);stroke-width:2;pointer-events:none"/>`; });
      const lastI = pts.map((p) => !!p.a).lastIndexOf(true);
      if (lastI >= 0) s += `<text x="${sx(lastI) + 10}" y="${sy(pts[lastI].a[se.k]) + 4}" class="t-strong num">${pct(pts[lastI].a[se.k], 0)}</text>`;
    });
    el.innerHTML = s + "</svg>";
  }

  // ---------- filters ----------
  function renderFilters() {
    document.getElementById("fPeriod").innerHTML = [["YTD", "YTD"], ...MONTHS.map((m) => [m.key, m.key])]
      .map(([v, l]) => `<button data-v="${v}" aria-pressed="${state.period === v}">${l}</button>`).join("");
    [["fSegment", "segment"], ["fBasis", "basis"], ["fMatrix", "matrix"]].forEach(([id, key]) => {
      document.querySelectorAll(`#${id} button`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state[key])));
    });
    const sel = document.getElementById("fClient");
    const clients = [...new Set(rows.filter((r) => state.segment === "All" || r.segment === state.segment).map((r) => r.client))];
    if (state.client !== "All" && !clients.includes(state.client)) state.client = "All";
    sel.innerHTML = `<option value="All">All clients</option>` + clients.map((c) => `<option ${c === state.client ? "selected" : ""}>${esc(c)}</option>`).join("");
  }

  // ---------- OVERVIEW ----------
  function kpi(label, value, foot, swatch) {
    return `<div class="card kpi"><div class="label">${swatch ? `<i class="swatch" style="background:${swatch}"></i>` : ""}${label}</div><div class="value num">${value}</div><div class="foot">${foot}</div></div>`;
  }
  function renderOverview(list) {
    const a = agg(list), p = periodShort();
    const clients = new Set(list.map((b) => b.client)).size;
    document.getElementById("kpis").innerHTML = !list.length ? `<div class="card empty">Nothing matches these filters for ${periodLabel()}.</div>` : [
      kpi(`Net revenue · ${p}`, rsShort(a.netRevenue), `Billing ${rsShort(a.grossRevenue)} less credit notes ${rsShort(-a.creditNotes)}`, "var(--revenue)"),
      kpi(`Teacher cost · ${p}`, rsShort(a.teacherCost), a.netRevenue ? `<strong>${pct(a.teacherCost / a.netRevenue)}</strong> of revenue` : "no revenue in selection", "var(--teacher)"),
      kpi(`Gross margin · ${p}`, rsShort(a.grossMargin), `<strong>${pct(a.gm)}</strong> of revenue · after teacher cost`),
      kpi(`Ops team cost · ${p}`, rsShort(a.opsCost), a.netRevenue ? `<strong>${pct(a.opsCost / a.netRevenue)}</strong> of revenue · shared by days & learners` : "", "var(--ops)"),
      kpi(`Contribution · ${p}`, rsShort(a.contribution), `<strong>${pct(a.cm)}</strong> of revenue · after teacher + ops`, "var(--contrib)"),
      kpi("Batches · Learners", `${a.batches} · ${a.learners}`, `${plural(clients, "client")}${a.learners ? ` · ${rsShort(a.netRevenue / a.learners)} revenue per learner` : ""}`),
    ].join("");

    document.getElementById("miniTrendLegend").innerHTML = stackLegend();
    monthStack(document.getElementById("miniTrend"), filteredAllMonths(), { height: 230 });

    document.getElementById("hundredSub").textContent = `Out of each ₹100 earned from clients in ${periodLabel()}, this is how much paid teachers, how much paid the operations team, and how much was left as contribution.`;
    const parts = [
      { k: "Teacher cost", v: a.teacherCost, c: "var(--teacher)", d: "paid to teachers for the hours they taught" },
      { k: "Ops team cost", v: a.opsCost, c: "var(--ops)", d: "share of the operations team's salaries" },
      { k: "Contribution", v: a.contribution, c: "var(--contrib)", d: "left over for sales, admin and profit" },
    ];
    const per100 = (v) => (a.netRevenue ? (v / a.netRevenue) * 100 : 0);
    const posTotal = parts.reduce((s, x) => s + Math.max(0, x.v), 0) || 1;
    document.getElementById("hundred").innerHTML = parts.filter((x) => x.v > 0).map((x) => {
      const w = (x.v / posTotal) * 100;
      return `<div style="flex:${w} 1 0;background:${x.c}" data-tip="${tipId(`<div class="tt-title">${x.k}</div>${ttRow("Amount", rs(x.v))}${ttRow("Per ₹100 of revenue", "₹" + per100(x.v).toFixed(1))}`)}">${w > 9 && a.netRevenue ? "₹" + per100(x.v).toFixed(0) : ""}</div>`;
    }).join("");
    document.getElementById("hundredKeys").innerHTML = !a.netRevenue ? `<div class="k"><span>There is no revenue in this selection, only costs.</span></div>` : parts.map((x) =>
      `<div class="k"><i class="swatch" style="background:${x.c}"></i><div><b class="num ${x.v < 0 ? "neg" : ""}">${x.v < 0 ? "−" : ""}₹${Math.abs(per100(x.v)).toFixed(1)}</b><span>${x.k}: ${x.d}</span></div></div>`).join("") +
      (a.contribution < 0 ? `<div class="k"><div><span>Costs are higher than revenue for this selection.</span></div></div>` : "");

    document.getElementById("waterfallSub").textContent = `How ${periodLabel()} billing becomes the contribution we keep, step by step.`;
    renderWaterfall(a);
    renderInsights(list, a);
  }

  function renderWaterfall(a) {
    const el = document.getElementById("waterfall");
    const steps = [
      { l: ["Client", "billing"], type: "total", v: a.grossRevenue, c: "var(--revenue)" },
      { l: ["Credit", "notes"], type: "delta", v: a.creditNotes, c: "var(--credit)" },
      { l: ["Net", "revenue"], type: "total", v: a.netRevenue, c: "var(--revenue)" },
      { l: ["Teacher", "cost"], type: "delta", v: -a.teacherCost, c: "var(--teacher)" },
      { l: ["Gross", "margin"], type: "total", v: a.grossMargin, c: "var(--contrib)" },
      { l: ["Ops team", "cost"], type: "delta", v: -a.opsCost, c: "var(--ops)" },
      { l: ["Contri-", "bution"], type: "total", v: a.contribution, c: "var(--contrib)" },
    ];
    let run = 0;
    steps.forEach((s) => { if (s.type === "total") { s.from = 0; s.to = s.v; } else { s.from = run; s.to = run + s.v; } run = s.to; });
    const W = widthOf(el), H = 280, top = 22, bottom = 40, left = 50;
    const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
    const hi = Math.max(...steps.map((s) => Math.max(s.from, s.to)), 1);
    const ticks = niceTicks(lo, hi, 4);
    const ymin = Math.min(lo, ticks[0]), ymax = Math.max(hi, ticks[ticks.length - 1]);
    const sy = (v) => top + (1 - (v - ymin) / (ymax - ymin)) * (H - top - bottom);
    const band = (W - left) / steps.length, bw = Math.min(40, band * 0.6), narrow = W < 460;
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Waterfall from client billing to contribution">`;
    ticks.forEach((t) => { s += `<line class="gridline" x1="${left}" x2="${W}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${left - 6}" y="${sy(t) + 4}" text-anchor="end">${rsShort(t).replace(".00 L", " L")}</text>`; });
    s += `<line class="axis" x1="${left}" x2="${W}" y1="${sy(0)}" y2="${sy(0)}"/>`;
    steps.forEach((st, i) => {
      const cx = left + band * i + band / 2, x = cx - bw / 2;
      const a0 = Math.min(st.from, st.to), a1 = Math.max(st.from, st.to);
      const path = st.type === "total" ? vBarPath(x, bw, sy(0), sy(st.to)) : `M${x},${sy(a1)}H${x + bw}V${sy(a0)}H${x}Z`;
      const tip = `<div class="tt-title">${st.l.join(" ").replace("- ", "")}</div>${ttRow("Amount", rs(st.v))}${a.netRevenue ? ttRow("% of net revenue", pct(st.v / a.netRevenue)) : ""}`;
      s += `<g class="row" data-tip="${tipId(tip)}"><rect class="hit" x="${cx - band / 2}" y="${top - 16}" width="${band}" height="${H - top}" rx="6"/>`;
      if (path) s += `<path d="${path}" style="fill:${st.c}"/>`;
      if (i < steps.length - 1) s += `<line x1="${x + bw}" x2="${x + band}" y1="${sy(st.to)}" y2="${sy(st.to)}" style="stroke:var(--text-muted);stroke-width:1"/>`;
      const ly = st.type === "total" ? sy(Math.max(0, st.to)) - 6 : sy(a1) - 6;
      const lbl = narrow ? rsShort(st.v).replace("₹", "").replace(" L", "L") : rsShort(st.v);
      if (Math.abs(st.v) > 0.5 || st.type === "total") s += `<text x="${cx}" y="${ly}" text-anchor="middle" class="t-strong num" style="font-size:${narrow ? 9 : 11}px">${lbl}</text>`;
      s += `<text x="${cx}" y="${H - bottom + 16}" text-anchor="middle">${st.l[0]}</text><text x="${cx}" y="${H - bottom + 29}" text-anchor="middle">${st.l[1]}</text></g>`;
    });
    el.innerHTML = s + "</svg>";
  }

  // Plain facts only: no ratings or recommendations.
  function renderInsights(list, a) {
    const el = document.getElementById("insights");
    if (!list.length) { el.innerHTML = `<li><div class="ic">ℹ︎</div><p>Nothing matches these filters for ${periodLabel()}.</p></li>`; return; }
    const out = [];
    const byClient = [...groupBy(list, "client")].map(([c, l]) => ({ c, a: agg(l) })).sort((x, y) => y.a.netRevenue - x.a.netRevenue);
    if (byClient.length > 1 && a.netRevenue > 0) {
      const top = byClient[0], seg = [...groupBy(list, "segment")].map(([s, l]) => `${s} ${pct(agg(l).netRevenue / a.netRevenue, 0)}`);
      out.push(["◔", `<b>${esc(top.c)} accounts for ${pct(top.a.netRevenue / a.netRevenue, 0)} of net revenue</b> (${rsShort(top.a.netRevenue)} of ${rsShort(a.netRevenue)}).${seg.length > 1 ? ` By segment: ${seg.join(", ")}.` : ""}`]);
    }
    if (a.netRevenue > 0) out.push(["₹", `<b>Of every ₹100 of net revenue, ₹${((a.teacherCost / a.netRevenue) * 100).toFixed(0)} went to teacher cost</b> and ₹${((a.opsCost / a.netRevenue) * 100).toFixed(0)} to the operations team's share. Gross margin is ${pct(a.gm)}; contribution margin is ${pct(a.cm)}.`]);
    if (isYTD()) {
      const mm = MONTHS.map((m) => ({ m, a: agg(list.filter((r) => r.month === m.key), false) })).filter((x) => x.a.netRevenue > 0);
      if (mm.length > 1) {
        const hi = [...mm].sort((x, y) => y.a.cm - x.a.cm)[0], lo = [...mm].sort((x, y) => x.a.cm - y.a.cm)[0];
        const revs = mm.map((x) => x.a.netRevenue);
        out.push(["▤", `<b>Contribution margin by month ranged from ${pct(lo.a.cm, 0)} (${lo.m.key}) to ${pct(hi.a.cm, 0)} (${hi.m.key}).</b> Monthly net revenue ranged from ${rsShort(Math.min(...revs))} to ${rsShort(Math.max(...revs))}.`]);
      }
    }
    const neg = byClient.filter((x) => x.a.contribution < 0).sort((x, y) => x.a.contribution - y.a.contribution);
    if (neg.length) out.push(["−", `<b>Negative contribution after ops cost:</b> ${neg.map((x) => `${esc(x.c)} (${rsShort(x.a.contribution)})`).join(", ")}.`]);
    const bs = batchAgg(list).filter((x) => x.netRevenue > 0);
    if (bs.length > 3) {
      const sorted = [...bs].sort((x, y) => y.cm - x.cm), f = (x) => `${esc(x.id)} (${pct(x.cm, 0)})`;
      out.push(["↕", `<b>Highest contribution margins:</b> ${sorted.slice(0, 3).map(f).join(", ")}. <b>Lowest:</b> ${sorted.slice(-3).reverse().map(f).join(", ")}.`]);
    }
    if (a.creditNotes < 0) {
      const cn = batchAgg(list.filter((r) => r.creditNotes < 0));
      out.push(["↩", `<b>Credit notes reduced billing by ${rs(-a.creditNotes)}</b> (${cn.map((x) => esc(x.id)).join(", ")}), ${pct(-a.creditNotes / a.grossRevenue)} of billing.`]);
    }
    el.innerHTML = out.map(([ic, t]) => `<li><div class="ic" aria-hidden="true">${ic}</div><p>${t}</p></li>`).join("");
  }


  // ---------- TREND ----------
  function renderTrend() {
    const all = filteredAllMonths();
    document.getElementById("trendLegend").innerHTML = stackLegend();
    monthStack(document.getElementById("trendStack"), all, { height: 300 });
    marginLines(document.getElementById("trendMargin"), all);

    // client × month matrix
    const k = state.matrix, isPct = k === "gm" || k === "cm";
    const clients = [...groupBy(all, "client")].map(([c, l]) => ({ c, seg: l[0].segment, l, ytd: agg(l, true) })).sort((x, y) => y.ytd.netRevenue - x.ytd.netRevenue);
    const cell = (a, has) => {
      if (!has) return `<span class="dim">–</span>`;
      if (isPct) return a.netRevenue ? pct(a[k]) : `<span class="dim">no revenue</span>`;
      return `<span class="${a[k] < 0 ? "neg" : ""}">${rs(a[k])}</span>`;
    };
    const t = document.getElementById("matrix");
    const hl = (key) => (!isYTD() && state.period === key ? ` style="background:var(--surface-2)"` : "");
    const total = agg(all, true);
    t.innerHTML = !clients.length ? `<tr><td class="empty">Nothing matches these filters.</td></tr>` :
      `<thead><tr><th class="l nosort">Client</th><th class="l nosort">Segment</th>${MONTHS.map((m) => `<th class="nosort"${hl(m.key)}>${m.label}</th>`).join("")}<th class="nosort">YTD</th></tr></thead>
      <tbody>${clients.map((c) => {
        const bym = groupBy(c.l, "month");
        return `<tr data-client="${esc(c.c)}"><td class="l"><b>${esc(c.c)}</b></td><td class="l"><span class="tag"><i class="swatch" style="background:${segColor(c.seg)}"></i>${c.seg}</span></td>${MONTHS.map((m) => `<td class="num cell"${hl(m.key)}>${cell(agg(bym.get(m.key) || [], false), bym.has(m.key))}</td>`).join("")}<td class="num cell"><b>${cell(c.ytd, true)}</b></td></tr>`;
      }).join("")}</tbody>
      <tfoot><tr><td class="l">Total</td><td></td>${MONTHS.map((m) => { const l = all.filter((r) => r.month === m.key); return `<td class="num"${hl(m.key)}>${cell(agg(l, false), l.length > 0)}</td>`; }).join("")}<td class="num">${cell(total, true)}</td></tr></tfoot>`;

    // monthly P&L summary
    const mt = document.getElementById("monthTable");
    const cols = MONTHS.map((m) => ({ key: m.key, label: m.label, a: agg(all.filter((r) => r.month === m.key), false) })).concat([{ key: "YTD", label: "YTD", a: total }]);
    const lines = [
      ["Batches running", (a) => a.batches], ["Learners", (a) => a.learners], ["Client billing", (a) => rs(a.grossRevenue)], ["Credit notes", (a) => (a.creditNotes ? `<span class="neg">${rs(a.creditNotes)}</span>` : "–")],
      ["Net revenue", (a) => `<b>${rs(a.netRevenue)}</b>`], ["Teacher cost", (a) => rs(a.teacherCost)], ["Gross margin", (a) => rs(a.grossMargin)], ["Gross margin %", (a) => (a.netRevenue ? pct(a.gm) : "–")],
      ["Ops team cost", (a) => rs(a.opsCost)], ["Contribution", (a) => `<b class="${a.contribution < 0 ? "neg" : ""}">${rs(a.contribution)}</b>`], ["Contribution %", (a) => (a.netRevenue ? pct(a.cm) : "–")],
    ];
    mt.innerHTML = `<thead><tr><th class="l nosort">Measure</th>${cols.map((c) => `<th class="nosort"${hl(c.key)}>${c.label}</th>`).join("")}</tr></thead><tbody>${lines.map(([n, f]) => `<tr style="cursor:default"><td class="l">${n}</td>${cols.map((c) => `<td class="num"${hl(c.key)}>${c.key !== "YTD" && !c.a.rows ? '<span class="dim">–</span>' : f(c.a)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  }

  // ---------- CLIENTS ----------
  function renderClients(list) {
    const total = agg(list);
    const crows = [...groupBy(list, "client")].map(([c, l]) => Object.assign({ client: c, segment: l[0].segment, share: total.netRevenue ? agg(l).netRevenue / total.netRevenue : 0 }, agg(l)))
      .sort((x, y) => y.netRevenue - x.netRevenue);
    const gross = state.basis === "gross";
    document.getElementById("clientRevSub").textContent = `How much of ${periodLabel()} net revenue each client brought in, and what was left after costs.`;
    const el = document.getElementById("clientRevChart");
    el.previousElementSibling.innerHTML = stackLegend();
    if (!crows.length) empty(el);
    else {
      const W = widthOf(el), labelW = Math.min(150, W * 0.34), valW = 92, rowH = 44, barH = 20, top = 20;
      const max = Math.max(...crows.map((r) => Math.max(r.netRevenue, r.teacherCost + (gross ? 0 : r.opsCost))));
      const ticks = niceTicks(0, max, W < 500 ? 2 : 4), hi = Math.max(max, ticks[ticks.length - 1]);
      const x0 = labelW + 10, x1 = W - valW, sx = (v) => x0 + (v / hi) * (x1 - x0);
      const H = top + crows.length * rowH;
      let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Net revenue by client split into costs and contribution">`;
      ticks.forEach((t) => { s += `<line class="gridline" x1="${sx(t)}" x2="${sx(t)}" y1="${top - 6}" y2="${H}"/><text x="${sx(t)}" y="${top - 10}" text-anchor="middle">${rsShort(t)}</text>`; });
      crows.forEach((r, i) => {
        const y = top + i * rowH, by = y + (rowH - barH) / 2;
        const left = gross ? r.grossMargin : r.contribution;
        const segs = [["Teacher cost", r.teacherCost, "var(--teacher)"]];
        if (!gross) segs.push(["Ops team cost", r.opsCost, "var(--ops)"]);
        if (left > 0) segs.push([gross ? "Gross margin" : "Contribution", left, "var(--contrib)"]);
        s += `<g class="row" data-tip="${tipId(aggTip(esc(r.client), r, ttRow("Share of revenue", pct(r.share))))}" data-client="${esc(r.client)}"><rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}" rx="6"/>`;
        let cur = 0;
        segs.forEach((sg, j) => {
          const a0 = sx(cur) + (j ? 1 : 0), a1 = sx(cur + sg[1]) - (j < segs.length - 1 ? 1 : 0);
          s += j === segs.length - 1 ? `<path d="${hBarPath(a0, Math.max(a0 + 1, a1), by, barH)}" style="fill:${sg[2]}"/>` : `<rect x="${a0}" y="${by}" width="${Math.max(1, a1 - a0)}" height="${barH}" style="fill:${sg[2]}"/>`;
          cur += sg[1];
        });
        if (left < 0 && r.netRevenue > 0) s += `<line x1="${sx(r.netRevenue)}" x2="${sx(r.netRevenue)}" y1="${by - 4}" y2="${by + barH + 4}" style="stroke:var(--text-primary);stroke-width:2"/>`;
        s += `<text x="${labelW}" y="${y + rowH / 2 - 2}" text-anchor="end" class="t-strong">${esc(fit(r.client, labelW, 6.6))}</text>`;
        s += `<text x="${labelW}" y="${y + rowH / 2 + 11}" text-anchor="end" style="font-size:10px">${r.segment} · ${plural(r.batches, "batch", "batches")}</text>`;
        const endX = sx(Math.max(r.netRevenue, cur)) + 6;
        s += `<text x="${endX}" y="${y + rowH / 2 - 2}" class="t-strong num">${rsShort(r.netRevenue)}</text>`;
        s += `<text x="${endX}" y="${y + rowH / 2 + 11}" class="num" style="font-size:10px">${pct(r.share, 0)} of rev.</text></g>`;
      });
      el.innerHTML = s + "</svg>";
    }

    const order = ["Group", "Non-group"];
    const segs = [...groupBy(list, "segment")].map(([sg, l]) => Object.assign({ seg: sg }, agg(l))).sort((x, y) => order.indexOf(x.seg) - order.indexOf(y.seg));
    document.getElementById("segCompare").innerHTML = !segs.length || !total.netRevenue ? `<div class="empty">No revenue in this selection.</div>` : `
      <div class="split" style="height:26px">${segs.filter((sg) => sg.netRevenue > 0).map((sg) => `<div style="flex:${sg.netRevenue} 1 0;background:${segColor(sg.seg)}" data-tip="${tipId(`<div class="tt-title">${sg.seg}</div>${ttRow("Net revenue", rs(sg.netRevenue))}${ttRow("Share", pct(sg.netRevenue / total.netRevenue))}`)}"></div>`).join("")}</div>
      <div class="legend">${segs.map((sg) => `<span><i class="swatch" style="background:${segColor(sg.seg)}"></i>${sg.seg}: ${pct(sg.netRevenue / total.netRevenue, 0)} of revenue</span>`).join("")}</div>
      <div class="table-wrap"><table><thead><tr><th class="nosort l">Measure</th>${segs.map((sg) => `<th class="nosort">${sg.seg}</th>`).join("")}</tr></thead><tbody style="cursor:default">
        ${[["Batches", (x) => x.batches], ["Learners", (x) => x.learners], ["Net revenue", (x) => rs(x.netRevenue)], ["Revenue per learner", (x) => (x.learners ? rs(x.netRevenue / x.learners) : "–")],
           ["Teacher cost", (x) => rs(x.teacherCost)], ["Ops team cost", (x) => rs(x.opsCost)], ["Gross margin %", (x) => pct(x.gm)], ["Contribution", (x) => `<span class="${x.contribution < 0 ? "neg" : ""}">${rs(x.contribution)}</span>`], ["Contribution %", (x) => pct(x.cm)]]
          .map(([k, f]) => `<tr><td class="l">${k}</td>${segs.map((sg) => `<td class="num">${f(sg)}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>`;

    document.getElementById("clientCards").innerHTML = crows.map((r) => {
      const bar = [[r.teacherCost, "var(--teacher)", "Teacher"], [gross ? 0 : r.opsCost, "var(--ops)", "Ops"], [Math.max(0, profitOf(r)), "var(--contrib)", "Left over"]].filter((x) => x[0] > 0);
      return `<div class="card client-card" data-client="${esc(r.client)}" tabindex="0">
        <div class="ch"><h3>${esc(r.client)}</h3><span class="tag"><i class="swatch" style="background:${segColor(r.segment)}"></i>${r.segment}</span></div>
        <div class="big num">${rs(r.netRevenue)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${pct(r.share)} of ${periodShort()} revenue · ${basisLabel().split(" (")[0]} <b class="num" style="color:var(--text-primary)">${pct(mOf(r))}</b></div>
        <div class="split">${bar.map((x) => `<div style="flex:${x[0]} 1 0;background:${x[1]}" title="${x[2]}"></div>`).join("")}</div>
        <div class="mini-stats">
          <div>Batches<b class="num">${r.batches}</b></div>
          <div>Learners<b class="num">${r.learners}</b></div>
          <div>Rev / learner<b class="num">${r.learners ? rsShort(r.netRevenue / r.learners) : "–"}</b></div>
          <div>Teacher cost<b class="num">${rsShort(r.teacherCost)}</b></div>
          <div>Gross margin<b class="num">${pct(r.gm)}</b></div>
          <div>Contribution<b class="num ${r.contribution < 0 ? "neg" : ""}">${rsShort(r.contribution)}</b></div>
        </div></div>`;
    }).join("");

    const cols = [
      ["client", "Client", (r) => esc(r.client), "l"], ["segment", "Segment", (r) => r.segment, "l"], ["batches", "Batches", (r) => r.batches], ["learners", "Learners", (r) => r.learners],
      ["netRevenue", "Net revenue", (r) => rs(r.netRevenue)], ["teacherCost", "Teacher cost", (r) => rs(r.teacherCost)], ["grossMargin", "Gross margin", (r) => rs(r.grossMargin)],
      ["gm", "GM %", (r) => pct(r.gm)], ["share", "% of revenue", (r) => pct(r.share)], ["opsCost", "Ops cost", (r) => rs(r.opsCost)],
      ["contribution", "Contribution", (r) => `<span class="${r.contribution < 0 ? "neg" : ""}">${rs(r.contribution)}</span>`], ["cm", "Contrib. %", (r) => `<span class="${r.cm < 0 ? "neg" : ""}">${pct(r.cm)}</span>`],
    ];
    renderTable("clientTable", cols, crows, sorts.client, Object.assign({ share: crows.length ? 1 : 0, __skip: ["segment"] }, total), (r) => `data-client="${esc(r.client)}"`);
  }

  // ---------- tables ----------
  function renderTable(id, cols, trows, sort, totals, rowAttr) {
    const t = document.getElementById(id);
    const sorted = [...trows].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * sort.dir;
    });
    t.innerHTML = `<thead><tr>${cols.map(([k, h, , cls]) => `<th data-key="${k}" class="${cls || ""}" aria-sort="${sort.key === k ? (sort.dir > 0 ? "ascending" : "descending") : "none"}">${h}${sort.key === k ? `<span class="arr">${sort.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("")}</tr></thead>
      <tbody>${sorted.map((r) => `<tr ${rowAttr(r)}>${cols.map(([, , f, cls]) => `<td class="${cls || ""} num">${f(r)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="empty">No rows match these filters.</td></tr>`}</tbody>
      ${totals && trows.length > 1 ? `<tfoot><tr>${cols.map(([k, , f, cls], i) => `<td class="${cls || ""} num">${i === 0 ? "Total" : (totals.__skip || []).includes(k) ? "" : f(totals)}</td>`).join("")}</tr></tfoot>` : ""}`;
    t.querySelectorAll("th[data-key]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (sort.key === k) sort.dir *= -1; else { sort.key = k; sort.dir = typeof trows[0]?.[k] === "string" ? 1 : -1; }
      render();
    }));
  }

  // ---------- BATCHES ----------
  function renderBatches(list) {
    const bs = batchAgg(list).map((b) => Object.assign(b, { m: mOf(b) }));
    const withRev = bs.filter((b) => b.netRevenue > 0), noRev = bs.filter((b) => b.netRevenue <= 0);
    document.getElementById("batchChartSub").textContent = `${basisLabel()} for each batch in ${periodLabel()}, highest first. Hover for details. Click a bar to open the batch.` +
      (noRev.length ? ` ${plural(noRev.length, "entry", "entries")} with cost but no revenue (${noRev.map((b) => b.id).join(", ")}) are listed in the table only.` : "");
    const el = document.getElementById("batchMarginChart");
    if (!withRev.length) empty(el);
    else hbarChart(el, [...withRev].sort((a, b) => b.m - a.m).map((b) => ({
      label: b.id, sub: `${b.client} · ${plural(b.learners, "learner")}${isYTD() ? " · " + b.months : ""}`,
      value: b.m, color: state.basis === "gross" ? "var(--revenue)" : "var(--contrib)", valueLabel: pct(b.m),
      tip: aggTip(`${esc(b.id)} · ${esc(b.client)}`, b, `<div class="tt-row" style="margin-top:4px"><span>${esc(b.teacher)} · ${b.months}</span></div>`), click: b.id,
    })), { tick: (t) => Math.round(t * 100) + "%", labelW: 180, aria: "Margin by batch" });

    document.getElementById("batchTableSub").textContent = `Every batch that ran in ${periodLabel()}${isYTD() ? ", with each month's figures added together" : ""}. Click a column to sort. Click a row to see its month-by-month figures, how they were worked out, and to try a "what if".`;
    const cols = [
      ["id", "Batch", (b) => `<b>${esc(b.id)}</b>`, "l"], ["client", "Client", (b) => esc(b.client), "l"],
      ["teacher", "Teacher", (b) => `${esc(fit(b.teacher, 200, 6))} ${b.teacherType === "Full Time" ? '<span class="tag">FT</span>' : b.teacherType === "Consultant" ? '<span class="tag">Cons.</span>' : ""}`, "l"],
    ];
    if (isYTD()) cols.push(["monthCount", "Months", (b) => b.months, "l"]);
    cols.push(
      ["learners", "Learners", (b) => b.learners], ["grossRevenue", "Billing", (b) => rs(b.grossRevenue)], ["creditNotes", "Credit notes", (b) => (b.creditNotes ? `<span class="neg">${rs(b.creditNotes)}</span>` : "–")],
      ["netRevenue", "Net revenue", (b) => rs(b.netRevenue)], ["teacherCost", "Teacher cost", (b) => rs(b.teacherCost)], ["gm", "GM %", (b) => (b.netRevenue ? pct(b.gm) : "–")],
      ["opsCost", "Ops cost", (b) => rs(b.opsCost)], ["contribution", "Contribution", (b) => `<span class="${b.contribution < 0 ? "neg" : ""}">${rs(b.contribution)}</span>`],
      ["cm", "Contrib. %", (b) => (b.netRevenue ? `<span class="${b.cm < 0 ? "neg" : ""}">${pct(b.cm)}</span>` : "–")],
    );
    const tot = agg(list); tot.m = mOf(tot); tot.__skip = ["client", "teacher", "monthCount"];
    renderTable("batchTable", cols, bs, sorts.batch, tot, (b) => `data-batch="${esc(b.id)}"`);
  }

  // ---------- drawer ----------
  const drawer = document.getElementById("drawer"), drawerBg = document.getElementById("drawer-bg");
  function closeDrawer() { drawer.classList.remove("open"); drawerBg.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
  drawer.querySelector(".close").addEventListener("click", closeDrawer);
  drawerBg.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  // Ops cost rates for a month: pool × 40% per active batch-day, pool × 60% per learner-day.
  const opsRates = (mk) => { const m = MONTH[mk]; return { perDay: (m.opsPool * m.fixedShare) / m.totalActiveDays, perLearnerDay: (m.opsPool * m.variableShare) / m.totalLearnerDays }; };

  function batchCalcHTML(r) {
    const m = MONTH[r.month], share = r.courseDays ? r.monthDays / r.courseDays : 0;
    const rev = r.feePerLearner !== undefined ? `
        <span class="k">Learners × fee per learner</span><span class="v">${r.learners} × ${rs(r.feePerLearner)}</span>
        <span class="k">Total course fee</span><span class="v">${rs(r.contractValue)}</span>
        <span class="k">Course runs</span><span class="v">${fmtDate(r.start)} – ${fmtDate(r.end)}</span>
        <span class="k">Days in ${r.month} ÷ course days</span><span class="v">${r.monthDays} ÷ ${r.courseDays} = ${pct(share)}</span>` : `<span class="k">No fee schedule for this entry</span><span class="v">–</span>`;
    const lines = (r.teacherLines || []).map((l) => {
      const rate = l.hourlyRate || (l.monthHours ? l.cost / l.monthHours : 0);
      return `<span class="k">${esc(l.teacher || r.teacher)}: ${l.monthHours.toFixed(1)} of ${l.courseHours} hrs × ${rs(rate)}/hr${l.hourlyRate ? "" : " (salary basis)"}</span><span class="v">${rs(l.cost)}</span>`;
    }).join("");
    let opsLines;
    {
      const rt = opsRates(r.month);
      opsLines = `<span class="k">40% share: ${r.activeDays} active days × ${rs(rt.perDay)}/day</span><span class="v">${rs(rt.perDay * r.activeDays)}</span>
        <span class="k">60% share: ${inr.format(r.learnerDays)} learner-days × ${rs(rt.perLearnerDay)}</span><span class="v">${rs(rt.perLearnerDay * r.learnerDays)}</span>`;
    }
    return `
      <h4>1 · Revenue earned in ${m.long}</h4>
      <div class="calc">${rev}
        <span class="k">Billing earned in ${r.month}</span><span class="v">${rs(r.grossRevenue)}</span>
        <span class="k">Credit notes</span><span class="v ${r.creditNotes ? "neg" : ""}">${r.creditNotes ? rs(r.creditNotes) : "–"}</span>
        <span class="k tot">Net revenue</span><span class="v tot">${rs(r.netRevenue)}</span>
      </div>
      <h4>2 · Teacher cost</h4>
      <div class="calc">${lines || `<span class="k">No teacher cost lines</span><span class="v">–</span>`}
        <span class="k tot">Teacher cost</span><span class="v tot">${rs(r.teacherCost)}</span>
        <span class="k">Gross margin</span><span class="v">${rs(r.grossMargin)}${r.netRevenue ? " · " + pct(r.gm) : ""}</span>
      </div>
      <h4>3 · Ops team cost & contribution</h4>
      <div class="calc">${opsLines}
        <span class="k tot">Ops team cost</span><span class="v tot">${rs(r.opsCost)}</span>
        <span class="k tot">Contribution</span><span class="v tot ${r.contribution < 0 ? "neg" : ""}">${rs(r.contribution)}${r.netRevenue ? " · " + pct(r.cm) : ""}</span>
      </div>`;
  }

  function openBatch(id) {
    const brs = rows.filter((r) => r.id === id && inPeriod(r)).sort((a, b) => monthOrder(a.month) - monthOrder(b.month));
    if (!brs.length) return;
    const b = batchAgg(brs)[0], r = b.last;
    const monthRows = brs.length > 1 ? `
      <h4>Month by month</h4>
      <div class="table-wrap"><table class="month-table"><thead><tr><th class="l nosort">Month</th><th class="nosort">Learners</th><th class="nosort">Net revenue</th><th class="nosort">Teacher</th><th class="nosort">Ops</th><th class="nosort">Contribution</th><th class="nosort">CM %</th></tr></thead>
      <tbody>${brs.map((x) => `<tr><td class="l">${x.month}</td><td class="num">${x.learners}</td><td class="num">${rs(x.netRevenue)}</td><td class="num">${rs(x.teacherCost)}</td><td class="num">${rs(x.opsCost)}</td><td class="num ${x.contribution < 0 ? "neg" : ""}">${rs(x.contribution)}</td><td class="num">${x.netRevenue ? pct(x.cm, 0) : "–"}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td class="l">${periodShort()}</td><td></td><td class="num">${rs(b.netRevenue)}</td><td class="num">${rs(b.teacherCost)}</td><td class="num">${rs(b.opsCost)}</td><td class="num ${b.contribution < 0 ? "neg" : ""}">${rs(b.contribution)}</td><td class="num">${b.netRevenue ? pct(b.cm, 0) : "–"}</td></tr></tfoot></table></div>` : "";
    const canSim = r.learners > 0 && r.grossRevenue > 0 && r.activeDays > 0;
    document.getElementById("drawerBody").innerHTML = `
      <h2>${esc(b.id)}</h2>
      <div style="color:var(--text-secondary);font-size:13px">${esc(b.client)} · ${b.segment} · ${esc(b.teacher)}${b.teacherType !== "-" ? ` (${b.teacherType === "Full Time" ? "full-time" : b.teacherType.toLowerCase()})` : ""} · ${periodShort()}: ${b.months}</div>
      ${b.netRevenue ? `<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:13px">
        <div>Gross margin <b class="num">${pct(b.gm)}</b></div>
        <div>Contribution margin <b class="num">${pct(b.cm)}</b></div></div>` : `<p class="explain">This entry has teaching cost but no revenue in ${periodLabel()}.</p>`}
      ${monthRows}
      ${brs.length > 1 ? `<h4 style="margin-top:26px;color:var(--text-primary)">How ${MONTH[r.month].long} was worked out</h4>` : ""}
      ${batchCalcHTML(r)}
      ${canSim ? `
      <h4>What if… (based on ${MONTH[r.month].long})</h4>
      <div class="sim">
        <div class="row"><span>Learners in batch</span><b class="num" id="simLv">${r.learners}</b></div>
        <input type="range" id="simL" min="1" max="${Math.max(25, r.learners * 2)}" value="${r.learners}" aria-label="Learners in batch">
        <div class="row" style="margin-top:8px"><span>Fee per learner</span><b class="num" id="simFv"></b></div>
        <input type="range" id="simF" min="-50" max="50" value="0" step="5" aria-label="Change in fee per learner">
        <div class="res">
          <div>Net revenue<b class="num" id="simR"></b></div>
          <div>Contribution<b class="num" id="simC"></b></div>
          <div>Contrib. %<b class="num" id="simM"></b></div>
        </div>
        <p class="explain" id="simBE"></p>
        <p class="explain">Assumes the teacher's hours stay the same, since a teacher takes the class whatever its size. The ops cost has a fixed part per active day, plus a part per learner-day that grows with each learner.</p>
      </div>` : ""}`;
    if (canSim) {
      const rpl = r.grossRevenue / r.learners, rt = opsRates(r.month);
      const fixedOps = rt.perDay * r.activeDays, perLearner = rt.perLearnerDay * r.activeDays;
      const L = document.getElementById("simL"), F = document.getElementById("simF");
      const upd = () => {
        const l = +L.value, f = 1 + F.value / 100;
        const net = rpl * l * f + r.creditNotes, ops = fixedOps + perLearner * l, c = net - r.teacherCost - ops;
        document.getElementById("simLv").textContent = l;
        document.getElementById("simFv").textContent = `${rs((r.feePerLearner || rpl) * f)}${+F.value ? ` (${F.value > 0 ? "+" : ""}${F.value}%)` : ""}`;
        document.getElementById("simR").textContent = rsShort(net);
        const cEl = document.getElementById("simC"); cEl.textContent = rsShort(c); cEl.className = "num" + (c < 0 ? " neg" : "");
        document.getElementById("simM").textContent = net ? pct(c / net) : "–";
        const unit = rpl * f - perLearner;
        const be = unit > 0 ? Math.max(1, Math.ceil((r.teacherCost + fixedOps - r.creditNotes) / unit)) : null;
        const u50 = rpl * f * 0.5 - perLearner;
        const t50 = u50 > 0 ? Math.max(1, Math.ceil((r.teacherCost + fixedOps - 0.5 * r.creditNotes) / u50)) : null;
        document.getElementById("simBE").innerHTML = be ? `At this fee the batch covers its costs with <b>${be}</b> learner${be > 1 ? "s" : ""}${t50 ? `, and reaches 50% contribution with <b>${t50}</b>` : ""}.` : "At this fee each extra learner adds less revenue than ops cost, so the batch can't break even by adding learners.";
      };
      L.addEventListener("input", upd); F.addEventListener("input", upd); upd();
    }
    drawer.classList.add("open"); drawerBg.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    drawer.scrollTop = 0;
  }

  // ---------- METHOD ----------
  function renderMethod() {
    const pr = filtered();
    const ex = pr.filter((r) => r.id === "A1.61").sort((a, b) => monthOrder(b.month) - monthOrder(a.month))[0] || pr[0] || rows.find((r) => r.id === "A1.61");
    document.getElementById("exampleSub").textContent = `Batch ${ex.id} for ${ex.client} in ${MONTH[ex.month].long}, worked through step by step.`;
    document.getElementById("example").innerHTML = batchCalcHTML(ex);

    const opsLines = [
      ["Operations salaries (B2B)", (m) => rs(m.opsPayroll)],
      ["Less: full-time teacher cost already in COGS", (m) => `<span class="neg">${rs(-m.ftTeacherCostInCogs)}</span>`],
      ["Pool to share across batches", (m) => `<b>${rs(m.opsPool)}</b>`],
      ["Active batch-days", (m) => inr.format(m.totalActiveDays)],
      ["Learner-days", (m) => inr.format(m.totalLearnerDays)],
      ["Cost per batch-day (40%)", (m) => rs(opsRates(m.key).perDay)],
      ["Cost per learner-day (60%)", (m) => rs(opsRates(m.key).perLearnerDay)],
    ];
    document.getElementById("opsPoolTable").innerHTML = `<thead><tr><th class="l nosort">Item</th>${MONTHS.map((m) => `<th class="nosort">${m.label}</th>`).join("")}</tr></thead><tbody>${opsLines.map(([n, f]) => `<tr style="cursor:default"><td class="l">${n}</td>${MONTHS.map((m) => `<td class="num">${f(m)}</td>`).join("")}</tr>`).join("")}</tbody>`;

    const misFmt = (label, v) => (typeof v !== "number" ? "" : /%/.test(label) ? (Math.abs(v) < 0.0005 ? "0.0%" : pct(v)) : Math.abs(v) < 0.5 ? "₹0" : rs(v));
    document.getElementById("misTable").innerHTML = `<thead><tr><th class="l nosort">Particulars</th>${MONTHS.map((m) => `<th class="nosort">${m.label}</th>`).join("")}<th class="nosort">YTD</th></tr></thead><tbody>${D.mis.map((x) =>
      x.values ? `<tr><td class="l">${esc(x.label)}</td>${x.values.map((v) => `<td class="num ${/^Variance/.test(x.label) ? "var" : ""}">${misFmt(x.label, v)}</td>`).join("")}</tr>`
        : `<tr class="sec"><td colspan="${MONTHS.length + 2}">${esc(x.label.replace(/^\d\.\s*/, ""))}</td></tr>`).join("")}</tbody>`;
  }

  // ---------- main render ----------
  function render() {
    tips = [];
    renderFilters();
    const list = filtered();
    ({ overview: renderOverview, trend: renderTrend, clients: renderClients, batches: renderBatches, method: renderMethod })[state.tab](list);
  }
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    document.querySelectorAll("section.panel").forEach((p) => { p.hidden = p.id !== "p-" + tab; });
    try { history.replaceState(null, "", "#" + tab); } catch (e) { /* file:// */ }
    render();
  }

  // ---------- events ----------
  document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  document.getElementById("fPeriod").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.period = b.dataset.v; render(); } });
  [["fSegment", "segment"], ["fBasis", "basis"], ["fMatrix", "matrix"]].forEach(([id, key]) => {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => { state[key] = b.dataset.v; render(); }));
  });
  document.getElementById("fClient").addEventListener("change", (e) => { state.client = e.target.value; render(); });
  document.getElementById("resetBtn").addEventListener("click", () => { Object.assign(state, { period: "YTD", segment: "All", client: "All" }); render(); });

  document.addEventListener("click", (e) => {
    const mEl = e.target.closest("[data-month]");
    if (mEl) { state.period = state.period === mEl.dataset.month ? "YTD" : mEl.dataset.month; render(); return; }
    const bEl = e.target.closest("[data-batch],[data-click]");
    if (bEl) { openBatch(bEl.dataset.batch || bEl.dataset.click); return; }
    const cEl = e.target.closest("[data-client]");
    if (cEl) { state.client = cEl.dataset.client; state.segment = "All"; setTab("batches"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".client-card")) e.target.click(); });

  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 120); });

  const root = document.documentElement;
  try { const t = localStorage.getItem("tmc-theme"); if (t) root.dataset.theme = t; } catch (e) { /* storage unavailable */ }
  document.getElementById("themeBtn").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("tmc-theme", root.dataset.theme); } catch (e) { /* ignore */ }
  });

  const initial = (location.hash || "").slice(1);
  setTab(["overview", "trend", "clients", "batches", "method"].includes(initial) ? initial : "overview");
})();
