// 变更追踪：对比"当前状态"与"上次记录状态"，生成变更事件写入 data/events.json。
// 事件类型：down(掉线) / up(恢复) / models-(免费模型减少) / models+(免费模型增加) / deadline(倒计时预警)
// 状态基线存于 data/state.json；首次运行只建立基线，不产生事件。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (name, fallback) =>
  readFile(path.join(root, 'data', name), 'utf8').then(JSON.parse).catch(() => fallback);

const providers = await readJson('providers.json', []);
const nameOf = Object.fromEntries(providers.map((p) => [p.id, p.name]));
const intl = await readJson('status.json', { results: {} });
const cn = await readJson('status-cn.json', null);
const freeModels = await readJson('free-models.json', { sites: {} });
let state = await readJson('state.json', null);

const events = [];
const now = new Date().toISOString();
const isOnline = (status, id) => status?.results?.[id]?.website?.ok === true;

// ---- 1. 官网上下线事件（双视角分别对比） ----
const newSiteState = { intl: {}, cn: {} };
for (const p of providers) {
  newSiteState.intl[p.id] = isOnline(intl, p.id);
  if (cn) newSiteState.cn[p.id] = isOnline(cn, p.id);
}
if (state?.site) {
  for (const view of Object.keys(newSiteState)) {
    for (const [id, cur] of Object.entries(newSiteState[view])) {
      const prevVal = state.site[view]?.[id];
      if (prevVal === undefined || prevVal === cur) continue;
      events.push({
        t: now,
        type: prevVal && !cur ? 'down' : 'up',
        view,
        id,
        name: nameOf[id] || id,
      });
    }
  }
} else {
  console.log('（首次运行：建立基线，不生成上下线事件）');
}

// ---- 2. 免费模型增减事件 ----
const newFreeState = {};
for (const [id, snap] of Object.entries(freeModels.sites || {})) {
  newFreeState[id] = snap.count;
  const prevCount = state?.free?.[id];
  if (prevCount === undefined || prevCount === snap.count) continue;
  events.push({
    t: now,
    type: snap.count < prevCount ? 'models-' : 'models+',
    id,
    name: nameOf[id] || id,
    detail: `免费模型 ${prevCount} → ${snap.count}`,
  });
}

// ---- 3. 截止日期预警（剩 3 天 / 1 天触发，同一阈值只报一次） ----
const newDeadlineState = { ...state?.deadlineFlags };
const daysLeft = (dl) => {
  const end = new Date(dl + 'T23:59:59');
  if (isNaN(end)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000) - 1;
};
for (const p of providers) {
  if (!p.deadline) continue;
  const d = daysLeft(p.deadline);
  for (const threshold of [3, 1]) {
    const flag = `${p.id}:${threshold}`;
    if (d !== null && d <= threshold && d >= 0 && !newDeadlineState[flag]) {
      events.push({ t: now, type: 'deadline', id: p.id, name: nameOf[p.id] || p.id, detail: `限时活动剩余 ${d} 天（${p.deadline} 截止）` });
      newDeadlineState[flag] = true;
    }
  }
}

// ---- 写回：追加事件（封顶 200 条）+ 更新基线 ----
if (events.length) {
  const old = await readJson('events.json', []);
  const merged = [...events, ...old].slice(0, 200);
  await writeFile(path.join(root, 'data', 'events.json'), JSON.stringify(merged, null, 2) + '\n');
}

const newState = {
  site: newSiteState,
  free: newFreeState,
  deadlineFlags: newDeadlineState,
  notifiedAt: state?.notifiedAt || null,
};
await writeFile(path.join(root, 'data', 'state.json'), JSON.stringify(newState, null, 2) + '\n');

console.log(`track-changes: ${events.length} 个新事件`);
for (const e of events) console.log(` - [${e.type}] ${e.name}${e.view ? ` (${e.view})` : ''}${e.detail ? '：' + e.detail : ''}`);
