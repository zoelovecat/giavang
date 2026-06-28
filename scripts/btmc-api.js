const BTMC_API_URLS = [
  'http://api.btmc.vn/api/BTMCAPI/getpricebtmc',
  'https://api.btmc.vn/api/BTMCAPI/getpricebtmc',
];

const BTMC_SCRAPE_URLS = [
  'https://btmc.vn/Home/BGiaVang',
  'https://btmc.vn/',
];

const DEFAULT_KEY = '3kd8ub1llcg9t45hnoh8hmn7t5kc2v';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBTMCJson(raw) {
  const items = raw?.DataList?.Data ?? [];
  return items
    .map((item) => {
      const row = item['@row'];
      if (!row) return null;
      return {
        name: item[`@n_${row}`] ?? '',
        karat: item[`@k_${row}`] ?? '',
        content: item[`@h_${row}`] ?? '',
        buy: item[`@pb_${row}`] ?? '',
        sell: item[`@ps_${row}`] ?? '',
        worldPrice: item[`@pt_${row}`] ?? '',
        updated: item[`@d_${row}`] ?? '',
      };
    })
    .filter((item) => item && item.name);
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parsePriceCell(text) {
  const cleaned = text.replace(/[^\d]/g, '');
  if (!cleaned) return '0';
  // Website hiển thị đơn vị nghìn đ (×1.000 VNĐ) → chuyển sang đ/chỉ
  return String(Number(cleaned) * 1000);
}

function parseBTMCHtml(html) {
  const prices = [];
  const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  rowMatches.forEach((row) => {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1]),
    );

    if (cells.length < 4) return;

    const name = cells[0];
    if (!name || /thương phẩm|brand|loại vàng|mua vào|bán ra/i.test(name)) return;
    if (!/\d/.test(cells[cells.length - 1]) && !/liên hệ/i.test(cells[cells.length - 1])) {
      return;
    }

    const buyText = cells[cells.length - 2];
    const sellText = cells[cells.length - 1];
    const content = cells.length >= 5 ? cells[2] : cells[1];
    const typeCol = cells.length >= 5 ? cells[1] : '';

    prices.push({
      name: typeCol ? `${name} (${typeCol})` : name,
      karat: '24K',
      content: content || '',
      buy: parsePriceCell(buyText),
      sell: /liên hệ/i.test(sellText) ? '0' : parsePriceCell(sellText),
      updated: '',
    });
  });

  if (!prices.length) {
    throw new Error('Không parse được bảng giá từ HTML BTMC');
  }
  return prices;
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...BROWSER_HEADERS, ...options.headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
      }
    }
  }
  throw lastError;
}

async function fetchBTMCFromAPI(key = process.env.BTMC_API_KEY || DEFAULT_KEY) {
  let lastError;

  for (const baseUrl of BTMC_API_URLS) {
    try {
      const response = await fetchWithRetry(
        `${baseUrl}?key=${encodeURIComponent(key)}`,
        { headers: { Accept: 'application/json' } },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${baseUrl}`);
      }

      const raw = await response.json();
      const prices = parseBTMCJson(raw);
      if (!prices.length) {
        throw new Error('API trả về rỗng');
      }

      return {
        success: true,
        count: prices.length,
        prices,
        fetchedAt: new Date().toISOString(),
        source: 'btmc-api',
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('BTMC API failed');
}

async function fetchBTMCFromScrape() {
  let lastError;

  for (const url of BTMC_SCRAPE_URLS) {
    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: 'text/html' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      const html = await response.text();
      const prices = parseBTMCHtml(html);

      return {
        success: true,
        count: prices.length,
        prices,
        fetchedAt: new Date().toISOString(),
        source: 'btmc-scrape',
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('BTMC scrape failed');
}

async function fetchBTMC() {
  try {
    return await fetchBTMCFromAPI();
  } catch (apiErr) {
    console.warn(`[BTMC] API failed: ${apiErr.message}`);
  }

  console.warn('[BTMC] Trying website scrape fallback...');
  return fetchBTMCFromScrape();
}

module.exports = {
  parseBTMCJson,
  parseBTMCHtml,
  fetchBTMC,
  fetchBTMCFromAPI,
  fetchBTMCFromScrape,
  DEFAULT_KEY,
};
