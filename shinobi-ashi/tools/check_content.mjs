// 忍び足 — 文章（content.js の SA.TEXT）の検査。
//   node shinobi-ashi/tools/check_content.mjs          … 検査（不合格があれば終了コード1）
//   node shinobi-ashi/tools/check_content.mjs --list   … 読みが2通り以上ある語の一覧も出す（目で確かめる用）
// 確かめること（docs/SPEC.md 0章・2.7）:
//   - ふりがな書式 {漢字|かな} の崩れ（{ } | の対応、入れ子、親字が漢字だけか、読みがひらがなだけか）
//   - ルビのない漢字（決まった例外を除き 0 字であること）
//   - 本数: bond 8体×12、greet 39、sekki 24（rules.js の二十四節気と同じ名前）、special 6、idle 31体×2〜3、
//           stations 51（data.js の STATIONS と同じ順）、atoza 3〜4、jin、zukan 39、parent、help、stamps 12、
//           official（chars.js の公式データのふりがな版。ふりがなを外すと chars.js と同じ字であること）
//   - 名前・クランの読み（甲賀=こうか など）、差し込み {name} などの置き場所
//   - 書かないこと: 怖い・痛い言葉、ひみつの術の技名と銃、比べる言葉、夜道・早朝のすすめ、公認・コラボ、
//     宿場の小話の年号・料金・営業時間
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = require(path.join(ROOT, 'data.js'));
const CH = require(path.join(ROOT, 'chars.js'));
const T = require(path.join(ROOT, 'content.js'));
let R = null;
try { R = require(path.join(ROOT, 'rules.js')); } catch (e) { R = null; }
const LIST = process.argv.includes('--list');

let pass = 0, fail = 0;
const warns = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  NG: ' + msg); } }
function section(t) { console.log('■ ' + t); }
function keysEq(obj, ids, msg) {
  const a = Object.keys(obj || {}).slice().sort(), b = ids.slice().sort();
  const miss = b.filter(x => !a.includes(x)), extra = a.filter(x => !b.includes(x));
  ok(!miss.length && !extra.length, msg + (miss.length ? ' 足りない: ' + miss.join(',') : '') + (extra.length ? ' 余分: ' + extra.join(',') : ''));
}

const IDS = CH.CHARS.map(c => c.id);
const FIRST8 = D.FIRST8;
const OTHERS = IDS.filter(id => !FIRST8.includes(id));

/* ---------- 文字の種類 ---------- */
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;   // 漢字・々・〆・ヶ
const KANJI_G = new RegExp(KANJI.source, 'g');
const BASE_OK = /^[㐀-䶿一-鿿豈-﫿々〆ヶノ]+$/;  // 親字: 漢字と々〆ヶ、蛇ノ目のノ
const READ_OK = /^[ぁ-ゖー]+$/;  // 読み: ひらがな（と長音）

// 差し込みを許す場所
const PLACEHOLDERS = {
  'special.': ['name', 'rank', 'days', 'dye'],
  'parent.gateAsk3': ['num', 'order'],
  'parent.gateAsk': ['nums']
};
// ルビなしの漢字を許す場所（関門の問題文は、ふりがななしが仕掛け）
const NO_RUBY_OK = [/^parent\.gateAsk3?$/, /^parent\.gateNums\.\d+$/];

function allowedPH(p) {
  for (const k in PLACEHOLDERS) if (p === k || p.startsWith(k)) return PLACEHOLDERS[k];
  return [];
}

