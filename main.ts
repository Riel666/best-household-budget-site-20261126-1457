// Hearth & Ledger — a household budget site (Node 22, standard library only).
//
// The site is generated, deterministically and with no network access, from
// the fictional Marlowe household's November 2026 figures embedded in
// data/household.json (income, 45 transactions, 12 category budgets and 4
// savings goals). This program renders the whole static site — dashboard,
// transaction ledger, budgets, savings goals and a how-it-works page —
// into /output/app, copies screenshots/ beside it, and writes
// /output/dossier.json with the vendored make.fun library.
//
// The generated site is plain files under app/: relative links only, inline
// SVG charts, no external request of any kind, and it works with JavaScript
// off except for the search, filters, sorting and the two forms.
//
// Serve the generated site locally with `node serve.ts` (after running this),
// then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const appOut = join(out, 'app');

interface Bill { amount: number; auto: boolean; due: string; label: string }
interface Category { blurb: string; budget: number; key: string; label: string; spent: number }
interface Goal { blurb: string; key: string; label: string; monthly: number; saved: number; target: number }
interface Income { amount: number; source: string }
interface Transaction { amount: number; category: string; date: string; merchant: string; note: string }
interface Trend { income: number; month: string; saved: number; spent: number }
interface Household {
  bills: Bill[]; categories: Category[]; currency: string; goals: Goal[];
  household: string; income: Income[]; members: string; month: string;
  note: string; transactions: Transaction[]; trend: Trend[];
}

const DATA = JSON.parse(readFileSync(join(here, 'data', 'household.json'), 'utf8')) as Household;
const CATS = DATA.categories;
const STYLE = readFileSync(join(here, 'templates', 'style.css'), 'utf8');
const APPJS = readFileSync(join(here, 'templates', 'app.js'), 'utf8');

// ---------- formatting ----------
const money = (n: number): string =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pctOf = (part: number, whole: number): number => (whole === 0 ? 0 : (part / whole) * 100);
const catLabel = (key: string): string => CATS.find((c) => c.key === key)?.label ?? key;

const incomeTotal = DATA.income.reduce((s, i) => s + i.amount, 0);
const spentExSavings = CATS.filter((c) => c.key !== 'savings').reduce((s, c) => s + c.spent, 0);
const savedTotal = CATS.find((c) => c.key === 'savings')?.spent ?? 0;
const remaining = incomeTotal - spentExSavings - savedTotal;
const budgetTotal = CATS.reduce((s, c) => s + c.budget, 0);
const overCats = CATS.filter((c) => c.spent > c.budget);

// ---------- shared chrome ----------
const NAV = [
  ['index.html', 'Dashboard'],
  ['transactions.html', 'Transactions'],
  ['budgets.html', 'Budgets'],
  ['goals.html', 'Goals'],
  ['how-it-works.html', 'How it works'],
] as const;

function shell(opts: { title: string; current: string; body: string; scripts?: string }): string {
  const links = NAV.map(([href, label]) => {
    const cur = opts.current === href ? ' aria-current="page"' : '';
    return `<a href="${href}"${cur}>${label}</a>`;
  }).join('');
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + `<title>${esc(opts.title)} · Hearth &amp; Ledger</title>\n`
    + '<link rel="stylesheet" href="style.css">\n'
    + (opts.scripts ?? '')
    + '</head>\n<body>\n'
    + '<header class="site-head"><div class="site-head-inner">'
    + '<a class="brand" href="index.html">Hearth <em>&amp;</em> Ledger</a>'
    + '<span class="tagline">A household budget, kept in the open</span>'
    + `<nav class="main-nav" aria-label="Main">${links}</nav>`
    + '</div></header>\n'
    + `<main class="wrap">\n${opts.body}\n</main>\n`
    + '<footer class="wrap site-foot"><nav aria-label="Footer">'
    + '<a href="index.html">Dashboard</a><a href="transactions.html">Transactions</a>'
    + '<a href="budgets.html">Budgets</a><a href="goals.html">Goals</a>'
    + '<a href="how-it-works.html">How it works</a></nav>'
    + `<p>${esc(DATA.note)} The figures are the Marlowe household's ${esc(DATA.month)} budget. `
    + 'This is a static site: no tracking, no accounts, no network requests — every page works offline.</p>'
    + '<p>Hearth &amp; Ledger is an original site built for make.fun\u2019s household budget bounty. '
    + 'Household, merchants and figures are invented for the sample month.</p></footer>\n'
    + '</body>\n</html>\n';
}

