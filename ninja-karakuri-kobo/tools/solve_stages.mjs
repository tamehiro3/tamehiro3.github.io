// 運営ステージと見本を、検査と解答機で確かめる（開発用）
//   node ninja-karakuri-kobo/tools/solve_stages.mjs            # 全部
//   node ninja-karakuri-kobo/tools/solve_stages.mjs 5 12       # 番号を指定
//   node ninja-karakuri-kobo/tools/solve_stages.mjs --write    # 結果を solutions.js に書き出す（お手本の再生と目標タイムに使う）
// 解答機が見つけた入力は engine.replay で再生し直して、クリアできることを確かめる。
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js'));
globalThis.KK_DATA = D;
const E = require(path.join(ROOT, 'engine.js'));
globalThis.KK_ENGINE = E;
const R = require(path.join(ROOT, 'rules.js'));
const S = require(path.join(ROOT, 'solver.js'));
const { STAGES, TEMPLATES } = require(path.join(ROOT, 'stages.js'));

const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.filter(a => /^\d+$/.test(a)).map(Number);
const onlyT = args.filter(a => /^[a-z_]+$/.test(a));
const prevPath = path.join(ROOT, 'solutions.js');
let prev = {};
if (fs.existsSync(prevPath)) { try { prev = require(prevPath).SOLUTIONS || {}; } catch (e) { prev = {}; } }

const out = Object.assign({}, prev);
let bad = 0;
const list = STAGES.map(s => ({ key: String(s.id), s })).concat(TEMPLATES.map(t => ({ key: t.id, s: t })));
for (const { key, s } of list) {
  if ((only.length || onlyT.length) && !only.includes(Number(key)) && !onlyT.includes(key)) continue;
  let lv;
  try { lv = R.fromAscii(s.rows, Object.assign({ theme: s.theme }, s.meta || {})); } catch (e) { console.log(key, 'ASCII ERROR', e.message); bad++; continue; }
  const v = R.validate(lv);
  const active = R.countActive(lv);
  const line = [key.padStart(11), 'parts', String(lv.parts.length).padStart(2), 'active', String(active).padStart(2)];
  if (!v.ok) { console.log(line.join(' '), 'INVALID:', v.errors.map(e => e.msg + (e.at ? `(${e.at.x},${e.at.y})` : '')).join(' / ')); bad++; continue; }
  const t0 = Date.now();
  let r = S.solve(lv, { maxNodes: 900000 });
  if (!r.ok) r = S.solve(lv, { maxNodes: 1500000, weight: 1, gw: 0.25 });
  if (!r.ok) r = S.solve(lv, { maxNodes: 1500000, weight: 3, K: 3 });
  const ms = Date.now() - t0;
  const warn = v.warnings.map(w => w.code).join(',');
  if (!r.ok) { console.log(line.join(' '), 'UNSOLVED', r.reason, 'expanded', r.expanded, ms + 'ms', warn); bad++; continue; }
  const sec = r.frames / 60;
  console.log(line.join(' '), 'OK', sec.toFixed(1) + 's', 'jumps?', 'expanded', r.expanded, ms + 'ms', warn ? 'warn:' + warn : '');
  out[key] = { frames: r.frames, hash: R.contentHash(lv), runs: r.runs };
}
if (write) {
  const body = '/* 解答機（tools/solve_stages.mjs）が見つけた、運営ステージと見本のクリアの入力（お手本の再生・目標タイム・テストに使う）。手で書き換えない */\n' +
    '(function (root) {\n  var SOLUTIONS = ' + JSON.stringify(out) + ';\n  if (typeof module !== \'undefined\' && module.exports) module.exports = { SOLUTIONS: SOLUTIONS };\n  root.KK_SOLUTIONS = SOLUTIONS;\n})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(prevPath, body);
  console.log('solutions.js written', Object.keys(out).length);
}
console.log(bad ? `NG: ${bad}` : 'all ok');
process.exit(bad ? 1 : 0);
