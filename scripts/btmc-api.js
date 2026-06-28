const BTMC_URL = 'http://api.btmc.vn/api/BTMCAPI/getpricebtmc';
const DEFAULT_KEY = '3kd8ub1llcg9t45hnoh8hmn7t5kc2v';

function parseBTMC(raw) {
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

async function fetchBTMCFromAPI(key = process.env.BTMC_API_KEY || DEFAULT_KEY) {
  const response = await fetch(`${BTMC_URL}?key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`BTMC API error: ${response.status}`);
  }

  const raw = await response.json();
  const prices = parseBTMC(raw);
  return {
    success: true,
    count: prices.length,
    prices,
    fetchedAt: new Date().toISOString(),
    source: 'btmc-api',
  };
}

module.exports = { parseBTMC, fetchBTMCFromAPI, BTMC_URL, DEFAULT_KEY };
