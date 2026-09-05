// 构建脚本：把 providers.json + 双视角状态/历史合并成 site/data.js，
// 以 <script> 方式加载（而不是 fetch JSON），这样本地双击 index.html 也能直接打开。
// 视角：intl（国际，GitHub Actions）为必选；cn（国内）可选，文件不存在时页面会显示"未接入"。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const readJson = async (name, fallback) =>
  readFile(path.join(root, 'data', name), 'utf8').then(JSON.parse).catch(() => fallback);

const [providers, intl, cn, histIntl, histCn, freeModels, eventsIntl, eventsCn] = await Promise.all([
  readJson('providers.json', []),
  readJson('status.json', { lastRun: null, results: {} }),
  readJson('status-cn.json', null),
  readJson('history.json', []),
  readJson('history-cn.json', []),
  readJson('free-models.json', { sites: {} }),
  readJson('events-intl.json', []),
  readJson('events-cn.json', []),
]);

const views = {
  intl: { lastRun: intl.lastRun, results: intl.results || {}, history: histIntl },
};
if (cn?.lastRun) views.cn = { lastRun: cn.lastRun, results: cn.results || {}, history: histCn };

const events = [...eventsIntl, ...eventsCn]
  .sort((a, b) => (a.t < b.t ? 1 : -1))
  .slice(0, 40);

const data = { generatedAt: intl.lastRun, views, freeModels: freeModels.sites || {}, events, providers };
const js = `/* 由 scripts/build.mjs 自动生成，请勿手改 */\nwindow.RADAR_DATA = ${JSON.stringify(data)};\n`;
await writeFile(path.join(root, 'site', 'data.js'), js);

const summary = Object.entries(views)
  .map(([name, v]) => `${name}: ${new Set(Object.keys(v.results)).size} 家 @ ${v.lastRun ?? '未检测'}`)
  .join(', ');
console.log(`build ok: ${providers.length} providers (${summary}) -> site/data.js`);
