// 探活脚本：三级检测（官网可达 → API 端点存活 → 免费实测调用）。
// 视角：默认国际视角；传入 --view=cn（或环境变量 RADAR_VIEW=cn）即为国内视角，
//       结果写入独立的 status-cn.json / history-cn.json，两路互不覆盖。
//
// 免费实测说明：服务商配置 probe { type, url, model, keyEnv } 后，
// 若环境变量 keyEnv 存在则发起一次真实的极小对话请求（max_tokens=16），
// 验证"免费档当前真的可用"；未配置密钥时该级显示"未配置密钥"，不影响其他级别。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = process.argv.includes('--view=cn') || process.env.RADAR_VIEW === 'cn' ? 'cn' : 'intl';
const TIMEOUT_MS = 15000;
const CONCURRENCY = 5;
const UA = 'Mozilla/5.0 (compatible; FreeLLMRadar/1.0; +https://github.com/free-llm-radar)';

// 本地（非 Actions）跑国际视角会覆盖 Actions 产出的生产数据，属常见误操作，给出提示
if (VIEW === 'intl' && !process.env.GITHUB_ACTIONS && !process.argv.includes('--view=intl')) {
  console.warn('[提示] 当前在非 GitHub Actions 环境运行国际视角：结果会覆盖 data/status.json（Actions 生产数据）。');
  console.warn('[提示] 若想测试本地网络视角，请使用：node scripts/probe.mjs --view=cn');
  console.warn('[提示] 确认要覆盖时请显式指定：node scripts/probe.mjs --view=intl');
}

const STATUS_FILE = VIEW === 'cn' ? 'status-cn.json' : 'status.json';
const HISTORY_FILE = VIEW === 'cn' ? 'history-cn.json' : 'history.json';

async function check(url) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: '*/*' },
    });
    // 对 API 端点来说，任何 HTTP 响应（包括 401/403）都证明服务存活；
    // 网站则以 2xx/3xx 视为正常。
    return { status: res.status, ok: res.ok, alive: true, ms: Date.now() - t0 };
  } catch (e) {
    const reason = e?.cause?.code || e?.name || 'error';
    return { status: 0, ok: false, alive: false, ms: Date.now() - t0, error: String(reason).slice(0, 60) };
  } finally {
    clearTimeout(timer);
  }
}

// 第三级：真实免费调用。openai 兼容协议 + gemini 原生协议两种。
async function realCall(p) {
  const probe = p.probe;
  if (!probe) return null;
  const key = probe.keyEnv ? process.env[probe.keyEnv] : undefined;
  // gemini 协议必须带 key（?key=），无密钥时无法发起，按未配置处理
  if ((probe.keyEnv && !key) || (probe.type === 'gemini' && !key)) {
    return { ok: false, level: 'nokey', reason: '未配置密钥', model: probe.model };
  }

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let url = probe.url;
    const headers = { 'content-type': 'application/json' };
    let body;
    if (probe.type === 'gemini') {
      url += '?key=' + encodeURIComponent(key);
      body = { contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 16 } };
    } else {
      if (key) headers.authorization = 'Bearer ' + key;
      body = { model: probe.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 16, stream: false };
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    let data = null;
    try { data = await res.json(); } catch { /* 非 JSON 响应按失败处理 */ }
    const ok = res.ok && !!(data?.choices?.length || data?.candidates?.length);
    let reason = ok ? '' : `HTTP ${res.status}`;
    if (!ok && data?.error?.message) reason += `: ${String(data.error.message).slice(0, 80)}`;
    return { ok, status: res.status, ms, model: probe.model, reason };
  } catch (e) {
    clearTimeout(timer);
    const reason = String(e?.cause?.code || e?.name || 'error').slice(0, 40);
    return { ok: false, status: 0, ms: Date.now() - t0, model: probe.model, reason };
  }
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

const providers = JSON.parse(await readFile(path.join(root, 'data', 'providers.json'), 'utf8'));

const results = {};
await pool(providers, CONCURRENCY, async (p) => {
  const r = {};
  if (p.website) r.website = await check(p.website);
  if (p.api) r.api = await check(p.api);
  const call = await realCall(p);
  if (call) r.call = call;
  results[p.id] = r;
  const site = r.website ? `${r.website.ok ? 'OK ' : 'DOWN'} ${r.website.status} ${r.website.ms}ms` : 'n/a';
  const api = r.api ? ` | api ${r.api.alive ? 'alive' : 'down'} ${r.api.status}` : '';
  const callStr = r.call
    ? ` | call ${r.call.ok ? 'OK' : r.call.level === 'nokey' ? 'nokey' : 'FAIL ' + (r.call.reason || '')}`
    : '';
  console.log(`${p.id.padEnd(18)} site ${site}${api}${callStr}`);
});

const now = new Date().toISOString();
await writeFile(
  path.join(root, 'data', STATUS_FILE),
  JSON.stringify({ view: VIEW, lastRun: now, results }, null, 2) + '\n'
);

// 追加历史，保留最近 120 次记录
let history = [];
try {
  history = JSON.parse(await readFile(path.join(root, 'data', HISTORY_FILE), 'utf8'));
} catch {
  /* 该视角首次运行无历史 */
}
history.push({
  t: now,
  r: Object.fromEntries(providers.map((p) => [p.id, results[p.id]?.website?.ok ? 1 : 0])),
});
if (history.length > 120) history = history.slice(-120);
await writeFile(path.join(root, 'data', HISTORY_FILE), JSON.stringify(history, null, 2) + '\n');

const online = providers.filter((p) => results[p.id]?.website?.ok).length;
const verified = providers.filter((p) => results[p.id]?.call?.ok).length;
console.log(`\n[${VIEW}] done: ${online}/${providers.length} online, ${verified} free-call verified at ${now}`);
