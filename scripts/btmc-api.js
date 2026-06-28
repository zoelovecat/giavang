const BTMC_API_URLS = [
  'http://api.btmc.vn/api/BTMCAPI/getpricebtmc',
  'https://api.btmc.vn/api/BTMCAPI/getpricebtmc',
];

const BTMC_SCRAPE_URLS = [
  'https://btmc.vn/Home/BGiaVang',
  'https://btmc.vn/',
];

const GIAVANG_URL = 'https://giavang.now/api/prices';

const GIAVANG_BTMC_MAP = {
  BTSJC: { name: 'Vàng miếng SJC (Bảo Tín Minh Châu)', content: '999.9' },
  BT9999NTT: { name: 'Vàng trang sức 9999 (Bảo Tín Minh Châu)', content: '999.9' },
};

const DEFAULT_KEY = '3kd8ub1llcg9t45hnoh8hmn7t5kc2v';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

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

function mapGiavangToBTMC(data) {
  const pricesObj = data.prices ?? {};
  const prices = Object.entries(GIAVANG_BTMC_MAP)
    .map(([code, meta]) => {
      const p = pricesObj[code];
      if (!p?.buy) return null;
      return {
        name: p.name || meta.name,
        karat: '24K',
        content: meta.content,
        buy: String(Math.round(p.buy / 10)),
        sell: p.sell ? String(Math.round(p.sell / 10)) : '0',
        updated: data.date && data.time ? `${data.date} ${data.time}` : '',
      };
    })
    .filter(Boolean);

  if (!prices.length) {
    throw new Error('giavang không có dữ liệu BTMC');
  }

  return {
    success: true,
    count: prices.length,
    prices,
    fetchedAt: new Date().toISOString(),
    source: 'giavang',
    note:
      'Chỉ 2 loại BTMC từ giavang.now — server GitHub không kết nối được api.btmc.vn',
  };
}

async function fetchBTMCFromGiavang() {
  const response = await fetchWithRetry(GIAVANG_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`giavang HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error('giavang API trả về lỗi');
  }

  return mapGiavangToBTMC(data);
}

async function fetchBTMC() {
  const onCi = process.env.GITHUB_ACTIONS === 'true';

  try {
    return await fetchBTMCFromAPI();
  } catch (apiErr) {
    console.warn(`[BTMC] API failed: ${apiErr.message}`);
  }

  if (!onCi) {
    try {
      console.warn('[BTMC] Trying website scrape...');
      return await fetchBTMCFromScrape();
    } catch (scrapeErr) {
      console.warn(`[BTMC] Scrape failed: ${scrapeErr.message}`);
    }
  } else {
    console.warn('[BTMC] Skip scrape on GitHub Actions');
  }

  console.warn('[BTMC] Using giavang.now (BTMC server unreachable)');
  return fetchBTMCFromGiavang();
}

module.exports = {
  parseBTMCJson,
  parseBTMCHtml,
  mapGiavangToBTMC,
  fetchBTMC,
  fetchBTMCFromAPI,
  fetchBTMCFromScrape,
  fetchBTMCFromGiavang,
  GIAVANG_URL,
  GIAVANG_BTMC_MAP,
  DEFAULT_KEY,
};
