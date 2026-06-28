const fs = require('fs');
const path = require('path');
const { fetchBTMCFromAPI } = require('./btmc-api');

async function main() {
  const output = await fetchBTMCFromAPI();
  const outPath = path.join(__dirname, '..', 'data', 'btmc.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Wrote ${output.count} prices to data/btmc.json`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
