// 免费模型抓取器：定时拉取中转/聚合站的定价接口，提取当前免费模型清单。
// 写入 data/free-models.json；模型增减的"变更事件"由 track-changes.mjs 统一生成。
//
// 支持的源格式（在 providers.json 的条目里配置 freeModels 字段）：
//   { "freeModels": { "source": "newapi",     "url": "https://api.gpt.ge/api/pricing" } }
//   { "freeModels": { "source": "openrouter", "url": "https://openrouter.ai/api/v1/models" } }
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FreeLLMRadar/1.0)' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v) => (v == null ? NaN : Number(v));

// new-api 系：免费 = 按次计费(quota_type=1)且单价0，或按量计费(quota_type=0)且倍率0
function parseNewapi(j) {
  const arr = Array.isArray(j?.data) ? j.data : [];
  return arr
    .filter((m) => (m.quota_type === 1 && num(m.model_price) === 0) || (m.quota_type === 0 && num(m.model_ratio) === 0))
    .map((m) => m.model_name)
    .filter(Boolean);
}

// OpenRouter：pricing.prompt 与 completion 均为字符串 "0" 即免费
function parseOpenrouter(j) {
  const arr = Array.isArray(j?.data) ? j.data : [];
  return arr.filter((m) => m?.pricing?.prompt === '0' && m?.pricing?.completion === '0').map((m) => m.id);
}

const PARSERS = { newapi: parseNewapi, openrouter: parseOpenrouter };

const providers = JSON.parse(await readFile(path.join(root, 'data', 'providers.json'), 'utf8'));
const targets = providers.filter((p) => p.freeModels?.url && PARSERS[p.freeModels.source]);

const sites = {};
for (const p of targets) {
  try {
    const models = PARSERS[p.freeModels.source](await fetchJson(p.freeModels.url));
    models.sort();
    sites[p.id] = { count: models.length, models: models.slice(0, 60) };
    console.log(`${p.id.padEnd(16)} ${models.length} 个免费模型（示例: ${models.slice(0, 3).join(', ') || '无'}）`);
  } catch (e) {
    // 抓取失败保留空结果但不抹掉上次的清单，避免误报"模型全下架"
    console.error(`${p.id.padEnd(16)} 抓取失败: ${e.message}`);
  }
}

// 保留上次成功结果用于失败兜底
let prev = {};
try {
  prev = JSON.parse(await readFile(path.join(root, 'data', 'free-models.json'), 'utf8')).sites || {};
} catch {
  /* 首次运行 */
}
for (const p of targets) {
  if (!sites[p.id] && prev[p.id]) {
    sites[p.id] = prev[p.id];
    console.log(`${p.id.padEnd(16)} 使用上次快照（${prev[p.id].count} 个）`);
  }
}

await writeFile(path.join(root, 'data', 'free-models.json'), JSON.stringify({ lastRun: new Date().toISOString(), sites }, null, 2) + '\n');
console.log(`\nfree-models.json 已更新：${Object.keys(sites).length}/${targets.length} 个站点`);
