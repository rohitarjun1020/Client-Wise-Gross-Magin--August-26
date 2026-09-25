/* TMC client-wise gross margin dashboard. Plain JS + inline SVG, no build step. */
(function () {
  "use strict";

  const D = window.TMC_DATA;
  const CAPACITY_HRS = 8 * 31; // model: 8 teaching hours per day for a full-time teacher
  const OPS_RATE = D.opsPool / D.batches.reduce((s, b) => s + b.netRevenue, 0);

  // ---------- derived batch fields ----------
  const batches = D.batches.map((b) => {
    const grossMargin = b.netRevenue - b.teacherCost;
    const contribution = grossMargin - b.opsCost;
    return Object.assign({}, b, {
      grossMargin,
      contribution,
      gm: b.netRevenue ? grossMargin / b.netRevenue : 0,
      cm: b.netRevenue ? contribution / b.netRevenue : 0,
    });
  });

  // ---------- state ----------
  const state = { tab: "overview", segment: "All", client: "All", teacherType: "All", teacher: "All", basis: "net" };
  const sorts = { client: { key: "netRevenue", dir: -1 }, batch: { key: "m", dir: -1 }, teacher: { key: "netRevenue", dir: -1 } };

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
  const fmtDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const STATUS = {
    good: { label: "Strong", icon: "✓", color: "var(--good)" },
    moderate: { label: "Moderate", icon: "!", color: "var(--warning)" },
    thin: { label: "Thin", icon: "▾", color: "var(--serious)" },
    loss: { label: "Loss", icon: "✕", color: "var(--critical)" },
  };
  const statusOf = (m) => (m >= 0.5 ? "good" : m >= 0.3 ? "moderate" : m >= 0 ? "thin" : "loss");
  const chip = (m) => { const k = statusOf(m); return `<span class="chip ${k}"><i>${STATUS[k].icon}</i>${STATUS[k].label}</span>`; };

  const basisLabel = () => (state.basis === "gross" ? "Gross margin (after teacher cost)" : "Contribution margin (after teacher + ops cost)");
  const mOf = (x) => (state.basis === "gross" ? x.gm : x.cm);
  const profitOf = (x) => (state.basis === "gross" ? x.grossMargin : x.contribution);

  // ---------- aggregation ----------
  function agg(list) {
    const a = { batches: list.length, learners: 0, grossRevenue: 0, creditNotes: 0, netRevenue: 0, teacherCost: 0, opsCost: 0, augHours: 0 };
    list.forEach((b) => { for (const k of ["learners", "grossRevenue", "creditNotes", "netRevenue", "teacherCost", "opsCost", "augHours"]) a[k] += b[k]; });
    a.grossMargin = a.netRevenue - a.teacherCost;
    a.contribution = a.grossMargin - a.opsCost;
    a.gm = a.netRevenue ? a.grossMargin / a.netRevenue : 0;
    a.cm = a.netRevenue ? a.contribution / a.netRevenue : 0;
    return a;
  }
  function groupBy(list, key) {
    const m = new Map();
    list.forEach((b) => { const k = typeof key === "function" ? key(b) : b[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(b); });
    return m;
  }
  function filtered() {
    return batches.filter((b) =>
      (state.segment === "All" || b.segment === state.segment) &&
      (state.client === "All" || b.client === state.client) &&
      (state.teacherType === "All" || b.teacherType === state.teacherType) &&
      (state.teacher === "All" || b.teacher === state.teacher));
  }

  // ---------- tooltip ----------
  const tipEl = document.getElementById("tooltip");
  let tips = [];
  function tipId(html) { tips.push(html); return tips.length - 1; }
  function ttRow(label, value, color) {
    return `<div class="tt-row"><span class="l">${color ? `<i class="swatch" style="background:${color}"></i>` : ""}${label}</span><b class="num">${value}</b></div>`;
  }
  function batchTip(b) {
    return `<div class="tt-title">${esc(b.id)} · ${esc(b.client)}</div>` +
      ttRow("Net revenue", rs(b.netRevenue), "var(--revenue)") +
      ttRow("Teacher cost", rs(b.teacherCost), "var(--teacher)") +
      ttRow("Ops team cost", rs(b.opsCost), "var(--ops)") + "<hr>" +
      ttRow("Gross margin", pct(b.gm)) + ttRow("Contribution margin", pct(b.cm)) +
      `<div class="tt-row" style="margin-top:4px"><span>${esc(b.teacher)} · ${b.teacherType}</span></div>`;
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
    const right = x1 > x0, rr = Math.min(r, Math.abs(x1 - x0), h / 2);
    if (right) return `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`;
    return `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
  }
  function vBarPath(x, w, yBase, yTop, r = 4) {
    const up = yTop < yBase, rr = Math.min(r, Math.abs(yBase - yTop), w / 2);
    if (Math.abs(yBase - yTop) < 0.5) return "";
    if (up) return `M${x},${yBase}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yBase}Z`;
    return `M${x},${yBase}V${yTop - rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop - rr}V${yBase}Z`;
  }
  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const out = [];
    for (let v = Math.floor(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  // Truncate a label to fit roughly within px (approximate glyph width).
  const fit = (s, px, cw) => { const n = Math.floor(px / cw); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s; };
  const widthOf = (el) => Math.max(280, el.clientWidth);

  // Generic horizontal bar chart (single measure, may be negative).
  function hbarChart(el, rows, o) {
    const W = widthOf(el), labelW = Math.min(o.labelW || 150, W * 0.36), valW = o.valW || 70, rowH = 34, barH = 18, top = 22;
    const vals = rows.map((r) => r.value);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    if (o.max !== undefined) hi = Math.max(hi, o.max);
    const ticks = niceTicks(lo, hi, W < 500 ? 3 : 5);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const x0 = labelW + 8, x1 = W - valW;
    const sx = (v) => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0);
    const H = top + rows.length * rowH + 6;
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.aria || "")}">`;
    ticks.forEach((t) => {
      s += `<line class="gridline" x1="${sx(t)}" x2="${sx(t)}" y1="${top - 6}" y2="${H - 4}"/>`;
      s += `<text x="${sx(t)}" y="${top - 10}" text-anchor="middle">${o.tick(t)}</text>`;
    });
    s += `<line class="axis" x1="${sx(0)}" x2="${sx(0)}" y1="${top - 6}" y2="${H - 4}"/>`;
    rows.forEach((r, i) => {
      const y = top + i * rowH, by = y + (rowH - barH) / 2;
      const id = tipId(r.tip);
      s += `<g class="row" data-tip="${id}"${r.click ? ` data-click="${esc(r.click)}"` : ""}>`;
      s += `<rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}" rx="6"/>`;
      if (r.track !== undefined) s += `<path d="${hBarPath(sx(0), sx(r.track), by, barH)}" style="fill:var(--surface-2)"/>`;
      s += `<path d="${hBarPath(sx(0), sx(r.value), by, barH)}" style="fill:${r.color}"/>`;
      s += `<text x="${labelW}" y="${y + rowH / 2 + (r.sub ? -2 : 4)}" text-anchor="end" class="t-strong">${esc(fit(r.label, labelW, 6.6))}</text>`;
      if (r.sub) s += `<text x="${labelW}" y="${y + rowH / 2 + 11}" text-anchor="end" style="font-size:10px">${esc(fit(r.sub, labelW, 5.6))}</text>`;
      const vx = r.value >= 0 ? sx(Math.max(r.value, r.track || 0)) + 6 : sx(0) + 6;
      s += `<text x="${vx}" y="${y + rowH / 2 + 4}" class="t-strong num">${r.valueLabel}</text>`;
      s += `</g>`;
    });
    el.innerHTML = s + "</svg>";
  }

  // ---------- rendering: filters ----------
  function renderClientSelect() {
    const sel = document.getElementById("fClient");
    const clients = [...new Set(batches.filter((b) => state.segment === "All" || b.segment === state.segment).map((b) => b.client))];
    if (state.client !== "All" && !clients.includes(state.client)) state.client = "All";
    sel.innerHTML = `<option value="All">All clients</option>` + clients.map((c) => `<option ${c === state.client ? "selected" : ""}>${esc(c)}</option>`).join("");
  }
  function syncSegButtons() {
    [["fSegment", "segment"], ["fTeacher", "teacherType"], ["fBasis", "basis"]].forEach(([id, key]) => {
      document.querySelectorAll(`#${id} button`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state[key])));
    });
  }

  // ---------- OVERVIEW ----------
  function kpi(label, value, foot, swatch) {
    return `<div class="card kpi"><div class="label">${swatch ? `<i class="swatch" style="background:${swatch}"></i>` : ""}${label}</div><div class="value num">${value}</div><div class="foot">${foot}</div></div>`;
  }
  function renderOverview(list) {
    const a = agg(list);
    const clients = new Set(list.map((b) => b.client)).size;
    document.getElementById("kpis").innerHTML = !list.length ? "" : [
      kpi("Net revenue", rsShort(a.netRevenue), `Billing ${rsShort(a.grossRevenue)} less credit notes ${rsShort(-a.creditNotes)}`, "var(--revenue)"),
      kpi("Teacher cost", rsShort(a.teacherCost), `<strong>${pct(a.teacherCost / a.netRevenue)}</strong> of revenue`, "var(--teacher)"),
      kpi("Gross margin", rsShort(a.grossMargin), `<strong>${pct(a.gm)}</strong> of revenue · after teacher cost`),
      kpi("Ops team cost", rsShort(a.opsCost), `<strong>${pct(a.opsCost / a.netRevenue)}</strong> of revenue · shared by revenue`, "var(--ops)"),
      kpi("Contribution", rsShort(a.contribution), `<strong>${pct(a.cm)}</strong> of revenue · after teacher + ops`, "var(--contrib)"),
      kpi("Batches · Learners", `${a.batches} · ${a.learners}`, `${clients} client${clients === 1 ? "" : "s"} · ${rsShort(a.netRevenue / a.learners)} revenue per learner`),
    ].join("");

    // Rs 100 split
    const parts = [
      { k: "Teacher cost", v: a.teacherCost, c: "var(--teacher)", d: "paid to teachers for the hours they taught" },
      { k: "Ops team cost", v: a.opsCost, c: "var(--ops)", d: "share of the operations team's salaries" },
      { k: "Contribution", v: a.contribution, c: "var(--contrib)", d: "left over for sales, admin and profit" },
    ];
    const per100 = (v) => (a.netRevenue ? (v / a.netRevenue) * 100 : 0);
    const posTotal = parts.reduce((s, p) => s + Math.max(0, p.v), 0) || 1;
    document.getElementById("hundred").innerHTML = parts.filter((p) => p.v > 0).map((p) => {
      const w = (p.v / posTotal) * 100;
      return `<div style="flex:${w} 1 0;background:${p.c}" data-tip="${tipId(`<div class="tt-title">${p.k}</div>${ttRow("Amount", rs(p.v))}${ttRow("Per ₹100 of revenue", "₹" + per100(p.v).toFixed(1))}`)}">${w > 9 ? "₹" + per100(p.v).toFixed(0) : ""}</div>`;
    }).join("");
    document.getElementById("hundredKeys").innerHTML = parts.map((p) =>
      `<div class="k"><i class="swatch" style="background:${p.c}"></i><div><b class="num ${p.v < 0 ? "neg" : ""}">${p.v < 0 ? "−" : ""}₹${Math.abs(per100(p.v)).toFixed(1)}</b><span>${p.k}: ${p.d}</span></div></div>`).join("") +
      (a.contribution < 0 ? `<div class="k"><div><span class="neg">Costs are higher than revenue for this selection, so it runs at a loss.</span></div></div>` : "");

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
    steps.forEach((s) => {
      if (s.type === "total") { s.from = 0; s.to = s.v; run = s.v; }
      else { s.from = run; s.to = run + s.v; run = s.to; }
    });
    const W = widthOf(el), H = 280, top = 22, bottom = 40, left = 46;
    const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
    const hi = Math.max(...steps.map((s) => Math.max(s.from, s.to)), 1);
    const ticks = niceTicks(lo, hi, 4);
    const ymin = Math.min(lo, ticks[0]), ymax = Math.max(hi, ticks[ticks.length - 1]);
    const sy = (v) => top + (1 - (v - ymin) / (ymax - ymin)) * (H - top - bottom);
    const band = (W - left) / steps.length, bw = Math.min(40, band * 0.6);
    let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Waterfall from client billing to contribution">`;
    ticks.forEach((t) => { s += `<line class="gridline" x1="${left}" x2="${W}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${left - 6}" y="${sy(t) + 4}" text-anchor="end">${rsShort(t).replace(".00 L", " L")}</text>`; });
    s += `<line class="axis" x1="${left}" x2="${W}" y1="${sy(0)}" y2="${sy(0)}"/>`;
    steps.forEach((st, i) => {
      const cx = left + band * i + band / 2, x = cx - bw / 2;
      const a0 = Math.min(st.from, st.to), a1 = Math.max(st.from, st.to);
      let path;
      if (st.type === "total") path = vBarPath(x, bw, sy(0), sy(st.to));
      else path = `M${x},${sy(a1)}H${x + bw}V${sy(a0)}H${x}Z`;
      const tip = `<div class="tt-title">${st.l.join(" ").replace("- ", "")}</div>${ttRow("Amount", rs(st.v))}${a.netRevenue ? ttRow("% of net revenue", pct(st.v / a.netRevenue)) : ""}`;
      s += `<g class="row" data-tip="${tipId(tip)}"><rect class="hit" x="${cx - band / 2}" y="${top - 16}" width="${band}" height="${H - top}" rx="6"/>`;
      if (path) s += `<path d="${path}" style="fill:${st.c}"/>`;
      if (i < steps.length - 1) s += `<line x1="${x + bw}" x2="${x + band}" y1="${sy(st.to)}" y2="${sy(st.to)}" style="stroke:var(--text-muted);stroke-width:1" stroke-dasharray="0"/>`;
      const ly = st.type === "total" ? sy(Math.max(0, st.to)) - 6 : sy(a1) - 6;
      const narrow = W < 460, lbl = narrow ? rsShort(st.v).replace("₹", "").replace(" L", "L") : rsShort(st.v);
      if (Math.abs(st.v) > 0.5 || st.type === "total") s += `<text x="${cx}" y="${ly}" text-anchor="middle" class="t-strong num" style="font-size:${narrow ? 9 : 11}px">${lbl}</text>`;
      s += `<text x="${cx}" y="${H - bottom + 16}" text-anchor="middle">${st.l[0]}</text><text x="${cx}" y="${H - bottom + 29}" text-anchor="middle">${st.l[1]}</text></g>`;
    });
    el.innerHTML = s + "</svg>";
  }

  function renderInsights(list, a) {
    const el = document.getElementById("insights");
    if (!list.length) { el.innerHTML = `<li><div class="ic">ℹ︎</div><p>No batches match these filters.</p></li>`; return; }
    const out = [];
    const byClient = [...groupBy(list, "client")].map(([c, l]) => ({ c, a: agg(l) })).sort((x, y) => y.a.netRevenue - x.a.netRevenue);
    if (byClient.length > 1) {
      const top = byClient[0], share = top.a.netRevenue / a.netRevenue;
      out.push(["🎯", `<b>${esc(top.c)} brings ${pct(share, 0)} of revenue.</b> ${share > 0.5 ? "The business depends heavily on one client. Winning more Non-group clients would reduce this risk." : "Revenue is reasonably spread across clients."}`]);
    }
    out.push(["💡", `<b>Teachers cost ₹${((a.teacherCost / a.netRevenue) * 100).toFixed(0)} of every ₹100 earned</b>, leaving a gross margin of ${pct(a.gm)}. After the operations team's share (₹${((a.opsCost / a.netRevenue) * 100).toFixed(0)} per ₹100), <b>${pct(a.cm)}</b> is left as contribution.`]);
    const weak = list.filter((b) => b.cm < 0.3).sort((x, y) => x.cm - y.cm);
    if (weak.length) {
      out.push(["⚠️", `<b>${weak.length} batch${weak.length > 1 ? "es" : ""} under 30% contribution:</b> ${weak.slice(0, 5).map((b) => `${esc(b.id)} (${pct(b.cm, 0)})`).join(", ")}${weak.length > 5 ? "…" : ""}. ${weak.some((b) => b.cm < 0) ? "Negative means the batch costs more than it earns." : ""} Common causes are small batch size, a high consultant rate, or a batch that has only just started.`]);
    }
    const ft = list.filter((b) => b.teacherType === "Full Time"), co = list.filter((b) => b.teacherType === "Consultant");
    if (ft.length && co.length) {
      const af = agg(ft), ac = agg(co);
      out.push(["👩‍🏫", `<b>Full-time teachers cost ${pct(af.teacherCost / af.netRevenue, 0)} of revenue, consultants ${pct(ac.teacherCost / ac.netRevenue, 0)}.</b> Batches taught by full-time teachers earn ${pct(af.gm, 0)} gross margin vs ${pct(ac.gm, 0)} for consultants. Full-time teachers still have spare capacity (see Teachers tab).`]);
    }
    if (a.creditNotes < 0) {
      const cn = list.filter((b) => b.creditNotes < 0);
      out.push(["↩️", `<b>Credit notes cut ${rs(-a.creditNotes)} from revenue</b> (${cn.map((b) => esc(b.id)).join(", ")}). That is ${pct(-a.creditNotes / a.grossRevenue)} of billing.`]);
    }
    const best = [...list].sort((x, y) => y.contribution - x.contribution)[0];
    if (list.length > 1) out.push(["🏆", `<b>Top batch: ${esc(best.id)}</b> (${esc(best.client)}) contributed ${rs(best.contribution)} at ${pct(best.cm, 0)}. ${best.augDays && best.courseDays && best.augDays / best.courseDays > 0.5 ? "It's a short course, so most of its fee was earned in August." : ""}`]);
    el.innerHTML = out.map(([ic, t]) => `<li><div class="ic" aria-hidden="true">${ic}</div><p>${t}</p></li>`).join("");
  }

  // ---------- CLIENTS ----------
  function renderClients(list) {
    const total = agg(list);
    const rows = [...groupBy(list, "client")].map(([c, l]) => Object.assign({ client: c, segment: l[0].segment, share: total.netRevenue ? agg(l).netRevenue / total.netRevenue : 0 }, agg(l)))
      .sort((x, y) => y.netRevenue - x.netRevenue);

    // stacked revenue chart
    const el = document.getElementById("clientRevChart");
    const gross = state.basis === "gross";
    el.previousElementSibling.innerHTML = `<span><i class="swatch" style="background:var(--teacher)"></i>Teacher cost</span>` +
      (gross ? "" : `<span><i class="swatch" style="background:var(--ops)"></i>Ops team cost</span>`) +
      `<span><i class="swatch" style="background:var(--contrib)"></i>${gross ? "Gross margin" : "Contribution"}</span>`;
    if (!rows.length) { el.innerHTML = `<div class="empty">No clients match these filters.</div>`; }
    else {
      const W = widthOf(el), labelW = Math.min(150, W * 0.34), valW = 92, rowH = 44, barH = 20, top = 20;
      const max = Math.max(...rows.map((r) => Math.max(r.netRevenue, r.teacherCost + (gross ? 0 : r.opsCost))));
      const ticks = niceTicks(0, max, W < 500 ? 2 : 4), hi = Math.max(max, ticks[ticks.length - 1]);
      const x0 = labelW + 10, x1 = W - valW, sx = (v) => x0 + (v / hi) * (x1 - x0);
      const H = top + rows.length * rowH;
      let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Net revenue by client split into costs and contribution">`;
      ticks.forEach((t) => { s += `<line class="gridline" x1="${sx(t)}" x2="${sx(t)}" y1="${top - 6}" y2="${H}"/><text x="${sx(t)}" y="${top - 10}" text-anchor="middle">${rsShort(t)}</text>`; });
      rows.forEach((r, i) => {
        const y = top + i * rowH, by = y + (rowH - barH) / 2;
        const segs = [["Teacher cost", r.teacherCost, "var(--teacher)"]];
        if (!gross) segs.push(["Ops team cost", r.opsCost, "var(--ops)"]);
        const left = gross ? r.grossMargin : r.contribution;
        if (left > 0) segs.push([gross ? "Gross margin" : "Contribution", left, "var(--contrib)"]);
        const tip = `<div class="tt-title">${esc(r.client)}</div>${ttRow("Net revenue", rs(r.netRevenue), "var(--revenue)")}${ttRow("Teacher cost", rs(r.teacherCost), "var(--teacher)")}${gross ? "" : ttRow("Ops team cost", rs(r.opsCost), "var(--ops)")}${ttRow(gross ? "Gross margin" : "Contribution", rs(left), "var(--contrib)")}<hr>${ttRow("Margin", pct(mOf(r)))}${ttRow("Share of revenue", pct(r.share))}`;
        s += `<g class="row" data-tip="${tipId(tip)}" data-client="${esc(r.client)}"><rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}" rx="6"/>`;
        let cur = 0;
        segs.forEach((sg, j) => {
          const a0 = sx(cur) + (j ? 1 : 0), a1 = sx(cur + sg[1]) - (j < segs.length - 1 ? 1 : 0);
          const last = j === segs.length - 1;
          s += last ? `<path d="${hBarPath(a0, Math.max(a0 + 1, a1), by, barH)}" style="fill:${sg[2]}"/>` : `<rect x="${a0}" y="${by}" width="${Math.max(1, a1 - a0)}" height="${barH}" style="fill:${sg[2]}"/>`;
          cur += sg[1];
        });
        if (left < 0) s += `<line x1="${sx(r.netRevenue)}" x2="${sx(r.netRevenue)}" y1="${by - 4}" y2="${by + barH + 4}" style="stroke:var(--text-primary);stroke-width:2"/>`;
        s += `<text x="${labelW}" y="${y + rowH / 2 - 2}" text-anchor="end" class="t-strong">${esc(fit(r.client, labelW, 6.6))}</text>`;
        s += `<text x="${labelW}" y="${y + rowH / 2 + 11}" text-anchor="end" style="font-size:10px">${r.segment} · ${r.batches} batch${r.batches > 1 ? "es" : ""}</text>`;
        const endX = sx(Math.max(r.netRevenue, cur)) + 6;
        s += `<text x="${endX}" y="${y + rowH / 2 - 2}" class="t-strong num">${rsShort(r.netRevenue)}</text>`;
        s += `<text x="${endX}" y="${y + rowH / 2 + 11}" class="num" style="font-size:10px">${pct(r.share, 0)} of rev.</text></g>`;
      });
      el.innerHTML = s + "</svg>";
    }

    // segment compare
    const segs = [...groupBy(list, "segment")].map(([sg, l]) => Object.assign({ seg: sg }, agg(l))).sort((x, y) => y.netRevenue - x.netRevenue);
    document.getElementById("segCompare").innerHTML = !segs.length ? `<div class="empty">No data</div>` : `
      <div class="split" style="height:26px">${segs.map((sg) => `<div style="flex:${sg.netRevenue} 1 0;background:${sg.seg === "Group" ? "var(--seg-group)" : "var(--seg-non)"}" data-tip="${tipId(`<div class="tt-title">${sg.seg}</div>${ttRow("Net revenue", rs(sg.netRevenue))}${ttRow("Share", pct(sg.netRevenue / total.netRevenue))}`)}"></div>`).join("")}</div>
      <div class="legend">${segs.map((sg) => `<span><i class="swatch" style="background:${sg.seg === "Group" ? "var(--seg-group)" : "var(--seg-non)"}"></i>${sg.seg}: ${pct(sg.netRevenue / total.netRevenue, 0)} of revenue</span>`).join("")}</div>
      <div class="table-wrap"><table><thead><tr><th class="nosort l">Measure</th>${segs.map((sg) => `<th class="nosort">${sg.seg}</th>`).join("")}</tr></thead><tbody style="cursor:default">
        ${[["Batches", (x) => x.batches], ["Learners", (x) => x.learners], ["Net revenue", (x) => rs(x.netRevenue)], ["Revenue per learner", (x) => rs(x.netRevenue / x.learners)],
           ["Teacher cost", (x) => rs(x.teacherCost)], ["Gross margin %", (x) => pct(x.gm)], ["Contribution %", (x) => pct(x.cm)], ["Health (" + (state.basis === "gross" ? "gross" : "contribution") + ")", (x) => chip(mOf(x))]]
          .map(([k, f]) => `<tr><td class="l">${k}</td>${segs.map((sg) => `<td class="num">${f(sg)}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>`;

    // cards
    document.getElementById("clientCards").innerHTML = rows.map((r) => {
      const segsBar = [[r.teacherCost, "var(--teacher)", "Teacher"], [state.basis === "gross" ? 0 : r.opsCost, "var(--ops)", "Ops"], [Math.max(0, profitOf(r)), "var(--contrib)", "Left over"]].filter((x) => x[0] > 0);
      return `<div class="card client-card" data-client="${esc(r.client)}" tabindex="0">
        <div class="ch"><h3>${esc(r.client)}</h3><span class="tag"><i class="swatch" style="background:${r.segment === "Group" ? "var(--seg-group)" : "var(--seg-non)"}"></i>${r.segment}</span></div>
        <div class="big num">${rs(r.netRevenue)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${pct(r.share)} of revenue · ${basisLabel().split(" (")[0]} <b class="num" style="color:var(--text-primary)">${pct(mOf(r))}</b> ${chip(mOf(r))}</div>
        <div class="split">${segsBar.map((x) => `<div style="flex:${x[0]} 1 0;background:${x[1]}" title="${x[2]}"></div>`).join("")}</div>
        <div class="mini-stats">
          <div>Batches<b class="num">${r.batches}</b></div>
          <div>Learners<b class="num">${r.learners}</b></div>
          <div>Rev / learner<b class="num">${rsShort(r.netRevenue / r.learners)}</b></div>
          <div>Teacher cost<b class="num">${rsShort(r.teacherCost)}</b></div>
          <div>Gross margin<b class="num">${pct(r.gm)}</b></div>
          <div>Contribution<b class="num ${r.contribution < 0 ? "neg" : ""}">${rsShort(r.contribution)}</b></div>
        </div></div>`;
    }).join("") || "";

    // table
    const cols = [
      ["client", "Client", (r) => esc(r.client), "l"], ["segment", "Segment", (r) => r.segment, "l"], ["batches", "Batches", (r) => r.batches], ["learners", "Learners", (r) => r.learners],
      ["netRevenue", "Net revenue", (r) => rs(r.netRevenue)], ["teacherCost", "Teacher cost", (r) => rs(r.teacherCost)], ["grossMargin", "Gross margin", (r) => rs(r.grossMargin)],
      ["gm", "GM %", (r) => pct(r.gm)], ["opsCost", "Ops cost", (r) => rs(r.opsCost)], ["contribution", "Contribution", (r) => `<span class="${r.contribution < 0 ? "neg" : ""}">${rs(r.contribution)}</span>`],
      ["cm", "Contrib. %", (r) => `<span class="${r.cm < 0 ? "neg" : ""}">${pct(r.cm)}</span>`], ["share", "% of revenue", (r) => pct(r.share)],
    ];
    renderTable("clientTable", cols, rows, sorts.client, Object.assign({ client: "Total", segment: "" , share: rows.length ? 1 : 0 }, total), (r) => `data-client="${esc(r.client)}"`);
  }

  // ---------- tables ----------
  function renderTable(id, cols, rows, sort, totals, rowAttr) {
    const t = document.getElementById(id);
    const sorted = [...rows].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * sort.dir;
    });
    t.innerHTML = `<thead><tr>${cols.map(([k, h, , cls]) => `<th data-key="${k}" class="${cls || ""}" aria-sort="${sort.key === k ? (sort.dir > 0 ? "ascending" : "descending") : "none"}">${h}${sort.key === k ? `<span class="arr">${sort.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("")}</tr></thead>
      <tbody>${sorted.map((r) => `<tr ${rowAttr(r)}>${cols.map(([, , f, cls]) => `<td class="${cls || ""} num">${f(r)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="empty">No rows match these filters.</td></tr>`}</tbody>
      ${totals && rows.length > 1 ? `<tfoot><tr>${cols.map(([, , f, cls], i) => `<td class="${cls || ""} num">${i === 0 ? "Total" : totals.__skip && totals.__skip.includes(cols[i][0]) ? "" : f(totals)}</td>`).join("")}</tr></tfoot>` : ""}`;
    t.querySelectorAll("th[data-key]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (sort.key === k) sort.dir *= -1; else { sort.key = k; sort.dir = typeof rows[0]?.[k] === "string" ? 1 : -1; }
      render();
    }));
  }

  // ---------- BATCHES ----------
  function renderBatches(list) {
    document.getElementById("batchChartSub").textContent = `${basisLabel()} for each batch, highest first. Hover for details; click a bar to open the batch.`;
    document.getElementById("statusLegend").innerHTML = Object.keys(STATUS).map((k) => `<span class="chip ${k}"><i>${STATUS[k].icon}</i>${STATUS[k].label} ${k === "good" ? "50%+" : k === "moderate" ? "30–50%" : k === "thin" ? "0–30%" : "below 0%"}</span>`).join("");
    const el = document.getElementById("batchMarginChart");
    const rows = [...list].sort((a, b) => mOf(b) - mOf(a));
    if (!rows.length) el.innerHTML = `<div class="empty">No batches match these filters.</div>`;
    else hbarChart(el, rows.map((b) => ({
      label: b.id, sub: `${b.client.length > 18 ? b.client.slice(0, 17) + "…" : b.client} · ${b.learners} learner${b.learners > 1 ? "s" : ""}`,
      value: mOf(b), color: STATUS[statusOf(mOf(b))].color, valueLabel: `${STATUS[statusOf(mOf(b))].icon} ${pct(mOf(b))}`, tip: batchTip(b), click: b.id,
    })), { tick: (t) => Math.round(t * 100) + "%", labelW: 170, aria: "Margin by batch" });

    const cols = [
      ["id", "Batch", (b) => `<b>${esc(b.id)}</b>`, "l"], ["client", "Client", (b) => esc(b.client), "l"], ["teacher", "Teacher", (b) => `${esc(b.teacher)} <span class="tag">${b.teacherType === "Full Time" ? "FT" : "Cons."}</span>`, "l"],
      ["learners", "Learners", (b) => b.learners], ["grossRevenue", "Billing", (b) => rs(b.grossRevenue)], ["creditNotes", "Credit notes", (b) => b.creditNotes ? `<span class="neg">${rs(b.creditNotes)}</span>` : "–"],
      ["netRevenue", "Net revenue", (b) => rs(b.netRevenue)], ["teacherCost", "Teacher cost", (b) => rs(b.teacherCost)], ["gm", "GM %", (b) => pct(b.gm)],
      ["opsCost", "Ops cost", (b) => rs(b.opsCost)], ["contribution", "Contribution", (b) => `<span class="${b.contribution < 0 ? "neg" : ""}">${rs(b.contribution)}</span>`],
      ["cm", "Contrib. %", (b) => `<span class="${b.cm < 0 ? "neg" : ""}">${pct(b.cm)}</span>`], ["m", "Health", (b) => chip(mOf(b)), "l"],
    ];
    const rowsM = list.map((b) => Object.assign({}, b, { m: mOf(b) }));
    const tot = Object.assign(agg(list), { id: "Total", client: "", teacher: "", __skip: ["client", "teacher"] });
    tot.m = mOf(tot);
    renderTable("batchTable", cols, rowsM, sorts.batch, tot, (b) => `data-batch="${esc(b.id)}"`);
  }

  // ---------- drawer ----------
  const drawer = document.getElementById("drawer"), drawerBg = document.getElementById("drawer-bg");
  function closeDrawer() { drawer.classList.remove("open"); drawerBg.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
  drawer.querySelector(".close").addEventListener("click", closeDrawer);
  drawerBg.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  function batchCalcHTML(b) {
    const share = b.augDays / b.courseDays;
    const rate = b.teacherType === "Consultant" ? b.hourlyRate : b.teacherCost / b.augHours;
    return `
      <h4>1 · Revenue earned in August</h4>
      <div class="calc">
        <span class="k">Learners × fee per learner</span><span class="v">${b.learners} × ${rs(b.feePerLearner)}</span>
        <span class="k">Total course fee</span><span class="v">${rs(b.contractValue)}</span>
        <span class="k">Course runs</span><span class="v">${fmtDate(b.start)} – ${fmtDate(b.end)}</span>
        <span class="k">Days in August ÷ course days</span><span class="v">${b.augDays} ÷ ${b.courseDays} = ${pct(share)}</span>
        <span class="k">Billing earned in August</span><span class="v">${rs(b.grossRevenue)}</span>
        <span class="k">Credit notes</span><span class="v ${b.creditNotes ? "neg" : ""}">${b.creditNotes ? rs(b.creditNotes) : "–"}</span>
        <span class="k tot">Net revenue</span><span class="v tot">${rs(b.netRevenue)}</span>
      </div>
      <h4>2 · Teacher cost</h4>
      <div class="calc">
        <span class="k">Total course hours</span><span class="v">${b.courseHours} hrs</span>
        <span class="k">Hours taught in August (${pct(share)})</span><span class="v">${b.augHours.toFixed(1)} hrs</span>
        <span class="k">${b.teacherType === "Consultant" ? "Consultant rate per hour" : "Full-time cost per hour (salary basis)"}</span><span class="v">${rs(rate)}</span>
        <span class="k tot">Teacher cost</span><span class="v tot">${rs(b.teacherCost)}</span>
        <span class="k">Gross margin</span><span class="v">${rs(b.grossMargin)} · ${pct(b.gm)}</span>
      </div>
      <h4>3 · Ops team cost & contribution</h4>
      <div class="calc">
        <span class="k">Share of ops cost pool (${pct(OPS_RATE)} of revenue)</span><span class="v">${rs(b.opsCost)}</span>
        <span class="k tot">Contribution</span><span class="v tot ${b.contribution < 0 ? "neg" : ""}">${rs(b.contribution)} · ${pct(b.cm)}</span>
      </div>`;
  }

  function openBatch(id) {
    const b = batches.find((x) => x.id === id);
    if (!b) return;
    const rpl = b.grossRevenue / b.learners;
    document.getElementById("drawerBody").innerHTML = `
      <h2>${esc(b.id)}</h2>
      <div style="color:var(--text-secondary);font-size:13px">${esc(b.client)} · ${b.segment} · taught by ${esc(b.teacher)} (${b.teacherType === "Full Time" ? "full-time" : "consultant"})</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:13px">
        <div>Gross margin <b class="num">${pct(b.gm)}</b> ${chip(b.gm)}</div>
        <div>Contribution <b class="num">${pct(b.cm)}</b> ${chip(b.cm)}</div>
      </div>
      ${batchCalcHTML(b)}
      <h4>What if…</h4>
      <div class="sim">
        <div class="row"><span>Learners in batch</span><b class="num" id="simLv">${b.learners}</b></div>
        <input type="range" id="simL" min="1" max="${Math.max(25, b.learners * 2)}" value="${b.learners}" aria-label="Learners in batch">
        <div class="row" style="margin-top:8px"><span>Fee per learner</span><b class="num" id="simFv">${rs(b.feePerLearner)}</b></div>
        <input type="range" id="simF" min="-50" max="50" value="0" step="5" aria-label="Change in fee per learner">
        <div class="res">
          <div>Net revenue<b class="num" id="simR"></b></div>
          <div>Contribution<b class="num" id="simC"></b></div>
          <div>Contrib. %<b class="num" id="simM"></b></div>
        </div>
        <p class="explain" id="simBE"></p>
        <p class="explain">Assumes the teacher's hours stay the same, since a teacher takes the class whatever its size. Ops cost stays at ${pct(OPS_RATE)} of revenue.</p>
      </div>`;
    const L = document.getElementById("simL"), F = document.getElementById("simF");
    const upd = () => {
      const l = +L.value, f = 1 + F.value / 100;
      const net = rpl * l * f + b.creditNotes, ops = net * OPS_RATE, c = net - b.teacherCost - ops;
      document.getElementById("simLv").textContent = l;
      document.getElementById("simFv").textContent = `${rs(b.feePerLearner * f)}${+F.value ? ` (${F.value > 0 ? "+" : ""}${F.value}%)` : ""}`;
      document.getElementById("simR").textContent = rsShort(net);
      const cEl = document.getElementById("simC"); cEl.textContent = rsShort(c); cEl.className = "num" + (c < 0 ? " neg" : "");
      document.getElementById("simM").innerHTML = net ? `${pct(c / net)}` : "–";
      const be = (b.teacherCost / (1 - OPS_RATE) - b.creditNotes) / (rpl * f);
      const t50 = (b.teacherCost / (1 - OPS_RATE - 0.5) - b.creditNotes) / (rpl * f);
      document.getElementById("simBE").innerHTML = `At this fee the batch covers its costs with <b>${Math.max(1, Math.ceil(be))}</b> learner${Math.ceil(be) > 1 ? "s" : ""}, and reaches 50% contribution with <b>${Math.max(1, Math.ceil(t50))}</b>.`;
    };
    L.addEventListener("input", upd); F.addEventListener("input", upd); upd();
    drawer.classList.add("open"); drawerBg.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    drawer.scrollTop = 0;
  }

  // ---------- TEACHERS ----------
  function renderTeachers(list) {
    const types = [...groupBy(list, "teacherType")].map(([t, l]) => Object.assign({ t, teachers: new Set(l.map((b) => b.teacher)).size }, agg(l)));
    document.getElementById("ttCompare").innerHTML = types.map((x) => `
      <div class="card"><h2><i class="swatch" style="background:${x.t === "Full Time" ? "var(--ft)" : "var(--cons)"};margin-right:8px"></i>${x.t === "Full Time" ? "Full-time teachers" : "Consultant teachers"}</h2>
      <p class="sub">${x.t === "Full Time" ? "On a monthly salary. A batch is charged only for the hours taught in it." : "Paid per teaching hour (₹1,000–₹1,300 an hour)."}</p>
      <div class="mini-stats" style="grid-template-columns:repeat(4,1fr)">
        <div>Teachers<b class="num">${x.teachers}</b></div><div>Batches<b class="num">${x.batches}</b></div>
        <div>Hours in Aug<b class="num">${x.augHours.toFixed(0)}</b></div><div>Net revenue<b class="num">${rsShort(x.netRevenue)}</b></div>
        <div>Teacher cost<b class="num">${rsShort(x.teacherCost)}</b></div><div>Cost % of rev.<b class="num">${pct(x.teacherCost / x.netRevenue, 0)}</b></div>
        <div>Cost / hour<b class="num">${rs(x.teacherCost / x.augHours)}</b></div><div>Gross margin<b class="num">${pct(x.gm)}</b></div>
      </div></div>`).join("") || `<div class="card empty">No batches match these filters.</div>`;

    const teachers = [...groupBy(list, "teacher")].map(([t, l]) => Object.assign({ teacher: t, teacherType: l[0].teacherType, ids: l.map((b) => b.id).join(", ") }, agg(l)))
      .map((x) => Object.assign(x, { cph: x.teacherCost / x.augHours, rph: x.netRevenue / x.augHours, util: x.augHours / CAPACITY_HRS }));

    const cphEl = document.getElementById("costPerHourChart");
    const legend = `<div class="legend"><span><i class="swatch" style="background:var(--ft)"></i>Full-time</span><span><i class="swatch" style="background:var(--cons)"></i>Consultant</span></div>`;
    if (!teachers.length) cphEl.innerHTML = `<div class="empty">No data</div>`;
    else {
      cphEl.innerHTML = legend + `<div></div>`;
      hbarChart(cphEl.lastElementChild, [...teachers].sort((a, b) => a.cph - b.cph).map((x) => ({
        label: x.teacher, sub: `${x.batches} batch${x.batches > 1 ? "es" : ""} · ${x.augHours.toFixed(0)} hrs`, value: x.cph,
        color: x.teacherType === "Full Time" ? "var(--ft)" : "var(--cons)", valueLabel: rs(x.cph),
        tip: `<div class="tt-title">${esc(x.teacher)}</div>${ttRow("Type", x.teacherType)}${ttRow("Batches", esc(x.ids))}${ttRow("Hours in Aug", x.augHours.toFixed(1))}${ttRow("Teacher cost", rs(x.teacherCost))}${ttRow("Cost per hour", rs(x.cph))}${ttRow("Revenue per hour", rs(x.rph))}`,
      })), { tick: (t) => "₹" + inr.format(t), labelW: 140, aria: "Teacher cost per teaching hour" });
    }

    const ft = teachers.filter((x) => x.teacherType === "Full Time").sort((a, b) => b.util - a.util);
    const uEl = document.getElementById("utilChart");
    if (!ft.length) uEl.innerHTML = `<div class="empty">No full-time teachers in this selection.</div>`;
    else hbarChart(uEl, ft.map((x) => ({
      label: x.teacher, sub: `${x.batches} batch${x.batches > 1 ? "es" : ""}`, value: x.augHours, track: CAPACITY_HRS, color: "var(--ft)",
      valueLabel: `${x.augHours.toFixed(0)} of ${CAPACITY_HRS} hrs · ${pct(x.util, 0)}`,
      tip: `<div class="tt-title">${esc(x.teacher)}</div>${ttRow("Hours taught in Aug", x.augHours.toFixed(1))}${ttRow("Capacity", CAPACITY_HRS + " hrs")}${ttRow("Capacity used", pct(x.util))}${ttRow("Batches", esc(x.ids))}`,
    })), { tick: (t) => t + "h", labelW: 120, valW: 150, max: CAPACITY_HRS, aria: "Full-time teacher capacity used" });

    const cols = [
      ["teacher", "Teacher", (x) => `<b>${esc(x.teacher)}</b>`, "l"], ["teacherType", "Type", (x) => x.teacherType, "l"], ["batches", "Batches", (x) => x.batches],
      ["learners", "Learners", (x) => x.learners], ["augHours", "Hours (Aug)", (x) => x.augHours.toFixed(1)], ["netRevenue", "Net revenue", (x) => rs(x.netRevenue)],
      ["teacherCost", "Teacher cost", (x) => rs(x.teacherCost)], ["cph", "Cost / hr", (x) => rs(x.cph)], ["rph", "Revenue / hr", (x) => rs(x.rph)],
      ["gm", "GM %", (x) => pct(x.gm)], ["cm", "Contrib. %", (x) => `<span class="${x.cm < 0 ? "neg" : ""}">${pct(x.cm)}</span>`],
    ];
    const tot = agg(list); tot.cph = tot.teacherCost / tot.augHours; tot.rph = tot.netRevenue / tot.augHours; tot.teacherType = ""; tot.__skip = ["teacherType"];
    renderTable("teacherTable", cols, teachers, sorts.teacher, tot, (x) => `data-teacher="${esc(x.teacher)}"`);
  }

  // ---------- METHOD ----------
  function renderMethod(list) {
    const b = list.find((x) => x.id === "A1.61") || list[0] || batches[0];
    document.getElementById("exampleSub").textContent = `Batch ${b.id} for ${b.client}, worked through step by step.`;
    document.getElementById("example").innerHTML = batchCalcHTML(b);
    document.getElementById("opsPool").innerHTML = `
      <span class="k">Operations team salaries (August payroll)</span><span class="v">${rs(D.opsPayroll)}</span>
      <span class="k">Less: full-time teacher cost already charged to batches</span><span class="v neg">${rs(-D.ftTeacherCostInCogs)}</span>
      <span class="k tot">Ops cost pool to share across batches</span><span class="v tot">${rs(D.opsPool)}</span>
      <span class="k">Total net revenue (all batches)</span><span class="v">${rs(D.opsPool / OPS_RATE)}</span>
      <span class="k tot">Ops cost per ₹100 of revenue</span><span class="v tot">₹${(OPS_RATE * 100).toFixed(1)}</span>`;
    document.getElementById("opsPct").textContent = pct(OPS_RATE);
  }

  // ---------- main render ----------
  function render() {
    tips = [];
    syncSegButtons();
    renderClientSelect();
    const pill = document.getElementById("teacherPill");
    pill.hidden = state.teacher === "All";
    pill.innerHTML = `Teacher: ${esc(state.teacher)} <button type="button" class="reset" id="clearTeacher" aria-label="Clear teacher filter" style="text-decoration:none">×</button>`;
    const list = filtered();
    ({ overview: renderOverview, clients: renderClients, batches: renderBatches, teachers: renderTeachers, method: renderMethod })[state.tab](list);
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
  [["fSegment", "segment"], ["fTeacher", "teacherType"], ["fBasis", "basis"]].forEach(([id, key]) => {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => { state[key] = b.dataset.v; render(); }));
  });
  document.getElementById("fClient").addEventListener("change", (e) => { state.client = e.target.value; render(); });
  document.getElementById("resetBtn").addEventListener("click", () => { Object.assign(state, { segment: "All", client: "All", teacherType: "All", teacher: "All" }); render(); });

  document.addEventListener("click", (e) => {
    if (e.target.id === "clearTeacher") { state.teacher = "All"; render(); return; }
    const bEl = e.target.closest("[data-batch],[data-click]");
    if (bEl) { openBatch(bEl.dataset.batch || bEl.dataset.click); return; }
    const cEl = e.target.closest("[data-client]");
    if (cEl && cEl.dataset.client !== "Total") { state.client = cEl.dataset.client; state.segment = "All"; setTab("batches"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const tEl = e.target.closest("[data-teacher]");
    if (tEl && tEl.dataset.teacher !== "undefined") {
      const b = batches.find((x) => x.teacher === tEl.dataset.teacher);
      state.teacher = tEl.dataset.teacher; state.teacherType = b.teacherType; state.client = "All"; state.segment = "All";
      setTab("batches"); window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".client-card")) e.target.click();
  });

  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 120); });

  // theme toggle
  const root = document.documentElement;
  try { const t = localStorage.getItem("tmc-theme"); if (t) root.dataset.theme = t; } catch (e) { /* storage unavailable */ }
  document.getElementById("themeBtn").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("tmc-theme", root.dataset.theme); } catch (e) { /* ignore */ }
  });

  const initial = (location.hash || "").slice(1);
  setTab(["overview", "clients", "batches", "teachers", "method"].includes(initial) ? initial : "overview");
})();
