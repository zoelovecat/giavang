const BTMC_URL = 'http://api.btmc.vn/api/BTMCAPI/getpricebtmc';
const DEFAULT_KEY = '3kd8ub1llcg9t45hnoh8hmn7t5kc2v';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const key = process.env.BTMC_API_KEY || DEFAULT_KEY;

  try {
    const response = await fetch(`${BTMC_URL}?key=${encodeURIComponent(key)}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'BTMC API error', status: response.status }),
      };
    }

    const raw = await response.json();
    const items = raw?.DataList?.Data ?? [];
    const prices = items
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: prices.length,
        prices,
        fetchedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: 'Không thể kết nối BTMC API',
        message: err.message,
      }),
    };
  }
};