/* {漢字|かな} を解く。戻り値: { errors, plain(漢字の形), kana(かなの形), pairs:[[base,read]], bare(ルビなし漢字の数) } */
function parse(s, p) {
  const errors = [], pairs = [];
  let plain = '', kana = '', bare = 0, i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '{') {
      const j = s.indexOf('}', i + 1);
      const k = s.indexOf('{', i + 1);
      if (j < 0) { errors.push('「{」が閉じていない: ' + s.slice(i, i + 12)); break; }
      if (k >= 0 && k < j) { errors.push('「{」が入れ子になっている: ' + s.slice(i, j + 1)); i = k; continue; }
      const inner = s.slice(i + 1, j);
      if (/^[a-z]+$/.test(inner)) {
        if (!allowedPH(p).includes(inner)) errors.push('ここでは使えない差し込み {' + inner + '}');
        plain += '〈' + inner + '〉'; kana += '〈' + inner + '〉';
      } else {
        const parts = inner.split('|');
        if (parts.length !== 2) errors.push('「|」の数がおかしい: {' + inner + '}');
        else {
          const [base, read] = parts;
          if (!base || !BASE_OK.test(base)) errors.push('親字が漢字だけではない: {' + inner + '}');
          if (!read || !READ_OK.test(read)) errors.push('読みがひらがなだけではない: {' + inner + '}');
          if (read && base && read.length < base.replace(/ノ/g, '').length * 0.5) errors.push('読みが短すぎる: {' + inner + '}');
          pairs.push([base, read]);
          plain += base; kana += read;
        }
      }
      i = j + 1;
      continue;
    }
    if (ch === '}') errors.push('対応しない「}」: …' + s.slice(Math.max(0, i - 8), i + 1));
    if (ch === '|') errors.push('書式の外の「|」: …' + s.slice(Math.max(0, i - 8), i + 1));
    if (KANJI.test(ch)) bare++;
    plain += ch; kana += ch;
    i++;
  }
  return { errors, plain, kana, pairs, bare };
}

/* ---------- すべての文字列を集める ---------- */
const STR = [];  // { p, s }
function walk(v, p) {
  if (typeof v === 'string') STR.push({ p, s: v });
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '.' + i));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], p ? p + '.' + k : k));
}
walk(T, '');
const BY = {};   // path -> parsed
for (const { p, s } of STR) BY[p] = Object.assign(parse(s, p), { s });
const plainOf = p => BY[p] ? BY[p].plain : '';

/* ---------- 1. 形と本数 ---------- */
section('形と本数');
const TOP = ['bond', 'greet', 'sekki', 'special', 'idle', 'stations', 'atoza', 'jin', 'zukan', 'parent', 'help', 'stamps', 'official'];
keysEq(T, TOP, 'SA.TEXT の項目');
keysEq(T.bond, FIRST8, 'bond は最初の8体');
for (const id of FIRST8) ok(Array.isArray(T.bond[id]) && T.bond[id].length === D.BOND_LINES_AT.length, 'bond.' + id + ' は ' + D.BOND_LINES_AT.length + '本（' + (T.bond[id] || []).length + '）');
ok(D.BOND_LINES_AT.length === 12, 'BOND_LINES_AT は12段');
keysEq(T.greet, IDS, 'greet は39体');
ok(Object.keys(T.greet).length === 39, 'greet 39本');
keysEq(T.zukan, IDS, 'zukan は39体');
keysEq(T.idle, OTHERS, 'idle は最初の8体以外の31体');
ok(OTHERS.length === 31, '最初の8体以外は31体');
for (const id of OTHERS) { const n = (T.idle[id] || []).length; ok(n >= 2 && n <= 3, 'idle.' + id + ' は2〜3本（' + n + '）'); }
const SPECIAL6 = ['cap', 'rest', 'rankUp', 'menkyo', 'okugi', 'jinReveal'];
for (const k of SPECIAL6) ok(typeof T.special[k] === 'string' && T.special[k].includes('{name}'), 'special.' + k + ' があり {name} を含む');
ok(T.special.rankUp.includes('{rank}'), 'special.rankUp は {rank} を含む');
ok(/{今日\|きょう}はここまで。あとは{休\|やす}むのも{修行\|しゅぎょう}/.test(T.special.cap), 'special.cap は「今日はここまで。あとは休むのも修行」');
ok(Array.isArray(T.atoza) && T.atoza.length >= 3 && T.atoza.length <= 4, 'atoza は3〜4行');
ok(T.atoza.some(l => l.includes('アトザ')), 'atoza にアトザが出る');
ok(typeof T.jin.shadow === 'string' && Array.isArray(T.jin.reveal) && T.jin.reveal.length >= 2, 'jin.shadow と jin.reveal（2本以上）');
ok(!/刃|じん/.test(plainOf('jin.shadow')) && !/刃/.test(plainOf('greet.jin')), '刃の影と来訪のあいさつには名前を出さない');
ok(T.jin.reveal.some(l => l.includes('{刃|じん}')), 'jin.reveal で刃が名乗る');
ok(T.special.jinReveal.includes('{刃|じん}'), 'special.jinReveal で刃の名が出る');
ok(Array.isArray(T.stamps) && T.stamps.length === 12 && new Set(T.stamps).size === 12, 'stamps は12種で重なりなし');
for (let i = 0; i < T.stamps.length; i++) ok(plainOf('stamps.' + i).length <= 10, 'stamps.' + i + ' は短い言葉（10字以内）');
ok(Array.isArray(T.help) && T.help.length >= 8 && T.help.length <= 14, 'help は8〜14問（' + T.help.length + '）');
T.help.forEach((h, i) => ok(h && typeof h.q === 'string' && typeof h.a === 'string' && h.q && h.a, 'help.' + i + ' に q と a'));
ok(T.help.some(h => /{歩|ある}きながら/.test(h.q)), 'help に「歩きながら見てもいい？」がある');

