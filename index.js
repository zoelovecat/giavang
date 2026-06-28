const GIAVANG_API = 'https://giavang.now/api/prices';
const CHI_PER_TROY_OZ = 31.1034768 / 3.75;
const REFRESH_MS = 5 * 60 * 1000;
const BTMC_TIMEOUT_MS = 10_000;

const GIAVANG_BTMC_MAP = {
  BTSJC: { name: 'Vàng miếng SJC (Bảo Tín Minh Châu)', content: '999.9' },
  BT9999NTT: { name: 'Vàng trang sức 9999 (Bảo Tín Minh Châu)', content: '999.9' },
};

function getBTMCUrl() {
  const isLocal =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return isLocal ? '/api/btmc' : 'data/btmc.json';
}

const COMPARISON_PERIODS = [
  { label: '1 tuần trước', days: 7 },
  { label: '1 tháng trước', days: 30 },
  { label: '1 năm trước', days: 365 },
];

let worldGoldPrice = null;

const $ = (id) => document.getElementById(id);

function formatLuong(perChiVnd) {
  const num = Number(perChiVnd);
  if (!num || Number.isNaN(num)) return 'Liên hệ';
  const perLuong = num * 10;
  const trieu = perLuong / 1_000_000;
  return `${trieu.toFixed(1).replace('.', ',')} tr`;
}

function formatUsd(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUsdDelta(delta, pct) {
  const sign = delta >= 0 ? '+' : '−';
  const pctSign = pct >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(delta).toFixed(2)} (${pctSign}${Math.abs(pct).toFixed(1)}%)`;
}

function setUpdatedLabel() {
  const now = new Date();
  $('last-updated').textContent =
    `Cập nhật: ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

async function fetchBTMCStatic() {
  const url = getBTMCUrl();
  const response = await fetch(url, {
    cache: 'no-cache',
    signal: AbortSignal.timeout(BTMC_TIMEOUT_MS),
  });
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Không đọc được data/btmc.json');
  }

  if (!response.ok || !data.success || !data.prices?.length) {
    throw new Error(data.error || 'File BTMC trống hoặc lỗi');
  }
  return data;
}