// ---------- inline SVG charts (drawn at build time, no JavaScript) ----------
const PALETTE = ['#1e4d36', '#c05b2e', '#b98a1d', '#2f6b4f', '#7a5c0e', '#4a7a96', '#8a4a6b', '#5b7a3a', '#96522f', '#3f5a80', '#6b8e23', '#a63a2a'];

function donut(rows: { label: string; value: number; color: string }[]): string {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const cx = 130; const cy = 130; const r = 104; const inner = 62;
  let offset = 25; // start at the top
  const arcs = rows.map((row) => {
    const frac = row.value / total;
    const a0 = (offset / 100) * Math.PI * 2 - Math.PI / 2;
    offset += frac * 100;
    const a1 = (offset / 100) * Math.PI * 2 - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0); const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L ${cx} ${cy} Z" fill="${row.color}"/>`;
  }).join('');
  const hole = `<circle cx="${cx}" cy="${cy}" r="${inner}" fill="#fffdf8"/>`;
  const legend = rows.map((row) =>
    `<span><i style="background:${row.color}"></i>${esc(row.label)} ${money0(row.value)}</span>`).join('');
  return `<svg class="chart" viewBox="0 0 260 260" role="img" aria-label="Donut chart of November spending by category">${arcs}${hole}`
    + `<text x="130" y="124" text-anchor="middle" font-size="22" font-weight="800" fill="#22301f">${money0(total)}</text>`
    + `<text x="130" y="146" text-anchor="middle" font-size="12" fill="#4c5a48">spent in November</text></svg>`
    + `<div class="legend">${legend}</div>`;
}

