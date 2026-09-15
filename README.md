# New Bot HQ

Dark cyber-noir command center for Jack's paper-research bot. Specialist agents stay at their desks with original critter mascots. Live assignments, handoffs, approvals, and blockers come from `status.json`.

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

The bot updates `status.json` when work progresses. The floor auto-polls every 3s and only animates when a task is assigned, handed off, blocked, approved, completed, or failed.

PAPER RESEARCH ONLY — no trading.
