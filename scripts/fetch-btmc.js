const fs = require('fs');
const path = require('path');
const { fetchBTMC } = require('./btmc-api');

const OUT_PATH = path.join(__dirname, '..', 'data', 'btmc.json');

function readExisting() {
  if (!fs.existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  console.log('Fetching BTMC prices...');
  const output = await fetchBTMC();
  console.log(`OK via ${output.source} — ${output.count} items`);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote data/btmc.json');
}

main().catch((err) => {
  console.error(`Fetch failed: ${err.message}`);

  const existing = readExisting();
  if (existing?.count > 0) {
    console.warn(
      `Keeping previous data (${existing.count} items, fetched ${existing.fetchedAt})`,
    );
    process.exit(0);
  }

  process.exit(1);
});
