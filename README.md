# Portfolio Lab

Global institutional-intelligence dashboard built from public regulatory disclosures.

## What is live now

- **United States:** automated Form 13F ingestion from **SEC EDGAR**.
- **China A / Hong Kong:** curated real source links are present in the app; automated collectors are deliberately not enabled until each source is implemented and validated.
- No synthetic holdings are used.

## Data pipeline

`GitHub Actions → SEC submissions API → EDGAR filing archive → INFORMATION TABLE XML → normalized JSON → GitHub Pages`

The scheduled workflow runs twice per day and keeps the latest four disclosed periods per tracked US manager. Historical period snapshots are stored under `data/history/`.

### Important 13F caveats

Form 13F is delayed regulatory disclosure, not a live portfolio feed. The app stores filing dates separately from report dates so historical analysis can avoid look-ahead bias.

13F information tables identify securities by **CUSIP**, not by exchange ticker. Portfolio Lab therefore preserves the SEC-filed CUSIP as the authoritative security identifier. A separate CUSIP→ticker enrichment layer can be added later without changing the raw disclosure record.

## GitHub Pages

If the Pages deployment workflow says Pages is not enabled, open:

**Repository → Settings → Pages → Build and deployment → Source → GitHub Actions**

Then rerun **Deploy Portfolio Lab to GitHub Pages** from the Actions tab.

## Manual data refresh

Open **Actions → Sync SEC 13F data → Run workflow**.

The scheduled job also runs automatically twice per day.

## Sources

- SEC submissions API: `https://data.sec.gov/submissions/CIK##########.json`
- SEC filing archive: `https://www.sec.gov/Archives/edgar/data/...`

Public institutional data is stored in the repository. Personal portfolio parameters remain in the browser's local storage.
