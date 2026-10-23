const fs = require('fs');
const OV = 'D:/独立站/data/admin/overrides.json';
const bak = fs.readFileSync(OV, 'utf8');
try {
  const ov = JSON.parse(bak);
  const H = '2025-26-bayern-munich-oktoberfest-special-edition-jersey';
  ov[H] = { ...(ov[H] || {}), images: ['https://img.staticdj.com/7e53b74a1b4c5bf73620cb315a943b53.jpg', 'https://img.staticdj.com/3de9c6e1a5eb7cce72055bbfd4f90d90.jpg'] };
  fs.writeFileSync(OV, JSON.stringify(ov, null, 2));
  console.log('written');
} catch (e) {
  console.log('ERROR', e.message);
}
