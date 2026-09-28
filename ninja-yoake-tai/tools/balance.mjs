// 勝率のめやす（開発用）：NPC だけのチームで何試合も回して、勝率・残った結界・ダウン数を見る
//   node ninja-yoake-tai/tools/balance.mjs                 # ふつう・4任務・役割いろいろ
//   node ninja-yoake-tai/tools/balance.mjs 30 hard         # 30試合ずつ・むずかしい
//   node ninja-yoake-tai/tools/balance.mjs 30 normal standard
// 1人目の枠は「人のかわり」：うっかり度（casual）を上げると、技を思い出すのが遅れ、予告に気づかないことがある。
// 人が遊んだときの勝率そのものではない（めやす）。設計書の目標は、標準難易度で勝率55〜75%。
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js')); globalThis.NYT_DATA = D;
const AI = require(path.join(ROOT, 'ai.js')); globalThis.NYT_AI = AI;
const S = require(path.join(ROOT, 'sim.js'));

const N = +process.argv[2] || 16, diff = process.argv[3] || 'normal', only = process.argv[4] || null;
const comps = [['vanguard', 'guard', 'medic'], ['guard', 'vanguard', 'medic'], ['medic', 'vanguard', 'guard'], ['vanguard', 'vanguard', 'vanguard'], ['guard', 'guard', 'guard'], ['medic', 'medic', 'medic']];
const missions = only ? [only] : D.MISSION_IDS;
function play(seed, roles, mid, casual) {
  const tpl = D.MISSIONS[mid];
  const sets = tpl.enemySets.filter(id => D.setCost(id) <= D.DIFF[diff].budget);
  const seen = {};
  const members = roles.map((r, i) => { const alt = seen[r]; seen[r] = 1; return { id: 'm' + i, kind: 'npc', name: 'm' + i, role: r, jutsu: (alt ? D.NPC_JUTSU_ALT : D.NPC_JUTSU)[r] }; });
  const M = S.createMatch({ seed: seed * 7919 + 13, difficulty: diff, mission: { mission_template_id: mid, enemy_set_id: sets[seed % sets.length], support_event_id: tpl.supports[seed % tpl.supports.length], objective_variant_id: 'none' }, members });
  if (casual) M.members[0].ai.casual = casual;
  S.start(M);
  let guard = 0;
  while (M.state !== 'Result' && guard++ < 30 * 700) { S.step(M, 1 / 30, {}); M.events.length = 0; }
  const downs = M.members.reduce((a, m) => a + m.stats.downs, 0);
  return { win: M.result.outcome === 'win', reason: M.result.reason, barrier: M.barrier.hp / M.barrier.max, downs };
}
for (const casual of [0, 0.6, 0.9]) {
  console.log(casual ? `\n1人目を「人のかわり」（うっかり度 ${casual}）にした場合` : 'NPC 3人');
  let tw = 0, tn = 0;
  for (const mid of missions) {
    for (const roles of comps) {
      let w = 0, b = 0, dn = 0; const why = {};
      for (let s = 1; s <= N; s++) { const r = play(s, roles, mid, casual); if (r.win) w++; b += r.barrier; dn += r.downs; why[r.reason] = (why[r.reason] || 0) + 1; }
      tw += w; tn += N;
      console.log(`${mid.padEnd(9)} ${roles.map(r => D.ROLES[r].name).join('・')}  勝率 ${(w / N * 100).toFixed(0).padStart(3)}%  結界 ${(b / N * 100).toFixed(0).padStart(3)}%  ダウン ${(dn / N).toFixed(1)}  ${JSON.stringify(why)}`);
    }
  }
  console.log(`→ 全体の勝率 ${(tw / tn * 100).toFixed(0)}%`);
}
