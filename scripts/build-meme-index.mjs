// 生成官网托管的 meme 索引 website/data/memes-imgflip.json：
//   1. Imgflip 官方接口 get_memes（热门前 100，免费免密钥）
//   2. Hugging Face 数据集 sergiogpinto/memefact-templates（Apache-2.0，663 个模板，按浏览量排序）
// 只保留 name + 图片地址，热门榜在前、其余按浏览量排序后去重。用法：node scripts/build-meme-index.mjs
import { writeFile } from 'node:fs/promises';

const OUT = new URL('../website/data/memes-imgflip.json', import.meta.url);
const CSV_URL =
  'https://huggingface.co/datasets/sergiogpinto/memefact-templates/resolve/main/imkg_final_final_final_processor.csv';

/** 最小 RFC4180 解析：支持引号内的逗号、换行与 "" 转义 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const key = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

const imgflip = await (await fetch('https://api.imgflip.com/get_memes', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
const top = (imgflip.data?.memes ?? []).map((m) => ({ name: m.name, url: m.url, score: Number(m.captions) || 0 }));

const [header, ...body] = parseCsv(await (await fetch(CSV_URL)).text());
const col = (name) => header.indexOf(name);
const dataset = body
  .map((r) => ({ name: (r[col('template_title')] ?? '').trim(), url: (r[col('template_url')] ?? '').trim(), score: Number(r[col('total_views')]) || 0 }))
  .filter((m) => m.name && /^https:\/\/imgflip\.com\//.test(m.url));

const seen = new Set();
// 官方热门榜在前（保持接口顺序），其余按数据集的浏览量降序
const items = [...top, ...dataset.sort((a, b) => b.score - a.score)]
  .filter((m) => (seen.has(key(m.name)) ? false : seen.add(key(m.name))))
  .map(({ name, url }) => ({ name, url }));

await writeFile(OUT, JSON.stringify({ items }) + '\n');
console.log(`wrote ${items.length} templates (top ${top.length} + dataset ${dataset.length}) → ${OUT.pathname}`);
