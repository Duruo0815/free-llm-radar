# 📡 免费大模型雷达 (Free LLM Radar)

定时查验可**免费使用**的 AI 大模型服务：三级检测（官网 → API 端点 → 免费实测）、双网络视角（国际/国内）、限时活动倒计时，点击直达官网。

## 它做什么

- **名单**：`data/providers.json` 维护一份精选的免费大模型服务列表（国内外 57 家），分三类：官方 API 平台、第三方中转/聚合站、Agent/助手工具（内置免费额度或会员赠送，如 ZCode、Trae、CodeBuddy、豆包、元宝、Kimi）。
- **三级探活**：
  1. **官网可达**——访问官网首页；
  2. **API 端点存活**——访问 API 端点，401/403 也证明服务存活；
  3. **免费实测**——配置密钥后发起真实的极小对话请求（`max_tokens: 16`），验证免费档**当前真的可用**，能发现"官网活着但免费档已取消"的情况。未配置密钥时该级显示"未配置密钥"，不影响前两级。
- **双网络视角**：国际视角（GitHub Actions）与国内视角（自建 runner / 本地）分别独立检测、独立存历史（`status.json`/`status-cn.json`），页面一键切换；两路结论相反时卡片标注 🔀 双网不一致。
- **历史与上线率**：每个视角各保留最近 120 次记录，页面显示对应视角的上线率。
- **展示**：纯静态站（`site/`），无需任何框架。搜索、地区/类别/免费类型筛选、"只看在线"、限时活动倒计时与"30天内截止"筛选，每个服务都有可点击的官网/控制台/文档链接。
- **自动化**：GitHub Actions 每 6 小时跑一轮完整流水线：国际视角探活 → 抓取中转站免费模型 → 生成变更事件 → 构建部署 → 推送通知。
- **免费模型抓取**：`scripts/fetch-free-models.mjs` 定时拉取中转/聚合站定价接口（new-api 系 `/api/pricing`、OpenRouter models API），自动提取当前免费模型清单；站点卡片显示 `🎁 N 个免费模型`（悬停看清单），模型增减会记入动态并推送。
- **变更时间线**：`scripts/track-changes.mjs` 对比前后状态生成事件（掉线/恢复·分视角、免费模型增减、限时活动剩 3 天/1 天预警），页面底部"最近动态"展示，写入 `data/events.json`（封顶 200 条）。
- **变化推送**：`scripts/notify.mjs` 把新事件推到 Telegram / 企业微信 / Bark / 通用 webhook（配置见下）。

## 本地运行

需要 Node.js 18+。

```bash
# 1. 探活（会真实访问各服务商，约 30 秒）
node scripts/probe.mjs            # 国际视角（写 status.json / history.json）
node scripts/probe.mjs --view=cn  # 国内视角（写 status-cn.json / history-cn.json）

# 2. 生成站点数据（自动合并存在的视角）
node scripts/build.mjs

# 3. 打开页面
# 直接双击 site/index.html 即可（数据以 <script> 方式注入，file:// 协议也能加载）
```

> 注意：本地检测结果取决于你当前的网络环境，这正是双网络视角存在的意义——
> 两路数据分别保存、页面上分开切换查看，结论相反的服务会标注 🔀。

## 三级探活：配置免费实测密钥

第三级"免费实测"完全由配置驱动，两步启用：

1. **服务商条目加 `probe` 字段**（22 家已预置，模板如下）：

```json
"probe": {
  "type": "openai",              // openai（OpenAI 兼容）| gemini（Google 原生）
  "url": "https://api.groq.com/openai/v1/chat/completions",
  "model": "llama-3.3-70b-versatile",
  "keyEnv": "RADAR_KEY_GROQ"     // 读取的环境变量名；免费无密钥的服务（如 OVH）可省略
}
```

2. **提供密钥**（任选其一）：
   - GitHub Actions：仓库 **Settings → Secrets and variables → Actions** 添加同名 Secret（`RADAR_KEY_*`），工作流已预埋传参；
   - 本地运行：直接设置同名环境变量，或用 dotenv 类工具加载 `.env`。

> 已预置 23 家的 probe 配置；另注意：在非 GitHub Actions 环境直接跑 `node scripts/probe.mjs` 会覆盖 Actions 生产的国际视角数据，本地测试请用 `--view=cn` 或显式 `--view=intl`（脚本会给出提示）。

