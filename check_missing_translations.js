const fs = require('fs');
const ptBR = JSON.parse(fs.readFileSync('public/i18n/literals/pt-BR.json', 'utf8'));
const zhCN = JSON.parse(fs.readFileSync('public/i18n/literals/zh-CN.json', 'utf8'));
const missingKeys = Object.keys(zhCN).filter(key => !ptBR.hasOwnProperty(key));
console.log('Total keys in zh-CN:', Object.keys(zhCN).length);
console.log('Total keys in pt-BR:', Object.keys(ptBR).length);
console.log('Missing keys in pt-BR:', missingKeys.length);
if (missingKeys.length > 0) {
  console.log('First 50 missing keys:');
  missingKeys.slice(0, 50).forEach(k => console.log(' -', k));
}
