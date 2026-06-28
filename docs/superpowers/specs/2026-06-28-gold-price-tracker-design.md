# Gold Price Tracker for BTMC — Design Spec

**Date:** 2026-06-28  
**Audience:** Personal tool for family (mobile-first, elderly-friendly)  
**Stack:** HTML, Tailwind CSS, vanilla JavaScript, Netlify Functions

## Goal

A Vietnamese gold price page that helps track **Bảo Tín Minh Châu (BTMC)** domestic prices and **world gold (XAU/USD)** market trends — without charts, using plain text comparisons.

## Architecture (Hybrid A + C)

| Feature | Source | Method |
|---------|--------|--------|
| BTMC current prices (all types) | **A** — BTMC official API | Netlify Function proxy |
| Week / month / year comparison | **C** — giavang.now `XAUUSD` | Direct browser fetch (CORS) |
| Gold value calculator | **C** — giavang.now `XAUUSD` | Direct browser fetch + disclaimer |

```
Browser (HTML/JS)
  ├─► /.netlify/functions/btmc  ──► api.btmc.vn (BTMC JSON API)
  └─► giavang.now/api/prices    ──► World gold + history
```

## BTMC API

- **Endpoint:** `http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key={KEY}`
- **Key:** Public key from BTMC documentation (stored in Netlify env `BTMC_API_KEY`)
- **Response:** JSON `DataList.Data[]` with `@n_{row}`, `@pb_{row}`, `@ps_{row}`, `@d_{row}` fields
- **Prices:** VND per chỉ (full đồng)

## giavang.now API

- **Current:** `GET https://giavang.now/api/prices?type=XAUUSD`
- **History:** `GET https://giavang.now/api/prices?type=XAUUSD&days=365`
- **Free, no API key, CORS enabled**
- **Unit:** USD per troy ounce
- **History limit:** ~218 days available in practice; show "Chưa đủ dữ liệu" when missing

## UI Sections

1. **Header** — Title, last updated timestamp, refresh button
2. **World gold comparison** — Current XAU/USD vs 1 week / 1 month / 1 year ago (text + arrows, no charts)
3. **BTMC price table** — All gold types: name, buy, sell (triệu đ/lượng)
4. **Calculator** — Input chỉ → USD estimate from world gold
5. **Disclaimer** — Prominent warning: calculator uses world gold, NOT Vietnam/BTMC prices

## Formatting Rules

- BTMC display: convert per-chỉ → per-lượng (`× 10`), show as `145,5 tr đ/lượng`
- World gold: `$4,090.60 / oz`
- Comparison: `+$45 (+1,1%)` with green/red color
- Font: 16–18px base, high contrast, mobile-first

## Calculator

```
USD = (số_chỉ ÷ 8,294) × giá_XAUUSD
```

Where 8,294 ≈ troy oz → chỉ conversion (31.1034768g ÷ 3.75g).

**Disclaimer (always visible):**

> ⚠️ Đây là giá **vàng thế giới (XAU/USD)**, không phải giá mua/bán tại Việt Nam hay BTMC. Chỉ mang tính **tham khảo**.

## Deployment (GitHub Pages)

- **Host:** GitHub Pages (free, deploy from GitHub repo)
- **BTMC data:** GitHub Actions workflow `.github/workflows/update-btmc.yml` fetches BTMC API every 2 hours and commits `data/btmc.json`
- **Frontend:** Reads static `data/btmc.json` — no serverless proxy needed
- **Env (optional):** `BTMC_API_KEY` in GitHub repo Secrets
- **Local dev:** `npx serve .` then open `http://localhost:3000` (do NOT open `file://` directly)

### Why not open HTML directly?

Opening `index.html` via `file://` makes `fetch('data/btmc.json')` fail or return wrong content. On GitHub Pages the same fetch works correctly over HTTPS.

### Legacy: Netlify

`netlify/functions/btmc.js` is kept as optional alternative but not required for GitHub Pages deploy.

## Error Handling

- BTMC fetch fail → error banner + retry button
- giavang fail → hide comparison/calculator, show message
- Missing sell price → display "Liên hệ"
- Auto-refresh every 5 minutes

## Out of Scope

- Charts / biểu đồ
- User accounts
- Push notifications
- VND conversion in calculator (avoid misleading estimates)
