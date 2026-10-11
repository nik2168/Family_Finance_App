# Family Money

A simple phone app for family income and expenses. It works offline and saves everything to a Google Sheet. It's free and there is no server to run.

- **Income:** Job, Dairy, Crops, Others. **Expenses:** House, Dairy, Crops, Others (with a monthly limit on expenses). On Home, tap **Income** or **Expenses** and pick the category.
- Every entry needs a reason and is stamped with the date and time automatically.
- **History:** open it with the clock button next to **Latest** on Home. Every entry, with a search box (reason or amount) and Year, Month and Category filters, plus totals for what matches. The 20 newest entries can be changed or deleted here; older ones are edited in the Google Sheet. Home shows the latest 3.
- **Loans** (money borrowed) and **Given** (money given to others): reason, amount, a High / Medium / Low priority (high shown first) and an optional interest rate per month or per year, plus each part paid back or got back. See what is still owed or still to get, and roughly how much interest that is each month. Both are kept apart from income and expenses.
- Insights by **week, month and year**: income, expenses, savings, profit or loss for each source, a pie chart of where income went (% per expense category and saved), the Others limit, and a Loans card.
- **Money forecast** (Insights): from the average saving of the last 3, 6 or 12 months, a line graph of the months ahead. With loans it shows when they'll all be paid off, counting their interest, paying high priority and dearer loans first. Without loans it shows how much you'd have saved in 6 months, 1 year and 2 years.
- With no internet, entries wait on the phone and sync automatically the next time the app is opened or comes back online.

## Project layout
```
src/          The app. This folder is all Vercel publishes (see vercel.json).
  index.html  Screens and styles (Pastel theme)
  app.js      Offline queue, sync, keypad, rendering
  shared.js   Categories, validation and all the money maths (also used by Apps Script)
  sw.js       Keeps the app working offline
  assets/     App icons, bundled font (Lexend), 3D images (Fluent Emoji)
apps-script/  Code.gs: the Google Sheet sync script
tests/        shared.test.js, sync.test.js (fast), e2e.test.js, update.test.js (browser)
Makefile      Run `make` to see every command
```

## Commands
```
make test         fast tests, no installs (run before every push)
make e2e          browser tests: offline, sync, keypad, insights, updates (installs Playwright into .tools/ once)
make run          run the app at http://localhost:8000, connected to your sheet via .env
make apps-script  copy Code.gs + shared.gs into build/apps-script/, ready to paste
make clean        remove build/ and .tools/
```
`make run` reads `SHEET_WEB_APP_URL` (the Apps Script `/exec` address) and `FAMILY_KEY` from `.env` and opens the app with the same setup link a phone gets, so local testing uses your real sheet. Delete any test rows from the sheet afterwards. `.env` is git-ignored and the key is never printed.

## One-time setup (about 15 minutes)

### 1. Google Sheet + sync script
1. Create a new Google Sheet in the family Google account (for example "Family Money").
2. Open **Extensions → Apps Script**.
3. Run `make apps-script`. Replace the contents of `Code.gs` with `build/apps-script/Code.gs`.
4. Click **+ → Script**, name it `shared`, and paste in `build/apps-script/shared.gs`.
5. Open **Code.gs** (the function picker only lists functions from the open file), choose **`setup`** in the picker next to Debug, and click **Run**.
   - Allow access: **Review permissions → your account → Advanced → Go to … (unsafe) → Allow**. This is normal for your own script.
   - This creates the `Loans & Settings` tab. Year tabs appear with the first entry.
   - The **Execution log** shows `Family key: …`. Copy that key. It's also kept under **Project Settings (⚙️) → Script Properties → KEY**.
6. Click **Deploy → New deployment**. Type: **Web app**, Execute as: **Me**, Who has access: **Anyone**. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

### 2. Put the app online (GitHub + Vercel, free, auto-deploys)
**Push to your personal GitHub.** Run these in this folder. The `config` lines apply to this repo only, so your office identity isn't used.
```
cd ~/Documents/finance_app/finance_app
git init -b main
git config user.name  "Your Name"
git config user.email "you@personal-email.com"
git add .
git status        # .env must NOT be listed (it's in .gitignore)
git commit -m "Family Money app"
```
Create an empty **private** repository on github.com with your personal account, for example `family-money`. Then:
```
git remote add origin https://github.com/<personal-username>/family-money.git
git push -u origin main
```
If git signs in with the office account, use the personal account's HTTPS URL plus a personal access token, or an SSH key for the personal account.

**Connect Vercel (once).** On vercel.com, sign in with your personal GitHub account and go to **Add New → Project**. Import `family-money`. Set Framework Preset to **Other** and leave the build settings empty: `vercel.json` already tells Vercel to publish only `src/`. Click **Deploy**. The app is live at `https://<project>.vercel.app`.