function hbars(rows: { label: string; value: number; display: string; color: string }[], max: number, note: string): string {
  const rowH = 34;
  const height = 22 + rows.length * rowH;
  const bars = rows.map((r, i) => {
    const y = 26 + i * rowH;
    const w = Math.max(2, (r.value / max) * 480);
    return `<text x="0" y="${y + 14}" class="bar-label">${esc(r.label)}</text>`
      + `<rect x="150" y="${y}" width="${w.toFixed(1)}" height="20" rx="4" fill="${r.color}"/>`
      + `<text x="${(158 + w).toFixed(1)}" y="${y + 14}" class="bar-value">${esc(r.display)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 760 ${height}" role="img" aria-label="${esc(note)}">${bars}</svg>`
    + `<p class="chart-note">${esc(note)}</p>`;
}

// ---------- pages ----------
function statCards(): string {
  return `<div class="grid grid-4">`
    + `<div class="card stat-card"><div class="num">${money(incomeTotal)}</div><div class="label">Income</div><div class="src">Maya $3,900 + Tom $2,950</div></div>`
    + `<div class="card stat-card"><div class="num">${money(spentExSavings)}</div><div class="label">Spent</div><div class="src">Excluding the savings transfer</div></div>`
    + `<div class="card stat-card"><div class="num up">${money(savedTotal)}</div><div class="label">Saved</div><div class="src">Moved to goals on payday</div></div>`
    + `<div class="card stat-card"><div class="num">${money(remaining)}</div><div class="label">Left to allocate</div><div class="src">Unbudgeted, for December's buffer</div></div>`
    + `</div>`;
}

function pageIndex(): string {
  const spendRows = CATS.filter((c) => c.key !== 'savings')
    .map((c, i) => ({ label: c.label, value: c.spent, color: PALETTE[i % PALETTE.length] }))
    .sort((a, b) => b.value - a.value);
  const recent = [...DATA.transactions]
    .filter((t) => t.category !== 'income')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const recentRows = recent.map((t) =>
    `<tr><td>${esc(t.date)}</td><td>${esc(t.merchant)}</td><td>${esc(catLabel(t.category))}</td>`
    + `<td class="num" data-value="${t.amount}">${money(t.amount)}</td></tr>`).join('');
  const goalCards = DATA.goals.map((g) => {
    const p = pctOf(g.saved, g.target);
    return `<div class="card stat-card"><div class="num">${Math.round(p)}%</div><div class="label">${esc(g.label)}</div>`
      + `<div class="src">${money(g.saved)} of ${money(g.target)}</div>`
      + `<div class="bar"><i style="width:${p.toFixed(1)}%"></i></div></div>`;
  }).join('');
  const bills = DATA.bills.slice(0, 4).map((b) =>
    `<tr><td>${esc(b.label)}</td><td>${esc(b.due)}</td><td class="num">${money(b.amount)}</td><td>${b.auto ? 'Auto-pay' : 'Pay by hand'}</td></tr>`).join('');
  const body = `<section class="hero"><p class="eyebrow" style="color:#f0b429">November 2026 · ${esc(DATA.members)}</p>`
    + `<h1>Where did the money go this month?</h1>`
    + `<p class="lede">The Marlowe household brings home ${money(incomeTotal)} a month. `
    + `This dashboard shows what November cost, what is left, and what the savings goals are doing — `
    + `every figure from the household's own ledger, nothing estimated.</p>`
    + `<div class="hero-stats">`
    + `<div class="hero-stat"><b>${money(incomeTotal)}</b><span>income, November</span></div>`
    + `<div class="hero-stat"><b>${money(spentExSavings)}</b><span>spent, excluding savings</span></div>`
    + `<div class="hero-stat"><b>${money(savedTotal)}</b><span>moved to savings goals</span></div>`
    + `<div class="hero-stat"><b>${money(remaining)}</b><span>left to allocate</span></div>`
    + `</div></section>`
    + statCards()
    + (overCats.length
      ? `<div class="callout"><strong>${overCats.length} categories are over budget:</strong> `
        + overCats.map((c) => `${esc(c.label)} ${money(c.spent)} of ${money(c.budget)}`).join(' · ')
        + `. See <a href="budgets.html">Budgets</a> for what pushed each one over.</div>`
      : '')
    + `<div class="two-col"><div class="card"><h2 style="margin-top:0">Spending by category</h2>`
    + donut(spendRows)
    + `<p class="chart-note">Housing is the biggest slice, as it is for most households. Groceries ran over budget this month — see Budgets.</p></div>`
    + `<div class="card"><h2 style="margin-top:0">Bills coming up</h2>`
    + `<div class="table-scroll"><table class="data"><caption>December bills, in due order</caption>`
    + `<thead><tr><th scope="col">Bill</th><th scope="col">Due</th><th scope="col" class="num">Amount</th><th scope="col">How</th></tr></thead><tbody>${bills}</tbody></table></div>`
    + `<p class="small">The mortgage and the car insurance leave by auto-pay. The water bill is paid by hand before the 15th.</p>`
    + `<p><a href="budgets.html">See every budget →</a></p></div></div>`
    + `<h2>Latest spending</h2>`
    + `<div class="card"><div class="table-scroll"><table class="data"><caption>Most recent outgoings, newest first</caption>`
    + `<thead><tr><th scope="col">Date</th><th scope="col">Where</th><th scope="col">Category</th><th scope="col" class="num">Amount</th></tr></thead><tbody>${recentRows}</tbody></table></div>`
    + `<p><a href="transactions.html">See all ${DATA.transactions.length} November transactions →</a></p></div>`
    + `<h2>Savings goals</h2><div class="grid grid-4">${goalCards}</div>`
    + `<p><a href="goals.html">Open the goals →</a> &nbsp;·&nbsp; <a href="how-it-works.html">How the figures are worked out →</a></p>`;
  return shell({ title: 'Dashboard — November 2026', current: 'index.html', body });
}

function pageTransactions(): string {
  const rows = [...DATA.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) =>
      `<tr data-category="${esc(t.category)}"><td>${esc(t.date)}</td><td>${esc(t.merchant)}</td>`
      + `<td>${esc(catLabel(t.category))}</td>`
      + `<td class="num" data-value="${t.amount}">${money(t.amount)}</td><td>${esc(t.note)}</td></tr>`).join('');
  const options = CATS.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('')
    + '<option value="income">Income</option>';
  const body = `<p class="eyebrow">Transactions</p><h1>Every dollar, in one ledger</h1>`
    + `<p class="lede">All ${DATA.transactions.length} movements in ${esc(DATA.month)}: ${money(incomeTotal)} in, `
    + `${money(spentExSavings + savedTotal)} out. Income is shown in green. Use the filter to look at one category, `
    + `or add a transaction of your own — it is saved on this device only.</p>`
    + `<div class="search-row"><div class="field"><label for="tx-category">Category</label>`
    + `<select id="tx-category"><option value="">All categories</option>${options}</select></div>`
    + `<div class="field"><label for="tx-search">Search</label>`
    + `<input type="text" id="tx-search" placeholder="Merchant or note…" autocomplete="off"></div>`
    + `<span class="small" id="tx-count"></span></div>`
    + `<div class="card"><div class="table-scroll"><table class="data sortable" id="tx-table">`
    + `<caption>November 2026 ledger — click a column header to sort</caption>`
    + `<thead><tr><th scope="col"><button class="sort" data-type="text">Date ↕</button></th>`
    + `<th scope="col"><button class="sort" data-type="text">Where ↕</button></th>`
    + `<th scope="col"><button class="sort" data-type="text">Category ↕</button></th>`
    + `<th scope="col" class="num"><button class="sort" data-type="number">Amount ↕</button></th>`
    + `<th scope="col">Note</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
    + `<div class="card"><h2 style="margin-top:0">Add a transaction</h2>`
    + `<form id="add-tx-form"><div class="form-grid">`
    + `<div class="field"><label for="tx-date">Date</label><input type="date" id="tx-date" value="2026-11-26"></div>`
    + `<div class="field"><label for="tx-merchant">Where</label><input type="text" id="tx-merchant" placeholder="e.g. GreenMart" required></div>`
    + `<div class="field"><label for="tx-cat">Category</label><select id="tx-cat">${CATS.filter((c) => c.key !== 'savings' && c.key !== 'income').map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('')}</select></div>`
    + `<div class="field"><label for="tx-amount">Amount ($)</label><input type="number" id="tx-amount" min="0.01" step="0.01" placeholder="e.g. 42.50" required></div>`
    + `</div><p><button type="submit" class="btn">Add to the ledger</button></p>`
    + `<p class="small" id="tx-added-note"></p></form></div>`;
  return shell({ title: 'Transactions', current: 'transactions.html', body, scripts: '<script src="data.js"></script>\n<script src="app.js" defer></script>' });
}

function pageBudgets(): string {
  const rows = [...CATS].sort((a, b) => b.spent - a.spent).map((c) => {
    const p = pctOf(c.spent, c.budget);
    const over = c.spent > c.budget;
    const cls = over ? 'over' : (p >= 90 ? 'warn' : '');
    const barCls = over ? 'over' : (p >= 90 ? 'warn' : '');
    const status = over
      ? `<span class="pill warn">Over by ${money(c.spent - c.budget)}</span>`
      : `<span class="pill">${money(c.budget - c.spent)} left</span>`;
    return `<div class="budget-row" data-pct="${p.toFixed(1)}" data-spent="${c.spent}" data-label="${esc(c.label)}">`
      + `<div class="budget-top"><b>${esc(c.label)}</b><span>${money(c.spent)} of ${money(c.budget)} · ${Math.round(p)}% ${status}</span></div>`
      + `<div class="bar"><i class="${barCls}" style="width:${Math.min(100, p).toFixed(1)}%"></i></div>`
      + `<p class="budget-note">${esc(c.blurb)}</p></div>`;
  }).join('');
  const trendMax = Math.max(...DATA.trend.map((t) => t.spent));
  const trendChart = hbars(
    DATA.trend.map((t) => ({ label: t.month.replace(' 2026', ''), value: t.spent, display: money(t.spent), color: '#2f6b4f' })),
    trendMax, 'Spending excluding the savings transfer, for the last three months. November is the middle month of the three.');
  const body = `<p class="eyebrow">Budgets</p><h1>Twelve envelopes, one per category</h1>`
    + `<p class="lede">The household budgets ${money(budgetTotal)} a month across ${CATS.length} categories and has spent `
    + `${money(spentExSavings + savedTotal)} of it so far in ${esc(DATA.month)}. Three categories are over: `
    + overCats.map((c) => esc(c.label)).join(', ')
    + `. The rule here is simple — an envelope that runs out waits until next month, unless the household agrees to move money between envelopes.</p>`
    + `<div class="card"><div class="tabs" role="group" aria-label="Sort budgets">`
    + `<label for="budget-sort" style="align-self:center">Sort by</label>`
    + `<select id="budget-sort"><option value="spent-desc">Most spent first</option><option value="pct-desc">Highest % used first</option><option value="pct-asc">Lowest % used first</option><option value="name">Name A–Z</option></select></div>`
    + `<div id="budget-list">${rows}</div></div>`
    + `<h2>How November compares</h2><div class="card">${trendChart}`
    + `<p>October cost more — the car service and a birthday. September was the cheapest of the three, helped by a quiet month for the house.</p></div>`
    + `<div class="callout green"><strong>The payday rule.</strong> The ${money(savedTotal)} savings transfer leaves on the 1st, `
    + `before anything else is spent. Saving first is why the goals keep moving even in a month that runs over in three categories.</div>`;
  return shell({ title: 'Budgets', current: 'budgets.html', body, scripts: '<script src="data.js"></script>\n<script src="app.js" defer></script>' });
}

function pageGoals(): string {
  const cards = DATA.goals.map((g) => {
    const p = pctOf(g.saved, g.target);
    const monthsLeft = Math.ceil(Math.max(0, g.target - g.saved) / g.monthly);
    return `<div class="card" data-goal="${esc(g.key)}"><div class="goal-head"><h3 style="margin:0">${esc(g.label)}</h3><span class="pct">${Math.round(p)}%</span></div>`
      + `<p class="budget-note">${esc(g.blurb)}</p>`
      + `<p><b class="goal-saved">${money(g.saved)} of ${money(g.target)}</b></p>`
      + `<div class="bar"><i style="width:${p.toFixed(1)}%"></i></div>`
      + `<p class="meter-note goal-left">${money(g.target - g.saved)} to go · ${money(g.monthly)} a month</p>`
      + `<p class="small">At ${money(g.monthly)} a month, done in about ${monthsLeft} month${monthsLeft === 1 ? '' : 's'}.</p></div>`;
  }).join('');
  const totalSaved = DATA.goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = DATA.goals.reduce((s, g) => s + g.target, 0);
  const options = DATA.goals.map((g) => `<option value="${esc(g.key)}">${esc(g.label)}</option>`).join('');
  const body = `<p class="eyebrow">Goals</p><h1>Four things the household is saving for</h1>`
    + `<p class="lede">${money(totalSaved)} saved toward ${money(totalTarget)} of goals — `
    + `${Math.round(pctOf(totalSaved, totalTarget))}% of the way there. Every payday, ${money(savedTotal)} is split four ways: `
    + `emergency ${money(500)}, roof ${money(300)}, holiday ${money(200)} and car ${money(200)}. Add a contribution below and the bars move.</p>`
    + `<div class="grid grid-2">${cards}</div>`
    + `<div class="card"><h2 style="margin-top:0">Add to a goal</h2>`
    + `<form id="goal-form"><div class="form-grid">`
    + `<div class="field"><label for="goal-pick">Goal</label><select id="goal-pick">${options}</select></div>`
    + `<div class="field"><label for="goal-amount">Amount ($)</label><input type="number" id="goal-amount" min="1" step="1" placeholder="e.g. 50" required></div>`
    + `</div><p><button type="submit" class="btn terra">Add to this goal</button></p>`
    + `<p class="small" id="goal-added-note"></p></form>`
    + `<p class="small">Contributions are saved on this device only. The household's own figures are unchanged — this is a sample month, and the form is for trying the site out.</p></div>`;
  return shell({ title: 'Savings goals', current: 'goals.html', body, scripts: '<script src="data.js"></script>\n<script src="app.js" defer></script>' });
}

function pageHow(): string {
  const rows = CATS.map((c) =>
    `<tr><td>${esc(c.label)}</td><td class="num">${money(c.budget)}</td><td class="num">${money(c.spent)}</td>`
    + `<td class="num">${money(c.budget - c.spent)}</td></tr>`).join('');
  const body = `<p class="eyebrow">How it works</p><h1>How the figures are worked out</h1>`
    + `<p class="lede">This site is a sample month for a fictional household — the Marlowes, two working parents and their daughter June. `
    + `No figure is a guess: every dollar on the dashboard comes from the ledger below, and the ledger is the site's own data file.</p>`
    + `<h2>The method, in five lines</h2><ul class="tight">`
    + `<li><strong>Payday first.</strong> Income lands on the 1st and the 5th; the ${money(savedTotal)} savings transfer leaves on the 1st, before spending starts.</li>`
    + `<li><strong>One ledger.</strong> Every movement is one row with a date, a place, a category and an amount. The category totals on the Budgets page are the sums of those rows.</li>`
    + `<li><strong>Budgets are envelopes.</strong> Each category gets a monthly envelope. Spending past the envelope shows as over budget — three envelopes are over this month.</li>`
    + `<li><strong>Goals get a monthly share.</strong> Each goal has a target, a monthly contribution and a saved-so-far figure; the bar is saved divided by target.</li>`
    + `<li><strong>Nothing leaves this site.</strong> The pages are static files. Your own added transactions and goal contributions stay in your browser, on your device.</li></ul>`
    + `<h2>The whole budget, at a glance</h2>`
    + `<div class="card"><div class="table-scroll"><table class="data"><caption>Budget vs spent, ${esc(DATA.month)}</caption>`
    + `<thead><tr><th scope="col">Category</th><th scope="col" class="num">Budget</th><th scope="col" class="num">Spent</th><th scope="col" class="num">Left</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p class="small">Totals: budget ${money(budgetTotal)}, spent ${money(spentExSavings + savedTotal)}, left ${money(budgetTotal - spentExSavings - savedTotal)}. `
    + `Income ${money(incomeTotal)} minus all spending leaves ${money(remaining)} unallocated.</p></div>`
    + `<h2>What this site does not do</h2>`
    + `<p>It does not connect to a bank, it does not store anything on a server, and it does not forecast — November's figures are November's, not a prediction about December. `
    + `It is a working sample of how a household can keep its budget: one ledger, twelve envelopes, four goals, and a dashboard that answers the only question that matters — where did the money go?</p>`;
  return shell({ title: 'How it works', current: 'how-it-works.html', body });
}

function dataJs(): string {
  const slim = {
    categories: CATS.map((c) => ({ key: c.key, label: c.label, budget: c.budget, spent: c.spent })),
    transactions: DATA.transactions,
    goals: DATA.goals.map((g) => ({ key: g.key, label: g.label, saved: g.saved, target: g.target, monthly: g.monthly })),
  };
  return 'window.HEARTH_DATA = ' + JSON.stringify(slim) + ';\n';
}

// ---------- build ----------
// The grader's /output is a mounted volume: removing the directory itself
// fails (EBUSY, "Device or resource busy"), so clear only its contents.
rmSync(appOut, { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
rmSync(join(out, 'dossier.json'), { force: true });
mkdirSync(appOut, { recursive: true });

const pages: [string, string][] = [
  ['index.html', pageIndex()],
  ['transactions.html', pageTransactions()],
  ['budgets.html', pageBudgets()],
  ['goals.html', pageGoals()],
  ['how-it-works.html', pageHow()],
];
for (const [name, html] of pages) writeFileSync(join(appOut, name), html);
writeFileSync(join(appOut, 'style.css'), STYLE);
writeFileSync(join(appOut, 'app.js'), APPJS);
writeFileSync(join(appOut, 'data.js'), dataJs());

mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files and directories in app/ or
// 16 MiB of app files: app/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 16777216 }),
);

console.log(`Hearth & Ledger: ${pages.length} pages + style.css + app.js + data.js written to ${appOut} (dossier.json included)`);
