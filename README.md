# Family Money

A simple phone app for family income and expenses. It works offline and saves everything to a Google Sheet. It's free and there is no server to run.

- **Home follows the family.** When more is owed than the savings are worth, Home shows **Clear loans**: the debt-free date at today's pace, how much is paid, and chips with what it takes to finish sooner ("by Oct 2028: ₹9,200 a month"). Otherwise it shows **Grow savings**: what the savings are worth, this month's growth and money put in, and when the goal is reached, with the same chips. The goal is the family's (Settings → Savings goal, all investments count), else the investment goal due soonest (only that one counts); none is made up, so with no goal Home offers "Set a savings goal". On a phone, Expenses and Income sit just above the tabs; Recent shows the latest 3 (7 on a wide screen). Settings can pick the focus by hand (for a long home loan, say). Both show the savings rate (aim for 20%).
- **Left to spend:** a monthly budget for everyday spending (every category without a bill) shows what is left and about how much a day. Categories can have their own budget too; "Set a monthly budget" on Home opens all of them in one sheet (also in Settings, the gear at the top right). The Others budget is the sheet's cell B1.
- **Due soon:** bills (rent, fees, electricity, LIC) set in Settings, EMIs, SIPs and the monthly interest on loans, with one tap to pay. Only what falls in the next 7 days (or is overdue) shows on Home; Settings lists every bill. "Repeat every month" on a new expense makes it a bill.
- **Adding:** tap Expenses or Income, pick the category from the grid, type the amount. The reason is optional (recent reasons are one tap). Today, Yesterday or any date. "Add again" on Home repeats the things entered most often.
- **Your own categories:** Settings > Edit categories adds, renames or deletes one. Deleting moves its entries to Others; Others itself always stays. A new sheet starts with a household list (Salary, Business; Rent, Kirana, Milk, Bills, School, Petrol, Medical, Eating out, Others); the family sheet keeps Job, Dairy, Crops and House. The list belongs to the Google Sheet, so every phone on it gets the change, and renames follow into the sheet's rows, summary, budgets and bills.
- **Who added it:** put your name in Settings ("This phone is used by"). Entries show it, History can filter by it, and the sheet keeps it as the note on the entry's Date cell.
- **More than one sheet:** the menu under the picture or name at the top of Home lists every Google Sheet connected on this phone (for example the family and a shop). **Add a new sheet** gives it a name and its own picture, then asks for its setup link. Tap a sheet to switch, the pencil to rename it, the bin to remove it from this phone (the Google Sheet is not touched). Opening another sheet's setup link adds it the same way.
- **Phone, tablet or computer:** from tablet width up it works like a desktop app: a full-height sidebar with the sheet switcher on top and the tabs below, page titles and sync in a toolbar, and the screens use the full width (two columns from iPad landscape up).
- **History** (its own tab): every entry grouped by day with day totals, a search box (reason or amount), period, category and person filters, totals for what matches, and Share (a CSV file). Every entry can be changed or deleted, however old.
- **Money** (its own tab) holds **Loans** (money borrowed), **Given** (money given to others) and **Investments**:
  - A loan has an optional interest rate, an optional **EMI** and its day, and **★ Pay this first** (otherwise the costliest loan goes first). **Pay EMI** splits it by itself: this month's interest is an expense (category Loan interest), the rest pays the loan back. **Pay interest** (for loans without an EMI) is an expense too and doesn't lower what is owed. **Pay back** lowers it.
  - Money given has an optional interest rate; **Got interest** adds it to Income › Interest, **Got back** lowers what is still to get.
  - An investment has a type (FD, RD, savings / liquid fund, SIP, PPF, gold, LIC, chit fund, other) which sets its expected return and growth, an optional amount added each month (SIP, RD) and its day, and an optional goal and date (a Diwali fund). **Add money** and **Withdraw** change it. *Worth now* is an estimate from the expected return, not live prices. FDs, RDs and savings / liquid funds count as the safety net, goal or not.
  - **Already had it:** a loan, money given or investment from before this month gets the switch "I already had this before" (or "Borrowed / Given before this month"), so its starting amount is not counted as this month's money (Insights › Where the income went, net worth this month, Home's "put in").
  - None of these are income or expenses (interest is), so Saved stays correct.
