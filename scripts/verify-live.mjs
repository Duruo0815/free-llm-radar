// 验证线上站点与 Actions 探活结果
const site = await fetch('https://duruo0815.github.io/free-llm-radar/');
console.log('站点 HTTP:', site.status);

const raw = await (await fetch('https://duruo0815.github.io/free-llm-radar/data.js')).text();
const j = JSON.parse(raw.replace(/^[\s\S]*?window\.RADAR_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
const v = j.views.intl;
const entries = Object.entries(v.results);
const online = entries.filter(([k, r]) => r.website?.ok).length;
const verified = entries.filter(([k, r]) => r.call?.ok).map(([k, r]) => k);
const down = entries.filter(([k, r]) => r.website && !r.website.ok).map(([k]) => k);
console.log('intl 在线:', online + '/' + entries.length, '| 免费实测通过:', verified.length ? verified.join(', ') : 0);
console.log('intl 不可达:', down.join(', ') || '无');
if (j.views.cn) console.log('✓ cn 视角也已部署:', Object.keys(j.views.cn.results).length, '家');
console.log('免费模型数据:', Object.entries(j.freeModels || {}).map(([k, s]) => `${k}:${s.count}`).join(', '));
