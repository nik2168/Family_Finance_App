# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Family Money: an offline-first PWA for family income/expenses that stores everything in a Google Sheet via an Apps Script web app. No build step, no npm package, no framework. Plain ES5-style browser JS (`var`, `function`), because `src/shared.js` must also run inside Apps Script.

## Commands
- `make test`: syntax check (`node --check`) plus fast tests (`tests/shared.test.js`, `tests/sync.test.js`). No installs. Run before every push.
- Single test file: `node tests/shared.test.js` or `node tests/sync.test.js`. Tests are plain `assert` scripts with no runner. The first failing assert stops the file.
- `make e2e`: Playwright browser tests (`tests/e2e.test.js`, `tests/update.test.js`). Installs Playwright into `.tools/` once. `SHOTS=/dir make e2e` saves screenshots.
  - To run one directly: `NODE_PATH=.tools/node_modules PLAYWRIGHT_BROWSERS_PATH=.tools/browsers node tests/e2e.test.js`
- `make demo`: simulates about 2 years of use on a fake sheet and checks that the sheet formulas match the app's numbers. `NO_WINDOW=1` runs the checks only.
- `make run`: serves `src/` on :8000 with `python3 -m http.server` and opens it with the `#setup=<url>|<key>` link built from `.env`. **This writes to the real sheet.**
- `make push`: runs the tests, then uses clasp to push `Code.gs` + `shared.js` to both sheets in `.env` (family and personal), redeploys them on the same URLs and does a test sync. Only run it when asked; it deploys to production.
- `make apps-script`: copies the files to `build/apps-script/` for manual pasting.

## Architecture
- **`src/shared.js`** holds pure functions only: validation, categories, periods, totals, loans/investment maths, settings ops, `applyOps`. It is loaded by the browser (`<script>`), by Node tests (`module.exports` guarded by `typeof module`), and by Apps Script as `shared.gs`. Keep it free of DOM, Node and Apps Script APIs. When you add an export the tests need, add it to the `module.exports` list at the bottom.
- **`src/app.js`** is all UI and sync. Every change is queued in localStorage as an op `{opId, kind: entry|loan|repay|cat|set, action: add|update|delete, id, data}`. The UI shows `applyOps(lastSnapshot, queuedOps)`. `trySync` POSTs `{key, ops}` as `text/plain` (this avoids a CORS preflight that Apps Script can't answer). It drops ops listed in `done`/`rejected` and stores the full snapshot from the reply. Multiple sheets per phone: each sheet's localStorage keys use the prefix `fm.` (the first sheet) or `fm.<id>.`.
- **`src/ai.js`** is the optional assistant, shown once a Gemini key is saved in Settings (`fm.gemini`, per phone, never synced). It is one IIFE, so nothing clashes with app.js globals, and every id and class it uses starts with `ai`. It talks to Gemini Live over a WebSocket. Read tools run shared.js maths on `view()`. Money write tools never save on their own: they open a card, and only the user's Save tap (the `cancel` tool can only close it) runs the same checks plus `queue()`/`setOp()` as `saveSheet`. Notes (`save_note`) save at once as `kind: 'note'` ops (`validateNote`), synced to the sheet's Notes tab like entries; app.js renders them on Home (`notesHtml`) and its document handlers serve the same markup inside the assistant. `held()` keeps note ops on the phone until a reply has carried `notes` (an older script would refuse them). `listen` opens a second Live session with server turn-taking off (`connect('listen')`). Each new talk session gets the last 10 messages in its system prompt (`past`, in memory only, so they go when the app closes), with how each card ended (`App:` lines). Half-duplex: while its voice plays the mic sends silence (`talking()`), so echo can't make it answer itself; the orb tap cuts the voice off. Tool calls left from a hung-up session are dropped (`runTools` checks `ws`). Read cards show only the parts the model asks for (`show`/`top`). Sounds are synthesized chimes (`SOUNDS`), no audio files. `tests/ai.test.js` fakes the WebSocket.
- **`apps-script/Code.gs`** is the server. `doPost` checks the key, takes a script lock, runs `loadAll` (reads the whole sheet), applies up to 500 ops in memory (`applyOp`, validated by `shared.js`), then `writeDirty` rewrites only the tables that changed. It replies with the full snapshot. The sheet is laid out for humans: one tab per year (a summary of live formulas, then 12 month tables side by side) and a `Loans & Settings` tab with 6 tables (borrowed/given/invested plus their payments). Column positions are constants at the top of the file. Categories (`CATS`), settings (`SET`) and the key (`KEY`) are Script Properties, not cells. The exception is the Others budget, which is cell B1.
- **Backward compatibility matters.** Phones and the script update independently. The script still accepts old `{pending: [...]}` bodies and migrates the old-layout tabs. The app holds back ops an old script would reject (`needsNew`) and shows "old script". Preserve both directions.
- **Version bumps:** `CACHE` in `src/sw.js` must change when app files change, or phones keep the old bundle. Add any new asset to `FILES` there. In `Code.gs`, bump `LOOK` to repaint formatting and `SUMMARY` when the summary layout changes.
- **Deploys:** pushing to `main` deploys `src/` on Vercel (`vercel.json`). Apps Script is **not** auto-deployed. Any change to `Code.gs` or `shared.js` needs `make push`, and should go out before the app change that depends on it.

## Tests
- `tests/fake-sheet.js` is an in-memory SpreadsheetApp/PropertiesService/LockService fake. It loads the real `Code.gs` + `shared.js` into a `vm` context. `sync.test.js`, `e2e.test.js` and `demo.js` all use it. When `Code.gs` starts calling a new Apps Script API, add it to the fake.
- `shared.test.js` sets `TZ=Asia/Kolkata`. Dates in tests are IST.

## Conventions
- Currency is ₹ and users are Indian families. UI copy is plain, short English (see the README's tone).
- `ponytail:` comments mark deliberate shortcuts and name their limit.
- `.env` holds sheet keys and URLs and is git-ignored. Never print the keys. Note the existing misspelling `*_DEPLOYEMENT_ID`, which the Makefile relies on.
- `../old_import/` (outside the repo) has one-off Python scripts that post to the sheet through the same `doPost`. Run them with `python3 -I`.
