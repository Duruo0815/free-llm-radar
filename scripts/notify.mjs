// 变化推送：把上次通知之后的新事件推送到已配置的渠道（可同时配多个）。
// 渠道配置（环境变量 / GitHub Secrets）：
//   Telegram : RADAR_TG_TOKEN + RADAR_TG_CHAT
//   企业微信 : RADAR_WECOM_WEBHOOK（群机器人 webhook 地址）
//   Bark    : RADAR_BARK_URL（如 https://api.day.app/你的key）
//   通用    : RADAR_NOTIFY_WEBHOOK（POST JSON：{title, text, events}）
// 未配置任何渠道时进入 dry-run，只打印将要发送的内容。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (name, fallback) =>
  readFile(path.join(root, 'data', name), 'utf8').then(JSON.parse).catch(() => fallback);

const ICON = { down: '🔴', up: '🟢', 'models-': '📉', 'models+': '📈', deadline: '⏰' };
const LABEL = { down: '掉线', up: '恢复', 'models-': '免费模型减少', 'models+': '免费模型增加', deadline: '截止预警' };

const events = await readJson('events.json', []);
const state = await readJson('state.json', {});
const lastNotified = state.notifiedAt;

// 只推送比上次通知更新的事件，单次最多 15 条防止刷屏
const fresh = events
  .filter((e) => !lastNotified || e.t > lastNotified)
  .slice(0, 15);

if (!fresh.length) {
  console.log('notify: 没有新事件，跳过');
  process.exit(0);
}

const lines = fresh.map((e) => `${ICON[e.type] || '•'} [${LABEL[e.type] || e.type}] ${e.name}${e.view ? `（${e.view === 'cn' ? '国内' : '国际'}视角）` : ''}${e.detail ? `：${e.detail}` : ''}`);
const title = `免费大模型雷达：${fresh.length} 条新动态`;
const text = `${title}\n${lines.join('\n')}`;
console.log('--- 推送内容预览 ---');
console.log(text);
console.log('--------------------');

let sent = 0;
const post = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

// Telegram
if (process.env.RADAR_TG_TOKEN && process.env.RADAR_TG_CHAT) {
  try {
    await post(`https://api.telegram.org/bot${process.env.RADAR_TG_TOKEN}/sendMessage`, {
      chat_id: process.env.RADAR_TG_CHAT,
      text,
    });
    sent++;
    console.log('✓ Telegram 已推送');
  } catch (e) {
    console.error('✗ Telegram 推送失败:', e.message);
  }
}

// 企业微信群机器人
if (process.env.RADAR_WECOM_WEBHOOK) {
  try {
    await post(process.env.RADAR_WECOM_WEBHOOK, {
      msgtype: 'text',
      text: { content: text.slice(0, 2000) },
    });
    sent++;
    console.log('✓ 企业微信 已推送');
  } catch (e) {
    console.error('✗ 企业微信 推送失败:', e.message);
  }
}

// Bark（iOS）
if (process.env.RADAR_BARK_URL) {
  try {
    await post(process.env.RADAR_BARK_URL, { title, body: lines.join('\n').slice(0, 900) });
    sent++;
    console.log('✓ Bark 已推送');
  } catch (e) {
    console.error('✗ Bark 推送失败:', e.message);
  }
}

// 通用 webhook
if (process.env.RADAR_NOTIFY_WEBHOOK) {
  try {
    await post(process.env.RADAR_NOTIFY_WEBHOOK, { title, text, events: fresh });
    sent++;
    console.log('✓ 通用 webhook 已推送');
  } catch (e) {
    console.error('✗ 通用 webhook 推送失败:', e.message);
  }
}

if (sent === 0) console.log('（未配置任何推送渠道，dry-run 完成）');

// 无论是否配置渠道都推进通知水位，避免历史事件在配好渠道后被一次性轰炸
state.notifiedAt = new Date().toISOString();
await writeFile(path.join(root, 'data', 'state.json'), JSON.stringify(state, null, 2) + '\n');
