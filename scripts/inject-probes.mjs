// 一次性脚本：给服务商注入三级探活的实测配置（probe 字段）
// keyEnv 指向环境变量名（GitHub Secrets / 本地 .env），未配置密钥时该级自动跳过
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../data/providers.json', import.meta.url);
const providers = JSON.parse(await readFile(file, 'utf8'));
const byId = Object.fromEntries(providers.map((p) => [p.id, p]));

const OPENAI = 'openai';
const probes = {
  zhipu: { type: OPENAI, url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4.5-flash', keyEnv: 'RADAR_KEY_ZHIPU' },
  siliconflow: { type: OPENAI, url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct', keyEnv: 'RADAR_KEY_SILICONFLOW' },
  modelscope: { type: OPENAI, url: 'https://api-inference.modelscope.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct', keyEnv: 'RADAR_KEY_MODELSCOPE' },
  hunyuan: { type: OPENAI, url: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', model: 'hunyuan-lite', keyEnv: 'RADAR_KEY_HUNYUAN' },
  spark: { type: OPENAI, url: 'https://spark-api-open.xf-yun.com/v1/chat/completions', model: 'lite', keyEnv: 'RADAR_KEY_SPARK' },
  bailian: { type: OPENAI, url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-flash', keyEnv: 'RADAR_KEY_BAILIAN' },
  ark: { type: OPENAI, url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-seed-1.6-flash-250815', keyEnv: 'RADAR_KEY_ARK' },
  qianfan: { type: OPENAI, url: 'https://qianfan.baidubce.com/v2/chat/completions', model: 'ernie-speed-128k', keyEnv: 'RADAR_KEY_QIANFAN' },
  moonshot: { type: OPENAI, url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', keyEnv: 'RADAR_KEY_MOONSHOT' },
  minimax: { type: OPENAI, url: 'https://api.minimaxi.com/v1/text/chatcompletion_v2', model: 'abab6.5s-chat', keyEnv: 'RADAR_KEY_MINIMAX' },
  'google-ai-studio': { type: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', model: 'gemini-2.5-flash', keyEnv: 'RADAR_KEY_GOOGLE' },
  openrouter: { type: OPENAI, url: 'https://openrouter.ai/api/v1/chat/completions', model: 'deepseek/deepseek-r1:free', keyEnv: 'RADAR_KEY_OPENROUTER' },
  groq: { type: OPENAI, url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', keyEnv: 'RADAR_KEY_GROQ' },
  cerebras: { type: OPENAI, url: 'https://api.cerebras.ai/v1/chat/completions', model: 'gpt-oss-120b', keyEnv: 'RADAR_KEY_CEREBRAS' },
  'github-models': { type: OPENAI, url: 'https://models.github.ai/inference/chat/completions', model: 'openai/gpt-4.1-mini', keyEnv: 'RADAR_KEY_GITHUB' },
  mistral: { type: OPENAI, url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest', keyEnv: 'RADAR_KEY_MISTRAL' },
  'nvidia-nim': { type: OPENAI, url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta/llama-3.1-8b-instruct', keyEnv: 'RADAR_KEY_NVIDIA' },
  sambanova: { type: OPENAI, url: 'https://api.sambanova.ai/v1/chat/completions', model: 'Meta-Llama-3.3-70B-Instruct', keyEnv: 'RADAR_KEY_SAMBANOVA' },
  ovh: { type: OPENAI, url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', model: 'gpt-oss-120b' },
  cohere: { type: OPENAI, url: 'https://api.cohere.com/compatibility/v1/chat/completions', model: 'command-r7b-12-2024', keyEnv: 'RADAR_KEY_COHERE' },
  zai: { type: OPENAI, url: 'https://api.z.ai/api/paas/v4/chat/completions', model: 'glm-4.5-flash', keyEnv: 'RADAR_KEY_ZAI' },
  'vercel-gateway': { type: OPENAI, url: 'https://ai-gateway.vercel.sh/v1/chat/completions', model: 'openai/gpt-4o-mini', keyEnv: 'RADAR_KEY_VERCEL' },
  'deepseek-platform': { type: OPENAI, url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', keyEnv: 'RADAR_KEY_DEEPSEEK' },
};

let n = 0;
for (const [id, probe] of Object.entries(probes)) {
  if (!byId[id]) { console.error('!! 未找到服务商:', id); continue; }
  byId[id].probe = probe;
  n++;
}
await writeFile(file, JSON.stringify(providers, null, 2) + '\n');
console.log(`probe configs injected: ${n}/${Object.keys(probes).length}`);
