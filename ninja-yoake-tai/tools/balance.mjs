// 戦闘の試算：章ごとの目安レベルの隊で、地図の群れ・ボスと何度も戦う（おまかせの命令）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const G = require('./load.cjs');
const ST = G.NYT_STATE, BT = G.NYT_BATTLE, EN = G.NYT_ENEMIES;
const N = +(process.argv[2] || 40);
function party(ids, lv, extra) {
  const S = ST.fresh('テスト');
  S.members.hero.lv = lv;
  ids.forEach(id => { if (id !== 'hero') ST.addMember(S, id, lv); });
  S.order.forEach(id => { S.members[id].lv = lv; });
  (extra || []).forEach(f => f(S));
  ST.healAll(S);
  S.items = { kizugusuri: 5, kitsuke: 1 };
  return S;
}
function fight(Sbase, enemies, seed, opts) {
  const S = JSON.parse(JSON.stringify(Sbase));
  const B = BT.create(S, Object.assign({ enemies, seed }, opts || {}));
  const res = BT.runAuto(B, 3000);
  const fr = BT.front(B);
  const hpLost = fr.reduce((a, u) => a + (1 - u.hp / u.mhp), 0) / fr.length;
  return { res, rounds: B.round, hpLost, kos: fr.filter(u => u.ko).length };
}
function report(name, Sb, groups, opts) {
  let w = 0, r = 0, hl = 0, n = 0, ko = 0;
  for (let i = 0; i < N; i++) for (const g of groups) {
    const o = fight(Sb, g, 1000 + i * 31 + n, opts); n++;
    if (o.res === 'win') w++; r += o.rounds; hl += o.hpLost; ko += o.kos;
  }
  console.log(`${name.padEnd(28)} 勝率 ${(100 * w / n).toFixed(0).padStart(3)}%  平均ラウンド ${(r / n).toFixed(1).padStart(4)}  HP減 ${(100 * hl / n).toFixed(0).padStart(3)}%  倒れた ${(ko / n).toFixed(2)}`);
}
const P = EN.POOLS;
const ch1 = ['hero', 'sakuya', 'oen', 'xiaolan'];
report('序 村 Lv1 (主人公+咲耶)', party(['hero', 'sakuya'], 1), P.village);
report('1章 森 Lv4', party(ch1, 4), P.forest);
report('1章 森 Lv7', party(ch1, 7), P.forest);
report('1章 洞 Lv8', party(ch1, 8), P.inari);
report('1章 ボス Lv9', party(ch1, 9), [['ponpoko']], { noFlee: true });
report('1章 ボス Lv7', party(ch1, 7), [['ponpoko']], { noFlee: true });
const ch2 = ['hero', 'hayate', 'yui', 'xiaolan'];
report('2章 山 Lv11', party(ch2, 11), P.kirimichi);
report('2章 岩屋 Lv14', party(ch2, 14), P.iwaya);
report('2章 ボス Lv15', party(ch2, 15), [['kirigumo']], { noFlee: true });
report('2章 ボス Lv13', party(ch2, 13), [['kirigumo']], { noFlee: true });
const ch3 = ['hero', 'fuuta', 'hinanojoh', 'oen'];
report('3章 浜 Lv17', party(ch3, 17), P.hama);
report('3章 洞 Lv20', party(ch3, 20), P.umidou);
report('3章 ボス Lv21', party(ch3, 21), [['umibozu']], { noFlee: true });
report('3章 ボス Lv19', party(ch3, 19), [['umibozu']], { noFlee: true });
const ch4 = ['hero', 'kohaku', 'yui', 'magoichi'];
report('4章 嶺 Lv23', party(ch4, 23), P.kuromine);
report('4章 砦 Lv26', party(ch4, 26), P.toride);
report('4章 アトザ Lv26', party(['hero', 'sakuya', 'kohaku', 'yui'], 26), [['d_atoza']], { noFlee: true });
report('4章 ボス影 Lv27', party(ch4, 27), [['yogarasu_kage']], { noFlee: true });
report('4章 ボス影 Lv25', party(ch4, 25), [['yogarasu_kage']], { noFlee: true });
const ch5 = ['hero', 'jin', 'sattva', 'magoichi'];
report('終章 根の国 Lv31', party(ch5, 31), P.nenokuni);
report('終章 ボス Lv34', party(ch5, 34), [['yogarasu']], { noFlee: true });
report('終章 ボス Lv32', party(ch5, 32), [['yogarasu']], { noFlee: true });
