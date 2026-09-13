# New Bot HQ

Animated neon office for Jack's paper-research bot — little runners walk the floor, original critter mascots hop beside them, and a roster below tracks each station from `status.json`.

## Live URL

After GitHub Pages is enabled:

`https://dinguspingus84acl.github.io/new-bot-hq/`

## Custom domain

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch** → `main` / `/ (root)`
3. Custom domain: enter your domain (e.g. `hq.example.com`)
4. At your DNS provider, add:
   - **Apex:** A records to GitHub Pages IPs, or
   - **Subdomain:** CNAME → `dinguspingus84acl.github.io`
5. Wait for DNS, then enable **Enforce HTTPS**

Optional: commit a `CNAME` file containing only your domain name.

## Updating desks

The bot updates `status.json` when work progresses. Refresh the page (it auto-polls every 3s).

PAPER RESEARCH ONLY — no trading.