- **Insights** by **month, year or all time** (calendar year or April–March: the months it covers are shown under it, with a link to switch): saved against the same days of the period before (in ₹); where the income went (spent, loans paid, invested, lent, left in hand); **things to notice** (rules, no AI), up to 4 going well (the savings rate streak with the actual rate, the safety net, goals on track, under budget, the biggest fall, net worth up) and up to 4 worth a look (the safety net, the costliest loan, paying more, goals behind, a low month, budgets over, the biggest rise); spending by category with budgets and changes (tap one for History); the last 6 months; the **Loan plan** (owed falling to ₹0, when each loan ends, interest still to pay) or the **Savings plan** (what it is in, the way to the goal, goals); **Money health** (savings rate, safety net in months, EMI load, net worth); **Business profit** for a category with both income and expenses (Dairy, a shop). **Share** sends the summary on WhatsApp.
- The plans use the average of the last 6 complete months. Loan interest already paid is added back and interest got is left out, since the plan counts both itself; SIPs come out of the money for loans first.
- With no internet, entries wait on the phone and sync automatically the next time the app is opened or comes back online.

## Project layout
```
src/          The app. This folder is all Vercel publishes (see vercel.json).
  index.html  Screens and styles (Pastel theme)
  app.js      Offline queue, sync, keypad, rendering
  ai.js       The assistant (optional): Gemini Live voice and chat, the orb
  shared.js   Categories, validation and all the money maths (also used by Apps Script)
  sw.js       Keeps the app working offline
  assets/     App icons, bundled font (Lexend), 3D images (Fluent Emoji)
apps-script/  Code.gs: the Google Sheet sync script
tests/        shared.test.js, sync.test.js (fast), e2e.test.js, update.test.js, ai.test.js (browser)
Makefile      Run `make` to see every command
```

## Commands
```
make test         fast tests, no installs (run before every push)
make e2e          browser tests: offline, sync, keypad, insights, updates, assistant (installs Playwright into .tools/ once)
make run          run the app at http://localhost:8000, connected to your sheet via .env
make push        push Code.gs + shared.gs to both sheets and update their web apps (same URLs)
make apps-script  copy Code.gs + shared.gs into build/apps-script/, ready to paste by hand
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

### Another sheet (a shop, a second family)
Each account is its own Google Sheet with its own sync script, web-app URL and family key. Start from a **new blank** sheet; don't copy the family one.
1. Create a new Google Sheet, for example "Shop Money".
2. Do **step 1** above on it: **Extensions → Apps Script**, paste `build/apps-script/Code.gs` and `shared.gs`, run **`setup`** (the log shows this sheet's **own family key**), then **Deploy → New deployment → Web app** for its own `/exec` URL.
3. Its link is `https://<project>.vercel.app/#setup=<new /exec URL>|<new key>`. Send it only to the people who should see this sheet.
4. In the app, tap the picture or name on Home → **Add a new sheet**, give it a name, and paste the link in the Connect card. Or just open the link: the app adds it as "Sheet 2", which you can rename with the pencil.

It starts with the household list: change it under **Edit categories**. Each sheet keeps its own key, categories, budgets and bills. **Copied a sheet anyway?** "Make a copy" brings along every entry and loan but not the web app. Before running `setup` in the copy, delete its year tabs and `Loans & Settings`, and delete `KEY` and `CATS` under **Project Settings → Script properties** so it gets its own key and the starting categories. Then make a **new** deployment.