每个密钥每次检测只消耗一次 `max_tokens: 16` 的请求，几乎不耗额度。实测失败的常见原因会显示在卡片上：`HTTP 402/403`（免费档取消或需绑卡）、`HTTP 404`（模型 ID 变了，更新 `probe.model` 即可）、`HTTP 401`（密钥失效）。

## 变化推送配置（可选）

在仓库 **Settings → Secrets and variables → Actions** 中添加（配几个推几个）：

| 渠道 | Secrets | 说明 |
|------|---------|------|
| Telegram | `RADAR_TG_TOKEN` + `RADAR_TG_CHAT` | BotFather 建 bot 的 token；chat id 可用 @userinfobot 查询 |
| 企业微信 | `RADAR_WECOM_WEBHOOK` | 群设置 → 群机器人 → 添加后的 webhook 地址 |
| Bark (iOS) | `RADAR_BARK_URL` | `https://api.day.app/你的key` |
| 通用 | `RADAR_NOTIFY_WEBHOOK` | POST `{title, text, events}` 到你的接口 |

推送内容：服务掉线/恢复、免费模型增减、限时活动截止预警（剩 3 天/1 天各提醒一次）。未配置渠道时脚本自动 dry-run，只打日志。

## 国内视角接入（三选一）

- **GitHub self-hosted runner（推荐）**：在国内常开的机器/服务器上注册 runner，label 设为 `cn`，`probe-cn.yml` 会每 6 小时自动运行；
- **国内 VPS 定时任务**：`crontab` 每 6 小时执行 `node scripts/probe.mjs --view=cn && node scripts/build.mjs && git commit/push`；
- **本地手动**：随时跑 `--view=cn`，数据与本机网络环境对应。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，把本项目推上去。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 手动触发一次 workflow（Actions → Probe & Deploy → Run workflow），之后每 6 小时自动运行。
4. 访问 `https://<你的用户名>.github.io/<仓库名>/`。

## 如何添加新服务

编辑 `data/providers.json`，追加一条记录：

```json
{
  "id": "唯一英文id",
  "name": "显示名称",
  "org": "厂商",
  "region": "国内 | 国际",
  "kind": "官方(省略) | 中转聚合 | agent（Agent/助手工具：免费额度或会员在工具内，不发放裸 API key）",
  "freeType": "永久免费 | 限时免费 | 免费额度 | 新人赠送 | 部分免费",
  "website": "官网首页",
  "console": "获取 API Key 的控制台页",
  "docs": "接口文档",
  "api": "用于探活的 API 端点（可选）",
  "freeDesc": "免费额度与限制的一句话说明",
  "models": ["代表模型"],
  "needs": ["注册要求"],
  "deadline": "2026-09-30（可选：限时活动的截止日期，页面自动倒计时，≤7 天红色预警，过期置灰划线；无日期的限时免费会显示'无固定截止'）",
  "needsVpn": true
}
```

页面提供"⏰ 30天内截止"筛选，配合 `deadline` 字段使用。

提交后 push，Actions 会自动探活并重新部署。也欢迎用 Issue/PR 修正过期信息。

## 发现新服务的渠道

- GitHub 现成列表：[awesome-free-models](https://github.com/12britz/awesome-free-models)、[Free-LLM-Collection](https://github.com/for-the-zero/Free-LLM-Collection)、[FreeLLM-API-KeyHub](https://github.com/guihuashaoxiang/FreeLLM-API-KeyHub)
- 中转站目录：[LMSpeed 提供商列表](https://lmspeed.net/zh/provider)
- 关键词搜索："公益站 / 中转站 / 免费模型 / new-api"、"free tier models <平台名>"
- new-api 类中转站可尝试 `GET /api/pricing` 接口（`quota_type=1` 的模型通常免费），可直接程序化发现免费模型

> ⚠️ 中转/聚合站（`kind: "中转聚合"`）非模型官方，免费额度、稳定性与数据隐私均无保障，收录时会打上"中转/聚合"徽章提醒用户。

## 免责声明

各平台免费政策变化很快，额度、限速与限制以**官网公告为准**；本项目只做"是否在线"的机械检测，
不保证免费信息永远准确。请勿将逆向/爬虫类灰色接口用于生产环境。
