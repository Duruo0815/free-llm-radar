// 项目体检脚本：数据一致性 + 工作流覆盖检查（可重复运行）
import { readFile } from 'node:fs/promises';

const p = JSON.parse(await readFile('data/providers.json', 'utf8'));
const probes = p.filter((x) => x.probe);
const keyEnvs = [...new Set(probes.filter((x) => x.probe.keyEnv).map((x) => x.probe.keyEnv))];

console.log('providers:', p.length, '| probe 配置:', probes.length, '| 需密钥:', keyEnvs.length);

let fail = 0;
for (const wf of ['.github/workflows/probe.yml', '.github/workflows/probe-cn.yml']) {
  const yml = await readFile(wf, 'utf8');
  const missing = keyEnvs.filter((k) => !yml.includes(k + ':'));
  if (missing.length) { fail++; console.log('✗', wf, '缺少 env:', missing.join(', ')); }
  else console.log('✓', wf, 'env 全覆盖');
}

const ids = p.map((x) => x.id);
if (new Set(ids).size !== ids.length) { fail++; console.log('✗ id 有重复'); } else console.log('✓ id 唯一');

const bad = p.filter((x) => !x.id || !x.name || !x.region || !x.freeType || !x.website || !x.freeDesc);
if (bad.length) { fail++; console.log('✗ 必填字段缺失:', bad.map((x) => x.id).join(',')); } else console.log('✓ 必填字段完整');

const regions = new Set(['国内', '国际']);
const types = new Set(['永久免费', '限时免费', '免费额度', '新人赠送', '部分免费']);
const badEnum = p.filter((x) => !regions.has(x.region) || !types.has(x.freeType) || (x.kind && !['中转聚合', 'agent'].includes(x.kind)));
if (badEnum.length) { fail++; console.log('✗ 枚举值非法:', badEnum.map((x) => x.id).join(',')); } else console.log('✓ 枚举值合法');

const intl = JSON.parse(await readFile('data/status.json', 'utf8'));
const cn = JSON.parse(await readFile('data/status-cn.json', 'utf8'));
console.log('✓ intl results:', Object.keys(intl.results).length, '| cn results:', Object.keys(cn.results).length);
const missingInCn = p.filter((x) => !cn.results[x.id]).map((x) => x.id);
if (missingInCn.length) console.log('! cn 视角缺少:', missingInCn.join(','));

const histI = JSON.parse(await readFile('data/history.json', 'utf8'));
const histC = JSON.parse(await readFile('data/history-cn.json', 'utf8'));
console.log('✓ history:', histI.length, '轮 / cn:', histC.length, '轮');

console.log(fail === 0 ? '=== ALL CHECKS PASSED ===' : `=== ${fail} 项未通过 ===`);
process.exit(fail === 0 ? 0 : 1);
