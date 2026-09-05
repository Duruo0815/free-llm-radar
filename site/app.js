/* 免费大模型雷达 - 前端逻辑 */
(function () {
  const data = window.RADAR_DATA || { providers: [], views: {} };
  const providers = data.providers || [];
  const freeModels = data.freeModels || {};
  const events = data.events || [];
  // 视图数据：intl 必有；cn 可选（未接入时页面显示"未接入"提示）
  const views = data.views && data.views.intl
    ? data.views
    : { intl: { lastRun: null, results: {}, history: [] } };

  const state = { q: '', region: '全部', kind: '全部', type: '全部', view: 'intl', onlyOk: false, onlyEnding: false };

  // ---------- 主题切换（手动选择持久化，未选择时跟随系统） ----------
  const themeBtn = document.getElementById('themeToggle');
  const syncThemeBtn = () => {
    const light = document.documentElement.dataset.theme === 'light';
    themeBtn.textContent = light ? '🌙' : '☀️';
    themeBtn.title = light ? '切换到夜间模式' : '切换到白天模式';
  };
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('radar-theme', next); } catch (e) {}
    syncThemeBtn();
  });
  syncThemeBtn();

  // ---------- 视角 / 历史数据的统一入口 ----------
  const activeView = () => (state.view === 'cn' && views.cn ? views.cn : views.intl);
  const resultsOf = () => activeView().results || {};
  const historyOf = () => activeView().history || [];

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  // 由历史记录计算上线率；只统计该服务真正被检测过的运行，
  // 早期运行中没有的服务不应被当成"失败"拉低上线率
  const uptimeOf = (id) => {
    const h = historyOf();
    if (!h.length) return null;
    let total = 0, ok = 0;
    for (const run of h) {
      if (run.r && id in run.r) {
        total++;
        ok += run.r[id] ? 1 : 0;
      }
    }
    return total ? Math.round((ok / total) * 100) : null;
  };

  const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未检测';

  const TYPE_CLASS = { 永久免费: 'free', 限时免费: 'timelimit', 免费额度: 'quota', 新人赠送: 'trial', 部分免费: 'partial' };

  // 类别归类：官方平台（默认）/ 中转聚合 / Agent·助手工具
  const kindOf = (p) => (p.kind === 'agent' ? 'Agent/助手' : p.kind === '中转聚合' ? '中转聚合' : '官方平台');

  // 按自然日计算剩余天数：明天截止 = 剩 1 天，今天截止 = 0；
  // 日期无法解析时返回 null，避免 Invalid Date 产生 NaN
  const daysLeft = (p) => {
    if (!p.deadline) return null;
    const end = new Date(p.deadline + 'T23:59:59');
    if (isNaN(end)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((end - today) / 86400000) - 1;
  };

  // 截止日期徽章：有日期显示倒计时（≤7 天红色预警，≤30 天橙色，过期置灰划线）；
  // 限时免费但没公布日期（或日期无法解析）的，明确标注"无固定截止"
  function deadlineBadge(p) {
    const days = daysLeft(p);
    if (days === null) {
      return p.freeType === '限时免费' ? '<span class="badge no-deadline">⏰ 无固定截止</span>' : '';
    }
    if (days < 0) return `<span class="badge deadline-down">⏰ 已于 ${esc(p.deadline)} 过期</span>`;
    const label = days === 0 ? '今天截止' : `剩 ${days} 天`;
    const cls = days <= 7 ? 'deadline-soon' : days <= 30 ? 'deadline-mid' : 'deadline-far';
    return `<span class="badge ${cls}">⏰ ${esc(p.deadline)} · ${label}</span>`;
  }

  function card(p) {
    const st = resultsOf()[p.id] || {};
    const site = st.website;
    const online = site?.ok === true;
    const checked = !!site;
    const dot = online ? 'ok' : checked ? 'down' : 'unknown';
    const uptime = uptimeOf(p.id);

    // 第三级：免费实测调用
    const call = st.call;
    let callMeta = '';
    let verifiedBadge = '';
    if (call) {
      if (call.level === 'nokey') {
        callMeta = '<span>免费实测: 未配置密钥</span>';
      } else if (call.ok) {
        callMeta = `<span class="lat-ok">免费实测 ✓ ${call.ms}ms</span>`;
        verifiedBadge = `<span class="badge verified" title="已用真实请求验证免费档可用（模型: ${esc(call.model || '')}）">✓ 免费实测</span>`;
      } else {
        callMeta = `<span class="lat-down">免费实测 ✗ ${esc(call.reason || '失败')}</span>`;
      }
    }

    // 双网不一致：国际与国内视角的官网可达性结论相反时提示
    let diffBadge = '';
    if (views.cn) {
      const a = views.intl.results?.[p.id]?.website?.ok;
      const b = views.cn.results?.[p.id]?.website?.ok;
      if (a !== undefined && b !== undefined && a !== b) {
        diffBadge = `<span class="badge diff" title="国际视角: ${a ? '在线' : '不可达'} / 国内视角: ${b ? '在线' : '不可达'}">🔀 双网不一致</span>`;
      }
    }

    // 免费模型抓取结果（中转/聚合站）
    const fm = freeModels[p.id];
    const fmBadge = fm
      ? `<span class="badge fm" title="${esc(fm.models.slice(0, 10).join('\n'))}${fm.models.length > 10 ? '\n…' : ''}">🎁 ${fm.count} 个免费模型</span>`
      : '';

    const badges = [
      `<span class="badge ${TYPE_CLASS[p.freeType] || ''}">${esc(p.freeType)}</span>`,
      deadlineBadge(p),
      verifiedBadge,
      p.kind === '中转聚合' ? '<span class="badge relay">中转/聚合</span>' : '',
      p.kind === 'agent' ? '<span class="badge agent">Agent/助手</span>' : '',
      p.needsVpn ? '<span class="badge vpn">🪜 需代理</span>' : '',
      fmBadge,
      diffBadge,
    ].join('');

    const models = (p.models || []).map((m) => `<code>${esc(m)}</code>`).join('');
    const needs = p.needs?.length ? `<div class="needs">注册：<b>${p.needs.map(esc).join(' / ')}</b></div>` : '';

    const siteMeta = site
      ? online
        ? `<span class="lat-ok">官网 ${site.status} · ${site.ms}ms</span>`
        : site.alive
          ? `<span class="lat-down">官网响应异常 (${site.status})</span>`
          : `<span class="lat-down">官网不可达${site.error ? ` (${esc(site.error)})` : ''}</span>`
      : '';
    const apiMeta = st.api
      ? `<span>${st.api.alive ? `API 端点有响应 (${st.api.status})` : `<span class="lat-down">API 不可达</span>`}</span>`
      : '';
    const upMeta = uptime === null ? '' : `<span>上线率 ${uptime}%</span>`;
    const timeMeta = site ? `<span>检测于 ${fmtTime(activeView().lastRun)}</span>` : '<span>未检测</span>';

    const links = [
      p.website ? `<a class="btn primary" href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">官网 ↗</a>` : '',
      p.console ? `<a class="btn" href="${esc(p.console)}" target="_blank" rel="noopener noreferrer">${p.kind === 'agent' ? '下载 / 领取额度' : '获取 API Key'}</a>` : '',
      p.docs ? `<a class="btn" href="${esc(p.docs)}" target="_blank" rel="noopener noreferrer">文档</a>` : '',
    ].join('');

    return `
      <article class="card">
        <div class="card-head">
          <span class="dot ${dot}" title="${online ? '官网可达' : checked ? '官网异常/不可达' : '未检测'}"></span>
          <h3>${esc(p.name)}</h3>
          <span class="region">${esc(p.region)}</span>
        </div>
        <div class="badges">${badges}</div>
        <p class="desc">${esc(p.freeDesc)}</p>
        <div class="models">${models}</div>
        ${needs}
        <div class="links">${links}</div>
        <div class="meta">${siteMeta}${apiMeta}${callMeta}${upMeta}${timeMeta}</div>
      </article>`;
  }

  function render() {
    const q = state.q.trim().toLowerCase();
    const st = resultsOf();
    const list = providers.filter((p) => {
      if (state.region === '国内' || state.region === '国际') {
        if (p.region !== state.region) return false;
      } else if (state.region === '需代理' && !p.needsVpn) return false;

      if (state.type !== '全部' && p.freeType !== state.type) return false;

      if (state.kind !== '全部' && kindOf(p) !== state.kind) return false;

      if (state.onlyOk && st[p.id]?.website?.ok !== true) return false;

      if (state.onlyEnding) {
        const days = daysLeft(p);
        if (days === null || days < 0 || days > 30) return false;
      }

      if (q) {
        const hay = [p.name, p.org, p.freeDesc, ...(p.models || [])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // 在线的排前面，同状态按地区分组内按名称
    list.sort((a, b) => {
      const ao = st[a.id]?.website?.ok === true ? 0 : 1;
      const bo = st[b.id]?.website?.ok === true ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    const grid = document.getElementById('grid');
    grid.innerHTML = list.map(card).join('');
    document.getElementById('empty').hidden = list.length > 0;
  }

  function renderStats() {
    const st = resultsOf();
    const total = providers.length;
    const online = providers.filter((p) => st[p.id]?.website?.ok === true).length;
    const verified = providers.filter((p) => st[p.id]?.call?.ok === true).length;
    const h = historyOf();
    document.getElementById('stats').innerHTML = `
      <span class="stat"><b>${total}</b>家免费服务</span>
      <span class="stat"><b class="ok">${online}</b>家在线</span>
      <span class="stat"><b class="ok">${verified}</b>家免费实测通过</span>
      <span class="stat"><b>${h.length}</b>次历史检测</span>
      <span class="stat">最近检测 <b>${fmtTime(activeView().lastRun)}</b></span>`;
  }

  function renderChips(containerId, values, key) {
    const box = document.getElementById(containerId);
    box.innerHTML = ['全部', ...values]
      .map(
        (v) =>
          `<button class="chip ${state[key] === v ? 'active' : ''}" data-v="${esc(v)}">${esc(v)}</button>`
      )
      .join('');
    box.querySelectorAll('.chip').forEach((btn) =>
      btn.addEventListener('click', () => {
        const v = btn.dataset.v;
        // 再次点击已选中的筛选时取消选择，回到"全部"
        state[key] = state[key] === v && v !== '全部' ? '全部' : v;
        renderChips(containerId, values, key);
        render();
      })
    );
  }

  // 视角切换：cn 数据存在才可选，否则渲染禁用提示
  function renderViewChips() {
    const box = document.getElementById('viewChips');
    const chips = [
      `<button class="chip ${state.view === 'intl' ? 'active' : ''}" data-v="intl">🌐 国际视角</button>`,
      views.cn
        ? `<button class="chip ${state.view === 'cn' ? 'active' : ''}" data-v="cn">🇨🇳 国内视角</button>`
        : `<span class="chip chip-disabled" title="部署国内探活后启用（见 README：国内视角接入）">🇨🇳 国内视角未接入</span>`,
    ];
    box.innerHTML = chips.join('');
    box.querySelectorAll('button.chip').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.view = btn.dataset.v;
        renderViewChips();
        renderStats();
        render();
      })
    );
  }

  // 最近动态时间线（事件由 track-changes.mjs 生成）
  function renderTimeline() {
    const section = document.getElementById('timelineSection');
    if (!events.length) return;
    const ICON = { down: '🔴', up: '🟢', 'models-': '📉', 'models+': '📈', deadline: '⏰' };
    const LABEL = { down: '掉线', up: '恢复', 'models-': '免费模型减少', 'models+': '免费模型增加', deadline: '截止预警' };
    document.getElementById('tlList').innerHTML = events
      .slice(0, 12)
      .map(
        (e) => `<li class="tl-item tl-${esc(e.type)}">
          <span class="tl-icon">${ICON[e.type] || '•'}</span>
          <span class="tl-text"><b>${esc(e.name)}</b> ${LABEL[e.type] || esc(e.type)}${e.view ? `（${e.view === 'cn' ? '国内' : '国际'}视角）` : ''}${e.detail ? `：${esc(e.detail)}` : ''}</span>
          <span class="tl-time">${fmtTime(e.t)}</span>
        </li>`
      )
      .join('');
    section.hidden = false;
  }

  document.getElementById('search').addEventListener('input', (e) => {
    state.q = e.target.value;
    render();
  });
  document.getElementById('onlyOk').addEventListener('change', (e) => {
    state.onlyOk = e.target.checked;
    render();
  });
  document.getElementById('onlyEnding').addEventListener('change', (e) => {
    state.onlyEnding = e.target.checked;
    render();
  });

  renderStats();
  renderViewChips();
  renderChips('regionChips', ['国内', '国际', '需代理'], 'region');
  renderChips('kindChips', ['官方平台', '中转聚合', 'Agent/助手'], 'kind');
  renderChips('typeChips', ['永久免费', '限时免费', '免费额度', '新人赠送', '部分免费'], 'type');
  render();
  renderTimeline();
})();
