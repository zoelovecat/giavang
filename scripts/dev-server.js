const http = require('http');
const fs = require('fs');
const path = require('path');
const { fetchBTMC } = require('./btmc-api');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

function readJson(relativePath) {
  const full = path.join(ROOT, relativePath);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

async function handleBtmcApi(res) {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  try {
    const live = await fetchBTMC();
    console.log(`[api/btmc] OK via ${live.source} — ${live.count} items`);
    send(200, live);
    return;
  } catch (err) {
    console.warn(`[api/btmc] All sources failed: ${err.message}`);
  }

  const cached = readJson('data/btmc.json');
  if (cached?.count > 0) {
    console.log(`[api/btmc] Using data/btmc.json — ${cached.count} items`);
    send(200, { ...cached, source: 'cached-file' });
    return;
  }

  send(502, {
    success: false,
    error: 'Không kết nối được API BTMC và chưa có dữ liệu cache. Chạy: npm run fetch-prices',
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/btmc') {
    await handleBtmcApi(res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('');
  console.log(`  Dev server: http://localhost:${PORT}`);
  console.log(`  BTMC proxy: http://localhost:${PORT}/api/btmc`);
  console.log('');
  console.log('  Mở link trên trong trình duyệt — KHÔNG double-click index.html');
  console.log('');
});
