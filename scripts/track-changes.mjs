// 变更追踪：对比"当前状态"与"上次基线"，生成本视角的变更事件。
// 按视角拆分运行（--view=intl / --view=cn），状态与事件各自独立文件，
// 从根本上避免 Actions 与本机计划任务同时运行时的互相覆盖。
//
// 职责划分：免费模型增减、截止日期预警由 intl 视角负责（fetch-free-models 只在 Actions 跑）；
// 掉线/恢复事件各视角自己负责。首跑只建立基线，不产生事件；旧版 state.json 会自动迁移。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = process.argv.includes('--view=cn') || process.env.RADAR_VIEW === 'cn' ? 'cn' : 'intl';
const STATE_FILE = `state-${VIEW}.json`;
const EVENTS_FILE = `events-${VIEW}.json`;

const readJson = async (name, fallback) =>
  readFile(path.join(root, 'data', name), 'utf8').then(JSON.parse).catch(() => fallback);

const providers = await readJson('providers.json', []);
const nameOf = Object.fromEntries(providers.map((p) => [p.id, p.name]));
const statusFile = VIEW === 'cn' ? 'status-cn.json' : 'status.json';
const status = await readJson(statusFile, { results: {} });
const freeModels = VIEW === 'intl' ? await readJson('free-models.json', { sites: {} }) : { sites: {} };

// 基线：优先读本视角状态文件；不存在则迁移旧版 state.json（intl 继承免费/截止基线）
let state = await readJson(STATE_FILE, null);
if (!state) {
  const legacy = VIEW === 'intl' ? await readJson('state.json', null) : null;
  if (legacy) {
    state = {
      site: legacy.site?.[VIEW] || {},
      free: legacy.free || {},
      deadlineFlags: legacy.deadlineFlags || {},
      notifiedAt: legacy.notifiedAt || null,
    };
    console.log(`已从旧版 state.json 迁移基线到 ${STATE_FILE}`);
  } else {
    console.log('（首次运行：建立基线，不生成事件）');
    state = { site: {}, free: {}, deadlineFlags: {}, notifiedAt: null };
  }
}

const events = [];
const now = new Date().toISOString();
const isOnline = (id) => status.results?.[id]?.website?.ok === true;

// ---- 1. 官网上下线事件 ----
const newSiteState = {};
for (const p of providers) newSiteState[p.id] = isOnline(p.id);
if (Object.keys(state.site).length) {
  for (const [id, cur] of Object.entries(newSiteState)) {
    const prevVal = state.site[id];
    if (prevVal === undefined || prevVal === cur) continue;
    events.push({ t: now, type: prevVal && !cur ? 'down' : 'up', view: VIEW, id, name: nameOf[id] || id });
  }
}

// ---- 2. 免费模型增减事件（仅 intl 视角负责） ----
let newFreeState = state.free || {};
if (VIEW === 'intl') {
  newFreeState = {};
  for (const [id, snap] of Object.entries(freeModels.sites || {})) {
    newFreeState[id] = snap.count;
    const prevCount = state.free?.[id];
    if (prevCount === undefined || prevCount === snap.count) continue;
    events.push({
      t: now,
      type: snap.count < prevCount ? 'models-' : 'models+',
      view: 'intl',
      id,
      name: nameOf[id] || id,
      detail: `免费模型 ${prevCount} → ${snap.count}`,
    });
  }
}

// ---- 3. 截止日期预警（剩 3 天 / 1 天各提醒一次，仅 intl 视角负责） ----
const newDeadlineState = { ...state.deadlineFlags };
const daysLeft = (dl) => {
  const end = new Date(dl + 'T23:59:59');
  if (isNaN(end)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000) - 1;
};
if (VIEW === 'intl') {
  for (const p of providers) {
    if (!p.deadline) continue;
    const d = daysLeft(p.deadline);
    for (const threshold of [3, 1]) {
      const flag = `${p.id}:${threshold}`;
      if (d !== null && d <= threshold && d >= 0 && !newDeadlineState[flag]) {
        events.push({ t: now, type: 'deadline', view: 'intl', id: p.id, name: nameOf[p.id] || p.id, detail: `限时活动剩余 ${d} 天（${p.deadline} 截止）` });
        newDeadlineState[flag] = true;
      }
    }
  }
}

// ---- 写回：追加事件（封顶 200 条）+ 更新基线 ----
if (events.length) {
  const old = await readJson(EVENTS_FILE, []);
  await writeFile(path.join(root, 'data', EVENTS_FILE), JSON.stringify([...events, ...old].slice(0, 200), null, 2) + '\n');
}

const newState = { view: VIEW, site: newSiteState, free: newFreeState, deadlineFlags: newDeadlineState, notifiedAt: state.notifiedAt };
await writeFile(path.join(root, 'data', STATE_FILE), JSON.stringify(newState, null, 2) + '\n');

console.log(`track-changes[${VIEW}]: ${events.length} 个新事件`);
for (const e of events) console.log(` - [${e.type}] ${e.name}${e.detail ? '：' + e.detail : ''}`);
