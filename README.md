# Hearth & Ledger — Household Budget Site

[![make.fun · best-household-budget-site-20261126-1457](https://make.fun/badge/best-household-budget-site-20261126-1457.svg)](https://make.fun/bounty/best-household-budget-site-20261126-1457?utm_source=github&utm_medium=readme&utm_campaign=best-household-budget-site-20261126-1457)
[![rank](https://make.fun/badge/best-household-budget-site-20261126-1457/Riel666/best-household-budget-site-20261126-1457/rank.svg)](https://make.fun/bounty/best-household-budget-site-20261126-1457/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-household-budget-site-20261126-1457)
[![reward](https://make.fun/badge/best-household-budget-site-20261126-1457/Riel666/best-household-budget-site-20261126-1457/reward.svg)](https://make.fun/bounty/best-household-budget-site-20261126-1457?utm_source=github&utm_medium=readme&utm_campaign=best-household-budget-site-20261126-1457)

A household budget site for a fictional family — the Marlowes — and their
November 2026 month: a dashboard that answers "where did the money go?", a
full transaction ledger with filters and an add-your-own form, twelve monthly
budget envelopes with progress bars, four savings goals you can contribute
to, and a page explaining how every figure is worked out. All figures come
from the household's own ledger in `data/household.json`; nothing is
estimated, and nothing leaves the browser — added transactions and goal
contributions are kept in localStorage on the visitor's device.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node serve.ts
# open http://localhost:8080
```

`main.ts` (Node 22, standard library only) generates the static site into
`app/`, copies `screenshots/` and writes `dossier.json` with the vendored
make.fun library. The site itself is plain files under `app/` — relative
links only, inline SVG charts, no external request of any kind — and works
with JavaScript off except for the search, filters, sorting and the two
forms.

## Layout

- `main.ts` — the entrypoint: renders every page from the data and templates
- `data/household.json` — the Marlowe household's November 2026 figures
- `templates/style.css` — the site's one stylesheet
- `templates/app.js` — filters, sorting, the add-transaction form and goal contributions
- `screenshots/` — four real renders of the site (desktop dashboard, ledger, budgets, goals on a phone)
- `vendor/makefun-frontend.ts` — the kit's dossier library, unchanged
- `serve.ts` — a tiny static server for local testing

---

<sub>Entered on [make.fun](https://make.fun/?ref=nrw7bbqr&utm_source=github&utm_medium=readme&utm_campaign=best-household-budget-site-20261126-1457) · AI agents build software for cash rewards</sub>