## Day to day
- **Budgets, bills, the focus, the year:** in **Settings** (tap the picture or name on Home). The Others budget is also cell **B1** of the `Loans & Settings` tab; a change in either place reaches the other.
- **Fix or delete an entry:** tap it in **History**, or edit its row in the month table of its year tab. Phones pick up sheet changes on their next sync.
- **Loans / Given / Investments:** in **Money**, tap **Add a loan**, **Give money** or **Add an investment**, then the buttons on its card for each payment. Tap a loan to change it (EMI, ★, type, SIP, goal) or delete it; open its payments list to delete a mistake.
- **Add rows by hand:** fill in DateTime, Type (`Income` or `Expense`), Category, Amount and Note. Leave Id empty; the next sync fills it in.
- **Tap the round sync button** (top right) to sync immediately. A yellow dot means entries are waiting.
- **The assistant (optional):** get a free Gemini key at aistudio.google.com and paste it in **Settings → Assistant** on each phone that wants it (it stays on that phone). Then tap the glowing orb in the tab bar: it starts listening right away (tap the text box to type instead). Talk or type: "got my salary 30k today", "kal petrol 450 dala", "how much on kirana last month?", "am I over budget?". It never saves money by itself: it shows a card to check, change and **Save** (only your tap saves; saying "cancel" closes it). Say several at once ("chai 20, auto 80, sabzi 150") and it shows one short list with one Save. The camera button reads a photo of a bill into the same list. Its numbers come from the app, not the AI.
  - **Notes and lists:** "note down atta, paneer, milk for groceries", "remind me to bring paneer", "add eggs to the grocery list", "mark milk done", or "listen to this conversation" (tap the orb when it is over, and it writes a summary). Notes save at once and show on Home, where you can tick, copy, share or ✕ them. They sync to the sheet's **Notes** tab (one row per note, ☐ / ☑ per item, and a row typed there shows in the app); with no sheet connected they stay on the phone. A finished shopping list can become an expense in one tap.
  - It remembers the last 10 messages while the app is open, so you can carry on after closing and reopening it; they are forgotten when the app is closed. Answers show in a card sized to the question ("top 3 categories" is a small one), with the text box still below it.
  - It does not listen while it talks (on a phone speaker it would hear itself and answer again), so tap the orb to stop it talking, then speak.
  - **Settings → Assistant → Sounds** turns off the soft chimes it plays when it starts and stops listening on that phone.
  - The phone asks for the microphone each time the assistant opens (it lets go of it on close). To stop it asking: iPhone, Settings → Apps → Safari → Microphone → Allow; Android Chrome, pick "Allow while visiting the site". It needs the internet, and what you ask goes to Google (on the free tier Google may use it to improve its products). Use headphones, or it may hear itself.

## Changing the app
- **App files** (anything in `src/`): edit, run `make test`, then `git commit -am "…"` and `git push`. Vercel deploys in about 30 seconds. Phones download the new version in the background and show it **on their next open**.
- **Apps Script is not auto-deployed.** After changing `apps-script/Code.gs` or `src/shared.js`, run `make push` (see **Updating Apps Script**). The URL stays the same.
- **Key leaked?** Change `KEY` under **Project Settings → Script properties** in Apps Script and send a new setup link.

## The Google Sheet
Laid out for people to read, and it's also where the app keeps everything:
- **One tab per year** (`2026`; `2027` appears by itself with the first 2027 entry). At the top, a **summary**: one row per month with each income category, each expense category, the totals and Saved, plus a Total row. These are live formulas, and they are rewritten when a category is added, renamed or deleted in the app.
- Below it, **12 month tables side by side** (January, February, … December), each `Date | Category | Income | Expense | Reason`, as long as the month needs.
- **`Loans & Settings`**: the Others monthly budget in **B1**, then six tables side by side: **MONEY BORROWED** with live *Paid back* / *Still owed*, its **PAID BACK** payments, **MONEY GIVEN** with live *Got back* / *Still to get*, its **GOT BACK** payments, **INVESTED** (Return %, Per, *Compound* / *Simple*, live *Withdrawn* / *Still invested*) and its **WITHDRAWN** payments. A sheet from before investments gets the last two tables on its next sync.
- Each table has a hidden **Id** column the app uses to find rows. Leave it alone.
- **Who added an entry** is the note on its Date cell ("Added by Sunita"). **Money added to an investment** is a negative amount in WITHDRAWN, so *Still invested* counts it.
- **Settings** (budgets, bills, EMIs, SIPs, goals, the focus, the year) are kept by the script (Script Properties → `SET`), like the categories.
- Colours, number formats and column widths are painted by the script in the app's Pastel colours (mint income, blush expenses, lavender saved). Bumping `LOOK` in `Code.gs` repaints every tab on the next sync, so formatting added by hand may be painted over.
- **Adding by hand:** type on the first empty row of the month, with the amount under **Income** or **Expense** (not both), and a category the app knows. The app picks it up on its next sync. Repayments are easiest to add in the app.
- **Categories** are kept by the script (Script Properties → `CATS`), not in a tab: change them in the app, so the rows move with them.

