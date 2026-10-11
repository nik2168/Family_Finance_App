# Family Money. Run `make` to list the commands.
PORT       ?= 8000
PLAYWRIGHT := 1.48.2
CLASP      := $(TOOLS)/clasp/node_modules/.bin/clasp
TOOLS      := .tools
E2E_ENV    := NODE_PATH=$(TOOLS)/node_modules PLAYWRIGHT_BROWSERS_PATH=$(TOOLS)/browsers

.PHONY: help test check e2e demo run apps-script push clean

help: ## Show this list
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  make %-12s %s\n", $$1, $$2}'

test: check ## Fast tests: money maths, periods, validation, Apps Script sync (no installs)
	node tests/shared.test.js
	node tests/sync.test.js

check: ## Syntax-check the JavaScript (the sync test compiles Code.gs)
	@for f in src/*.js tests/*.js; do node --check "$$f" || exit 1; done

e2e: $(TOOLS)/node_modules/playwright ## Browser tests: offline, sync, keypad, insights, updates (installs Playwright once)
	$(E2E_ENV) node tests/e2e.test.js
	$(E2E_ENV) node tests/update.test.js

demo: $(TOOLS)/node_modules/playwright ## Simulate ~2 years of use on a fake sheet, check it, then open a window to look around (NO_WINDOW=1: checks only)
	$(E2E_ENV) node tests/demo.js

$(TOOLS)/node_modules/playwright:
	npm install --prefix $(TOOLS) --no-save --no-package-lock playwright@$(PLAYWRIGHT)
	PLAYWRIGHT_BROWSERS_PATH=$(TOOLS)/browsers $(TOOLS)/node_modules/.bin/playwright install chromium

run: ## Run the app at http://localhost:8000, connected to the sheet in .env
	@if lsof -nP -iTCP:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(PORT) is already in use (an earlier 'make run' still open?). Stop it, or try: make run PORT=8001"; exit 1; fi
	@# Opens the app with the same #setup link a phone gets, built from .env. The key is never printed.
	@url="http://localhost:$(PORT)"; \
	if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	if [ -n "$$SHEET_WEB_APP_URL" ] && [ -n "$$FAMILY_KEY" ]; then \
		open_url="$$url/#setup=$$SHEET_WEB_APP_URL|$$FAMILY_KEY"; \
		echo "Family Money is running at $$url, connected to the sheet in .env  (press Ctrl+C to stop)"; \
	else \
		open_url="$$url"; \
		echo "Family Money is running at $$url  (press Ctrl+C to stop)"; \
		echo "Add SHEET_WEB_APP_URL and FAMILY_KEY to .env to connect to your sheet."; \
	fi; \
	(sleep 1; open "$$open_url" 2>/dev/null || xdg-open "$$open_url" 2>/dev/null) & \
	python3 -m http.server $(PORT) -d src >/dev/null

apps-script: ## Put Code.gs + shared.gs in build/apps-script, ready to paste into Apps Script
	@mkdir -p build/apps-script
	cp apps-script/Code.gs build/apps-script/Code.gs
	cp src/shared.js build/apps-script/shared.gs
	@echo "Paste both files from build/apps-script/ into Extensions > Apps Script,"
	@echo "then Deploy > Manage deployments > edit > New version."

# Each sheet in .env: <NAME>_SCRIPT_ID, <NAME>_DEPLOYEMENT_ID, <NAME>_WEB_APP_URL and its key. The key is never printed.
# clasp pull brings the live appsscript.json, so the web app's access settings ship unchanged (without them phones are cut off).
push: test $(CLASP) ## Push Code.gs + shared.gs to both Google Sheets and update their web apps (same URLs). Once: npx @google/clasp login
	@test -f .env || { echo "No .env"; exit 1; }; set -a; . ./.env; set +a; \
	for s in SHEET:FAMILY_KEY PERSONAL_SHEET:PERSONAL_KEY; do \
		name=$${s%%:*}; id=$$(printenv $${name}_SCRIPT_ID); dep=$$(printenv $${name}_DEPLOYEMENT_ID); \
		url=$$(printenv $${name}_WEB_APP_URL); key=$$(printenv $${s##*:}); dir=build/clasp/$$name; \
		if [ -z "$$id" ] || [ -z "$$dep" ] || [ -z "$$url" ] || [ -z "$$key" ]; then \
			echo "$$name: .env needs $${name}_SCRIPT_ID (Apps Script > Project Settings > IDs), $${name}_DEPLOYEMENT_ID, $${name}_WEB_APP_URL and $${s##*:}"; exit 1; fi; \
		rm -rf $$dir && mkdir -p $$dir && printf '{"scriptId":"%s"}\n' "$$id" > $$dir/.clasp.json; \
		(cd $$dir && $(CURDIR)/$(CLASP) pull >/dev/null) || exit 1; \
		grep -q '"ANYONE_ANONYMOUS"' $$dir/appsscript.json || { echo "$$name: its appsscript.json has no public web app settings, not pushing"; exit 1; }; \
		rm -f $$dir/*.js $$dir/*.gs && cp apps-script/Code.gs $$dir/Code.js && cp src/shared.js $$dir/shared.js; \
		(cd $$dir && $(CURDIR)/$(CLASP) push --force && $(CURDIR)/$(CLASP) deploy -i "$$dep" -d "make push") || exit 1; \
		printf '{"key":"%s","ops":[]}' "$$key" | curl -sfL -H 'Content-Type: text/plain;charset=utf-8' --data-binary @- "$$url" | grep -q '"rows"' \
			&& echo "$$name: pushed, deployed and synced" || { echo "$$name: deployed, but its test sync failed"; exit 1; }; \
	done

$(CLASP):
	npm install --prefix $(TOOLS)/clasp --no-save --no-package-lock @google/clasp@3.4.1  # own folder: a --no-save install prunes the other

clean: ## Remove build output and the installed test tools
	rm -rf build $(TOOLS)