### 3. Make the setup link and send it on WhatsApp
```
https://<project>.vercel.app/#setup=<Web app URL>|<Family key>
```
Anyone with this link can see and add entries, so share it only with family.

### 4. Install on each phone
- **Android:** open the link in **Chrome**, then **⋮ → Add to Home screen / Install app**.
- **iPhone:** open the link in **Safari**, then **Share → Add to Home Screen**. Open the app **from the new icon**. If it shows "Setup", paste the same link once. (iPhone keeps home-screen apps separate from Safari.)

Always open the app from the home-screen icon, not a browser tab. That keeps entries saved on the phone even when it's not used for a while.

## Day to day
- **Change the Others limit:** edit cell **B1** of the `Loans & Settings` tab.
- **Fix or delete an entry:** tap it in **History** (last 20), or edit its row in the month table of its year tab for older ones. Phones pick up sheet changes on their next sync.
- **Loans / Given:** tap **Add a loan** or **Give money**, then **Pay back** or **Got back** for each payment. Tap a loan to change or delete it; open its payments list to delete a mistake.
- **Add rows by hand:** fill in DateTime, Type (`Income` or `Expense`), Category, Amount and Note. Leave Id empty; the next sync fills it in.
- **Tap the round sync button** (top right) to sync immediately. A yellow dot means entries are waiting.

## Changing the app
- **App files** (anything in `src/`): edit, run `make test`, then `git commit -am "…"` and `git push`. Vercel deploys in about 30 seconds. Phones download the new version in the background and show it **on their next open**.
- **Apps Script is not auto-deployed.** After changing `apps-script/Code.gs` or `src/shared.js`, run `make apps-script`, paste both files into Apps Script, then go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.
- **Key leaked?** Change `KEY` under **Project Settings → Script properties** in Apps Script and send a new setup link.

## The Google Sheet
Laid out for people to read, and it's also where the app keeps everything:
- **One tab per year** (`2026`; `2027` appears by itself with the first 2027 entry). At the top, a **summary**: one row per month with Job, Dairy, Crops and Others income, House, Dairy, Crops and Others expenses, the totals and Saved, plus a Total row. These are live formulas.
- Below it, **12 month tables side by side** (January, February, … December), each `Date | Category | Income | Expense | Reason`, as long as the month needs.
- **`Loans & Settings`**: the Others monthly limit in **B1**, then four tables side by side: **MONEY BORROWED** with live *Paid back* / *Still owed*, its **PAID BACK** payments, **MONEY GIVEN** with live *Got back* / *Still to get*, and its **GOT BACK** payments.
- Each table has a hidden **Id** column the app uses to find rows. Leave it alone.
- **Adding by hand:** type on the first empty row of the month, with the amount under **Income** or **Expense** (not both). The app picks it up on its next sync. Repayments are easiest to add in the app.

## Updating Apps Script
Whenever `apps-script/Code.gs` or `src/shared.js` changes, update Apps Script **before** pushing the app: run `make apps-script`, paste **both** `Code.gs` and `shared.gs` over the old ones, then **Deploy > Manage deployments > edit > Version: New version > Deploy**. The URL stays the same, so phones need nothing.

Moving from the older layout (`Entries`, `Loans`, `Repayments`, `Settings` tabs) happens by itself on the first sync: everything moves into the year tabs and `Loans & Settings`, and the old tabs are kept, hidden, as `Old Entries`, `Old Loans` and so on. Once you've checked the new tabs, you can delete them (right-click a tab > **Show hidden sheets** to find them).

## Tests
- `tests/shared.test.js`: week, month and year periods, totals, profit per source, the Others limit, validation.
- `tests/sync.test.js`: runs `Code.gs` against a fake sheet (`tests/fake-sheet.js`): the year-tab layout and summary formulas, entries moving between months and years, retries, deletes, loans and repayments, hand-typed and half-typed rows, moving from the old layout, wrong key, old phones.
- `tests/e2e.test.js`: the real app in a headless browser against the real `Code.gs`: offline adds, History edits and deletes, loans and part payments, then sync; insights, the 20-entry limit, dark mode, wrong key. `SHOTS=/some/dir make e2e` also saves screenshots.
- `tests/demo.js` (`make demo`): about two years of family entries, loans and hand-typed rows on a fake sheet, run through the real `Code.gs`. It checks that the sheet's summary and loan formulas match the app's numbers for every month, and checks the app's screens, then opens a browser window with the app and a viewer for the simulated sheet. Your real Google Sheet is never touched.
- `tests/update.test.js`: a new deploy reaches an installed app on its next open, and it still opens offline.