## Updating Apps Script
Whenever `apps-script/Code.gs` or `src/shared.js` changes, update Apps Script **before** pushing the app: run **`make push`**. It runs the tests, then for each sheet in `.env` (family, then personal) replaces `Code` and `shared` in its Apps Script, publishes a new version on the **same** web app URL, and does one test sync. Phones need nothing.

Once, before the first `make push`:
1. Turn on **Google Apps Script API** at script.google.com/home/usersettings.
2. Run `npx @google/clasp login` and sign in with the Google account that owns the sheets.
3. Add each sheet's Script ID to `.env` (Apps Script > **Project Settings (⚙️) > IDs > Script ID**): `FAMILY_SCRIPT_ID=` for the family sheet, `PERSONAL_SCRIPT_ID=` for the personal one. Next to them `.env` needs `SHEET_DEPLOYEMENT_ID` / `PERSONAL_SHEET_DEPLOYEMENT_ID` (the part of the web app URL between `/s/` and `/exec`), the URLs and the keys.

By hand instead: run `make apps-script`, paste **both** `Code.gs` and `shared.gs` over the old ones, then **Deploy > Manage deployments > edit > Version: New version > Deploy**, in **each** sheet.

When an update changes the year summary's layout, every summary is rewritten by itself on the first sync after it.

Moving from the older layout (`Entries`, `Loans`, `Repayments`, `Settings` tabs) happens by itself on the first sync: everything moves into the year tabs and `Loans & Settings`, and the old tabs are kept, hidden, as `Old Entries`, `Old Loans` and so on. Once you've checked the new tabs, you can delete them (right-click a tab > **Show hidden sheets** to find them).

## Tests
- `tests/shared.test.js`: periods (financial year too), totals, validation, category add / rename / merge / delete, settings ops, budgets, what is due, "add again", the focus, the debt and savings plans, the notes.
- `tests/sync.test.js`: runs `Code.gs` against a fake sheet (`tests/fake-sheet.js`): the year-tab layout and summary formulas, entries moving between months and years, retries, deletes, loans and repayments, hand-typed and half-typed rows, moving from the old layout, wrong key, old phones, categories (rows renamed, summaries rewritten, Others protected), who added it (cell notes), settings and B1, money added to investments.
- `tests/e2e.test.js`: the real app in a headless browser against the real `Code.gs`: offline adds, History edits and deletes, loans, part payments and interest, then sync; insights, every entry editable, settings (budgets, a bill paid from Due soon, the financial year), money given and investments, an old script, dark mode, wrong key, editing categories, a second sheet, the wide-screen layout. `SHOTS=/some/dir make e2e` also saves screenshots.
- `tests/demo.js` (`make demo`): about two years of family entries, loans and hand-typed rows on a fake sheet, run through the real `Code.gs`. It checks that the sheet's summary and loan formulas match the app's numbers for every month, and checks the app's screens, then opens a browser window with the app and a viewer for the simulated sheet. Your real Google Sheet is never touched.
- `tests/update.test.js`: a new deploy reaches an installed app on its next open, and it still opens offline.
- `tests/ai.test.js`: the assistant against a scripted fake Gemini Live: turned on and off in Settings, a confirm card saved through the app's queue, an answer card with the app's own totals, a cancelled card saves nothing, Esc, several entries in one card, cancel by voice (no tool can save), notes (merge, ticks, Home, add as expense, ✕), listening, a bill photo, and the mic asked for once per opening and let go on close.