async function fetchBTMCFromGiavangLive() {
  const response = await fetch(GIAVANG_API);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error('Không tải được giá BTMC từ giavang.now');
  }

  const prices = Object.entries(GIAVANG_BTMC_MAP)
    .map(([code, meta]) => {
      const p = data.prices?.[code];
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

  if (!prices.length) throw new Error('giavang.now không có dữ liệu BTMC');

  return {
    success: true,
    count: prices.length,
    prices,
    source: 'giavang-live',
    note: '2 loại BTMC từ giavang.now — api.btmc.vn không khả dụng',
  };
}

async function fetchBTMC() {
  try {
    return await fetchBTMCStatic();
  } catch {
    return fetchBTMCFromGiavangLive();
  }
}

function showSectionError(errorEl, loadingEl, contentEl, message) {
  loadingEl.classList.add('hidden');
  contentEl.classList.add('hidden');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideSectionError(errorEl) {
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
}

function renderBTMCTable(prices, meta = {}) {
  hideSectionError($('btmc-error'));
  const container = $('btmc-table');
  container.innerHTML = '';

  if (meta.source === 'giavang' || meta.source === 'giavang-live') {
    const note = document.createElement('p');
    note.className =
      'text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2';
    note.textContent =
      meta.note ||
      'Chỉ hiển thị 2 loại BTMC (SJC, trang sức 9999) từ giavang.now — API BTMC chính thức chưa kết nối được.';
    container.appendChild(note);
  }

  prices.forEach((item) => {
    const sellDisplay =
      item.sell && item.sell !== '0' ? formatLuong(item.sell) : 'Liên hệ';

    const card = document.createElement('div');
    card.className = 'border border-gray-100 rounded-xl p-4 space-y-2';
    card.innerHTML = `
      <p class="font-semibold text-base leading-snug">${item.name}</p>
      <p class="text-sm text-gray-500">${item.karat} · ${item.content}</p>
      <div class="flex justify-between text-base">
        <span class="text-gray-600">Mua vào</span>
        <span class="font-bold text-green-700">${formatLuong(item.buy)}</span>
      </div>
      <div class="flex justify-between text-base">
        <span class="text-gray-600">Bán ra</span>
        <span class="font-bold text-red-700">${sellDisplay}</span>
      </div>
      ${item.updated ? `<p class="text-xs text-gray-400">BTMC: ${item.updated}</p>` : ''}
    `;
    container.appendChild(card);
  });

  $('btmc-loading').classList.add('hidden');
  container.classList.remove('hidden');
}

async function fetchWorldGoldCurrent() {
  const response = await fetch(`${GIAVANG_API}?type=XAUUSD`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error('Không tải được giá vàng thế giới');
  }
  const buy = data.buy ?? data.prices?.XAUUSD?.buy;
  if (buy == null) throw new Error('Không có dữ liệu XAUUSD');
  return Number(buy);
}

async function fetchWorldGoldHistory() {
  const response = await fetch(`${GIAVANG_API}?type=XAUUSD&days=365`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error('Không tải được lịch sử giá');
  }
  return data.history ?? [];
}

function findPriceDaysAgo(history, targetDays) {
  if (!history.length) return null;

  const targetDate = new Date();
  targetDate.setHours(0, 0, 0, 0);
  targetDate.setDate(targetDate.getDate() - targetDays);

  let best = null;
  let bestDiff = Infinity;

  history.forEach((entry) => {
    const entryDate = new Date(entry.date);
    entryDate.setHours(0, 0, 0, 0);
    const diff = Math.abs(entryDate - targetDate);
    if (diff < bestDiff) {
      bestDiff = diff;
      const xau = entry.prices?.XAUUSD;
      if (xau?.buy != null) {
        best = { price: Number(xau.buy), date: entry.date, diffDays: diff / 86400000 };
      }
    }
  });

  if (best && best.diffDays > targetDays * 0.5 + 3) return null;
  return best;
}

function renderComparison(current, history) {
  hideSectionError($('world-gold-error'));
  $('world-current').textContent = `${formatUsd(current)} / oz`;

  const rows = $('comparison-rows');
  rows.innerHTML = '';

  COMPARISON_PERIODS.forEach(({ label, days }) => {
    const past = findPriceDaysAgo(history, days);
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center py-1';

    if (!past) {
      row.innerHTML = `
        <span class="text-gray-600">${label}</span>
        <span class="text-gray-400 text-sm">Chưa đủ dữ liệu</span>
      `;
    } else {
      const delta = current - past.price;
      const pct = past.price ? (delta / past.price) * 100 : 0;
      const color = delta >= 0 ? 'text-green-600' : 'text-red-600';
      const arrow = delta >= 0 ? '↑' : '↓';
      row.innerHTML = `
        <span class="text-gray-600">${label}</span>
        <span class="font-semibold ${color}">${arrow} ${formatUsdDelta(delta, pct)}</span>
      `;
    }
    rows.appendChild(row);
  });

  $('world-gold-loading').classList.add('hidden');
  $('world-gold-content').classList.remove('hidden');
}

function updateCalculator() {
  const chi = parseFloat($('calc-chi').value);
  const resultEl = $('calc-result');

  if (!chi || chi <= 0 || worldGoldPrice == null) {
    resultEl.classList.add('hidden');
    return;
  }

  const usd = (chi / CHI_PER_TROY_OZ) * worldGoldPrice;
  $('calc-usd').textContent = `${formatUsd(usd)} USD (tham khảo)`;
  resultEl.classList.remove('hidden');
}

async function loadBTMC() {
  $('btmc-loading').classList.remove('hidden');
  $('btmc-table').classList.add('hidden');
  hideSectionError($('btmc-error'));

  try {
    const result = await fetchBTMC();
    renderBTMCTable(result.prices, {
      source: result.source,
      note: result.note,
    });
  } catch (err) {
    showSectionError(
      $('btmc-error'),
      $('btmc-loading'),
      $('btmc-table'),
      err.message,
    );
  }
}

async function loadWorldGold() {
  $('world-gold-loading').classList.remove('hidden');
  $('world-gold-content').classList.add('hidden');
  hideSectionError($('world-gold-error'));

  try {
    const [current, history] = await Promise.all([
      fetchWorldGoldCurrent(),
      fetchWorldGoldHistory(),
    ]);
    worldGoldPrice = current;
    renderComparison(current, history);
    updateCalculator();
  } catch (err) {
    worldGoldPrice = null;
    updateCalculator();
    showSectionError(
      $('world-gold-error'),
      $('world-gold-loading'),
      $('world-gold-content'),
      err.message,
    );
  }
}

async function loadAll() {
  $('btn-refresh').disabled = true;
  await Promise.all([loadBTMC(), loadWorldGold()]);
  setUpdatedLabel();
  $('btn-refresh').disabled = false;
}

$('btn-refresh').addEventListener('click', loadAll);
$('calc-chi').addEventListener('input', updateCalculator);

loadAll();
setInterval(loadAll, REFRESH_MS);