/* ---------- 2. 二十四節気 ---------- */
section('二十四節気');
const SEKKI24 = ['立春', '雨水', '啓蟄', '春分', '清明', '穀雨', '立夏', '小満', '芒種', '夏至', '小暑', '大暑',
  '立秋', '処暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];
keysEq(T.sekki, SEKKI24, 'sekki は24節気');
for (const k of SEKKI24) ok(typeof T.sekki[k] === 'string' && T.sekki[k].includes('{' + k + '|'), 'sekki.' + k + ' に節気の名（ふりがな付き）が入る');
if (R && R.solarTerm) {
  const got = new Set(); let d = '2026-01-01';
  for (let n = 0; n < 366; n++) { const t = R.solarTerm(d); if (t) got.add(t.name); d = R.addDays(d, 1); }
  keysEq(T.sekki, [...got], 'rules.js の solarTerm が返す名前と sekki のキーが同じ');
} else warns.push('rules.js が読めないので、節気の名前は表だけで確かめた');

/* ---------- 3. 宿場 ---------- */
section('宿場の小話');
ok(T.stations.length === D.STATIONS.length && D.STATIONS.length === 51, 'stations は51件（' + T.stations.length + '）');
const names = T.stations.names || [];
D.STATIONS.forEach((s, i) => ok(names[i] === s.name, '宿場' + i + ' の並び: ' + s.name + (names[i] === s.name ? '' : ' ≠ ' + names[i])));
T.stations.forEach((st, i) => {
  ok(st && typeof st.tale === 'string' && st.tale.length > 10, '宿場' + i + ' に小話');
  ok(Object.keys(st).join() === 'tale', '宿場' + i + ' の項目は tale だけ');
  const pl = plainOf('stations.' + i + '.tale');
  const n = pl.split(/[。！？]/).filter(x => x.trim()).length;
  ok(n >= 1 && n <= 2, '宿場' + i + ' の小話は1〜2文（' + n + '）');
  ok(!/\d+\s*年|[一二三四五六七八九十百千]+年|円|文銭|営業|定休|\d+\s*時|料金|入場/.test(pl), '宿場' + i + ' に年号・料金・営業時間がない');
});
ok(/{待|ま}って/.test(T.stations[17].tale), '宿場17（吉原）はアトザの場面へつなぐ');
ok(D.STATIONS[17].event === 'atoza', 'data.js の宿場17は atoza の場面');

/* ---------- 4. ふりがな書式 ---------- */
section('ふりがな書式');
let nStr = 0, nPair = 0, bareTotal = 0;
for (const { p } of STR) {
  const r = BY[p]; nStr++; nPair += r.pairs.length;
  for (const e of r.errors) ok(false, p + ': ' + e);
  const exempt = NO_RUBY_OK.some(re => re.test(p));
  if (!exempt) {
    bareTotal += r.bare;
    if (r.bare) ok(false, p + ': ルビのない漢字が ' + r.bare + '字 「' + r.s.replace(/\{[^{}]*\}/g, '').match(KANJI_G).join('') + '」');
  }
  // ルビのない漢字が多い文（UI の e2e と同じ考え方: 漢字の半分以上がルビなし）
  const kanjiAll = (r.plain.match(KANJI_G) || []).length;
  if (!exempt && kanjiAll >= 4 && r.bare * 2 >= kanjiAll) ok(false, p + ': ルビのない漢字が多い文');
}
ok(bareTotal === 0, 'ルビのない漢字は0字（例外の関門の問題文を除く）');
ok(STR.every(({ p }) => !BY[p].errors.length), 'すべての文字列で書式が崩れていない');
// 書式を ruby にしてみて、記号が残らないこと
function furi(s) { return s.replace(/\{([^|{}]+)\|([^{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>'); }
for (const { p, s } of STR) {
  const h = furi(s).replace(/\{[a-z]+\}/g, '');
  if (/[{}|]/.test(h)) ok(false, p + ': ruby にしたあとに { } | が残る');
}
ok(true, '文字列 ' + nStr + ' 本、ふりがな ' + nPair + ' 組');

/* ---------- 5. 読み ---------- */
section('名前・クランの読み');
const MUST = {
  '刃': 'じん', '咲耶': 'さくや', '狐白': 'こはく', '柴': 'しば', '金鬼': 'かなおに', '於兎': 'おと', '呂屯': 'ろとん',
  '凪紗': 'なぎさ', '餡音': 'あんね', '断': 'だん', '雛之丞': 'ひなのじょう', '酉花': 'とりか', '宇迦': 'うか', '岩爺': 'がんじ',
  '結': 'ゆい', '風太': 'ふうた', '令': 'れい', '猫又': 'ねこまた', '蛇ノ目': 'じゃのめ', '弁天': 'べんてん', '紫苑': 'しおん',
  '瀬織': 'せおり', '久遠': 'くおん', '孫市': 'まごいち', '石舟斎': 'せきしゅうさい',
  '甲賀': 'こうか', '雑賀': 'さいか', '風魔': 'ふうま', '伊賀': 'いが', '天界': 'てんかい',
  '修行': 'しゅぎょう', '相棒': 'あいぼう', '宿場': 'しゅくば', '免許皆伝': 'めんきょかいでん', '奥義': 'おうぎ', '巻物': 'まきもの',
  '忍術': 'にんじゅつ', '歩数': 'ほすう', '修行値': 'しゅぎょうち', '修行枠': 'しゅぎょうわく', '端末': 'たんまつ', '家族': 'かぞく',
  '大典太': 'おおでんた', '人身御供': 'ひとみごくう', '飯綱': 'いづな', '焔': 'ほむら', '於菟': 'おと', '瀬織津姫': 'せおりつひめ', '気吹戸主': 'いぶきどぬし'
};
// 名前の字がほかの意味で使われることがある（結ぶ・断る・令和 など）ので、名前の確かめは「1字の親字がそれだけで立っているとき」に限る
const AMBIG_ONE = { '結': ['むす'], '断': [], '令': [], '柴': [], '刃': [] };
const READS = {};  // base -> Set(read)
const WHERE = {};
for (const { p } of STR) for (const [b, r] of BY[p].pairs) {
  (READS[b] = READS[b] || new Set()).add(r);
  (WHERE[b + '|' + r] = WHERE[b + '|' + r] || []).push(p);
}
for (const b in MUST) {
  if (!READS[b]) continue;
  const bad = [...READS[b]].filter(r => r !== MUST[b] && !(AMBIG_ONE[b] || []).includes(r));
  ok(!bad.length, '「' + b + '」の読みは ' + MUST[b] + (bad.length ? '（ちがう読み: ' + bad.map(r => r + ' @' + WHERE[b + '|' + r][0]).join(', ') + '）' : ''));
}
// chars.js の名前（漢字の名）は、必ずふりがな付きで出ていること（ルビなし0字の検査で担保）＋ greet に自分の名前
for (const c of CH.CHARS) {
  if (c.id === 'jin') continue;
  const g = plainOf('greet.' + c.id);
  ok(g.includes(c.name) || g.includes(c.name.replace(/ノ/g, '')), 'greet.' + c.id + ' で名乗る（' + c.name + '）');
}
// 読みが2通り以上ある語（2字以上の親字）。多くは正しい（一日=いちにち/ついたち 等）ので、ここは一覧だけ
const multi = Object.keys(READS).filter(b => b.length >= 2 && READS[b].size > 1);
if (multi.length) warns.push('読みが2通りある語: ' + multi.map(b => b + '=' + [...READS[b]].join('/')).join('、'));
if (LIST) {
  console.log('  1字の親字で読みが複数のもの:');
  Object.keys(READS).filter(b => b.length === 1 && READS[b].size > 1).forEach(b => console.log('    ' + b + ' = ' + [...READS[b]].join(' / ')));
}

/* ---------- 6. 書かないこと ---------- */
section('書かないこと');
const KIDS = /^(bond|greet|sekki|special|idle|stations|atoza|jin|zukan|help|stamps)\b/;
const BAN_ALL = [
  ['毒', '毒'], ['死', '死'], ['殺', '殺'], ['血', '血'], ['痛', '痛い'], ['怖', '怖い（漢字）'], ['恐', '恐い'], ['呪', '呪い'],
  ['襲', '襲う'], ['倒す', '倒す'], ['戦い', '戦い'], ['戦闘', '戦闘'], ['敵', '敵'], ['刺', '刺す'], ['斬', '斬る'], ['怪我', 'けが'],
  ['銃', '銃（孫市の銃は出さない）'], ['人身御供', 'ひみつの術'], ['丑の刻', 'ひみつの術'], ['泰山府君', 'ひみつの術'], ['一発必中', 'ひみつの術'],
  ['花魁', '花魁'], ['酒', 'お酒'], ['恋', '恋愛'], ['好きな人', '恋愛'], ['結婚', '恋愛'],
  ['公認', '公認'], ['コラボ', 'コラボ'], ['ガチャ', '（parent の「ありません」以外）'],
  ['早朝', '早朝のすすめ'], ['夜道', '夜道'], ['夜中', '夜中'], ['真夜中', '真夜中'], ['朝早く', '早朝'], ['早起きして歩', '早朝'],
  ['もっと歩', '歩きすぎのすすめ'], ['もっともっと', '歩きすぎ'], ['限界', '歩きすぎ'], ['休まず', '歩きすぎ'], ['毎日歩かないと', 'おどし'],
  ['いちばん速', '比べる'], ['一番速', '比べる'], ['だれよりも', '比べる'], ['誰よりも', '比べる'], ['ほかの人より', '比べる'], ['みんなより', '比べる'],
  ['1位', '比べる'], ['順位', '比べる'], ['ランキング', '（parent の「ありません」以外）'], ['課金', '（parent の「ありません」以外）'], ['連続', '（parent の「表示せず」以外）']
];
const PARENT_OK = ['ガチャ', 'ランキング', '課金', '連続'];
// official.* は chars.js の公式データの写し（ゲームの文章ではない）。下の「公式データ」の節で、字が chars.js と同じかを確かめる
const isOfficial = p => /^official\./.test(p);
for (const { p } of STR) {
  if (isOfficial(p)) continue;
  const r = BY[p];
  const text = r.plain + ' ' + r.kana;
  for (const [w, why] of BAN_ALL) {
    if (!text.includes(w)) continue;
    if (p.startsWith('parent.') && PARENT_OK.includes(w)) continue;
    ok(false, p + ': 「' + w + '」を書かない（' + why + '）: ' + r.plain);
  }
}
// こども向けの文で「こわい」は「こわくない／こわそう／こわく見える」の打ち消し・見た目の話だけ
for (const { p } of STR) {
  if (!KIDS.test(p)) continue;
  const pl = BY[p].plain;
  let i = -1;
  while ((i = pl.indexOf('こわ', i + 1)) >= 0) {
    const x = pl.slice(i, i + 4);
    ok(/^(こわく|こわそ|こわい？)/.test(x), p + ': 「' + x + '」は打ち消しか見た目の話だけ');
  }
}
// 「公式」は「非公式」「公式の設定ではありません」だけ
for (const { p } of STR) {
  const pl = BY[p].plain; let i = -1;
  while ((i = pl.indexOf('公式', i + 1)) >= 0) {
    const okUse = pl[i - 1] === '非' || pl.slice(i).startsWith('公式の設定ではありません');
    ok(okUse, p + ': 「公式」は非公式の表記だけ: ' + pl.slice(Math.max(0, i - 6), i + 10));
  }
}
// ひみつの術の4体の技名（chars.js の jutsu）が文章に出ない
for (const id of D.SECRET_JUTSU) {
  const j = CH.BY_ID[id].jutsu;
  ok(!STR.some(({ p }) => !isOfficial(p) && BY[p].plain.includes(j)), 'ひみつの術「' + j + '」（' + id + '）を書かない（公式データの写しを除く）');
}
// 公式紹介文にない関係を作らない: 「父」「母」「兄」「姉」「弟」「妹」「孫」「娘」「双子」は bio と合う組だけ
const KIN = /父|母|兄|姉|弟|妹|孫|娘|双子/;
const KIN_OK = { // id: その体の文章で使ってよい続柄の字
  sakuya: '孫双子', kohaku: '双子', ganzi: '孫娘', yui: '母', rei: '母娘', atoza: '弟', aum: '兄', uka: '姉妹', izuna: '姉妹',
  ichiya: '姉', nemu: '弟姉'
};
for (const { p } of STR) {
  const m = /^(bond|greet|idle|zukan)\.([a-z]+)/.exec(p);
  if (!m) continue;
  const id = m[2];
  let pl = BY[p].plain;
  for (const c of CH.CHARS) pl = pl.split(c.name).join('＊');   // 孫市 などの名前の字は続柄ではない
  const found = (pl.match(new RegExp(KIN.source, 'g')) || []);
  for (const f of found) ok((KIN_OK[id] || '').includes(f), p + ': 続柄「' + f + '」は公式紹介文にある関係だけ');
}

/* ---------- 7. おうちの方へ ---------- */
section('おうちの方へ');
const P = T.parent;
for (const k of ['short', 'detail', 'privacy', 'gate', 'claims', 'exportNote', 'medical', 'unofficial', 'erase', 'permission'])
  ok(P[k] && (typeof P[k] === 'string' || Array.isArray(P[k])), 'parent.' + k + ' がある');
ok(Array.isArray(P.privacy) && P.privacy.length === 4, 'parent.privacy は4つの主張');
ok(Array.isArray(P.claims) && P.claims.map(c => c.key).join() === 'steps,location,age,link', 'parent.claims は 歩数・位置・年齢・つながり');
const pp = k => plainOf('parent.' + k);
ok(/インターネットに送ることはありません/.test(plainOf('parent.claims.0.text')), '歩数: アプリが歩数をインターネットに送ることはない');
ok(/位置情報の権限は求めません/.test(plainOf('parent.claims.1.text')) && /端末にも残りません/.test(plainOf('parent.claims.1.text')), '位置: 権限を求めない・座標は端末にも残らない');
ok(/年齢や名前は聞きません/.test(plainOf('parent.claims.2.text')) && /4点だけ/.test(plainOf('parent.claims.2.text')), '年齢: 聞かない・変わるのは4点だけ');
ok(/チャット・フレンド・ランキングはありません/.test(plainOf('parent.claims.3.text')) && /目の前/.test(plainOf('parent.claims.3.text')) && /QR/.test(plainOf('parent.claims.3.text')), 'つながり: チャット等なし・目の前の家族と QR だけ');
ok(new RegExp('直近' + D.CONFIG.RECENT_DAYS + '日分の歩数').test(pp('exportNote')) && /自分で選んで/.test(pp('exportNote')), '書き出しファイルに直近7日の歩数・送る相手は自分で選ぶ');
ok(/医療・診断/.test(pp('medical')) && /ではありません/.test(pp('medical')), '医療・診断の目的ではない');
ok(pp('unofficial') === 'CryptoNinja（CC0・Ninja DAO）のキャラクターを使った個人制作の非公式ファンゲームです。', '非公式の表記が決まりの文と同じ');
ok(/関門/.test(pp('gate')) && /3秒/.test(pp('gate')) && /1分/.test(pp('gate')), '関門の説明（3秒長押し・1分待つ）');
// 関門の説明は子どもも関門なしで読める。解き方（問題の例・漢数字の読み・「〜の順に押す」）を書かない
ok(!/順に押|[〇一二三四五六七八九]、[〇一二三四五六七八九]|数字のボタン/.test(pp('gate')) && !/[〇一二三四五六七八九]/.test(pp('gate')), '関門の説明に解き方（問題の例・漢数字）を書かない');
ok(/{[〇一二三四五六七八九]\|/.test(P.gate) === false, '関門の説明に漢数字の読みを書かない');
// 使っている部品（MPL-2.0 §3.2: 実行形式で配るときは、ソースの入手先とライセンスを知らせる）
ok(typeof P.parts === 'string' && /QR/.test(pp('parts')) && /LICENSES\.md/.test(pp('parts')), 'parent.parts（ブラウザ版の部品）');
ok(typeof P.partsApp === 'string' && /Capacitor/.test(pp('partsApp')) && /@capgo\/capacitor-pedometer/.test(pp('partsApp')) && /LICENSES\.md/.test(pp('partsApp')), 'parent.partsApp（アプリ版の部品: Capacitor・pedometer・LICENSES.md）');
ok(typeof P.creditApp === 'string' && /@capgo\/capacitor-pedometer/.test(pp('creditApp')) && /MPL-2\.0/.test(pp('creditApp')) && /https:\/\/github\.com\/Cap-go\/capacitor-pedometer/.test(pp('creditApp')) && /Capacitor（MIT/.test(pp('creditApp')), 'parent.creditApp（MPL-2.0・ソースの入手先・Capacitor の MIT）');
ok(/はじめから/.test(pp('erase')) && /消/.test(pp('erase')), 'データの消し方');
ok(/インターネットには送りません/.test(pp('permission')), '歩数の許可の前の説明');
ok(!/法律|法令|違法|準拠|COPPA|GDPR|個人情報保護法/.test(STR.filter(x => x.p.startsWith('parent.')).map(x => BY[x.p].plain).join()), '法律の断定をしない');
ok(/\{nums\}/.test(P.gateAsk) && !/\{[^a-z}]*\|/.test(P.gateAsk), '関門の問題文はふりがななし（{nums} の差し込みだけ）');
ok(/\{num\}/.test(P.gateAsk3) && /\{order\}/.test(P.gateAsk3) && !/\{[^a-z}]*\|/.test(P.gateAsk3), '関門の3けたの問題文はふりがななし（{num} {order} の差し込みだけ）');
ok(Array.isArray(P.gateNums) && P.gateNums.length === 10, '関門の漢数字10個');

/* ---------- 8. 公式データ（official） ---------- */
section('公式データのふりがな版');
const O = T.official || {};
keysEq(O, ['names', 'words', 'bio'], 'official の項目');
keysEq(O.names, IDS, 'official.names は39体');
for (const c of CH.CHARS) ok(plainOf('official.names.' + c.id) === c.name, 'official.names.' + c.id + ' のふりがなを外すと「' + c.name + '」');
const BIO_IDS = CH.CHARS.filter(c => c.bio).map(c => c.id);
keysEq(O.bio, BIO_IDS, 'official.bio は公式紹介文がある体だけ');
for (const id of BIO_IDS) ok(plainOf('official.bio.' + id) === CH.BY_ID[id].bio, 'official.bio.' + id + ' のふりがなを外すと chars.js の bio と同じ');
for (const w in (O.words || {})) ok(plainOf('official.words.' + w) === w, 'official.words「' + w + '」のふりがなを外すと同じ字');
const WANT = new Set();
for (const c of CH.CHARS) for (const w of [c.jutsu, c.weapon]) if (w && KANJI.test(w)) WANT.add(w);
for (const w of WANT) ok(O.words && typeof O.words[w] === 'string', 'official.words に「' + w + '」がある');
// 読みは名前表（MUST）と同じ（上の「名前・クランの読み」でまとめて確かめている）

/* ---------- 9. その他の目安 ---------- */
section('長さの目安');
for (const id of IDS) {
  const z = plainOf('zukan.' + id); const n = z.split(/[。！？]/).filter(x => x.trim()).length;
  ok(n >= 1 && n <= 2, 'zukan.' + id + ' は1〜2文（' + n + '）');
  ok(plainOf('greet.' + id).length <= 60, 'greet.' + id + ' は60字以内');
}
for (const id of OTHERS) (T.idle[id] || []).forEach((l, i) => ok(plainOf('idle.' + id + '.' + i).length <= 50, 'idle.' + id + '.' + i + ' は50字以内'));
for (const id of FIRST8) T.bond[id].forEach((l, i) => ok(plainOf('bond.' + id + '.' + i).length <= 60, 'bond.' + id + '.' + i + ' は60字以内'));
ok(/免許皆伝/.test(plainOf('bond.' + FIRST8[0] + '.11')) && FIRST8.every(id => /免許皆伝/.test(plainOf('bond.' + id + '.11'))), 'bond の12本目は免許皆伝のころの一言');

console.log('');
for (const w of warns) console.log('  注: ' + w);
console.log('合格 ' + pass + ' / 不合格 ' + fail);
process.exit(fail ? 1 : 0);
