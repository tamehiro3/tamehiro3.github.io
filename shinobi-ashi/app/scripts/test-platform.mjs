#!/usr/bin/env node
/* 忍び足 — steps.js / store.js / notify.js の Node テスト（Capacitor は作り物に差し替える）
 *   node shinobi-ashi/app/scripts/test-platform.mjs
 * ブラウザ（ためし歩き・localStorage・メモリだけ）、iPhone（@capgo/capacitor-pedometer の作り物）、
 * Android (b)(c)（ShinobiSteps の作り物）、アプリの保存（Filesystem・Preferences の作り物）、通知の予定。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', '..');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; } else { fail++; console.log('  NG ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b }); }
function section(s) { console.log('- ' + s); }

/* ---------- localStorage の作り物 ---------- */
function makeLS(opts = {}) {
  const m = new Map();
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { if (opts.throwAll) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      if (opts.throwAll) throw new Error('SecurityError');
      if (opts.quota && String(v).length > opts.quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem(k) { if (opts.throwAll) throw new Error('SecurityError'); m.delete(k); },
    _m: m
  };
}

globalThis.localStorage = makeLS();
const D = require(path.join(SRC, 'data.js'));
const Store = require(path.join(SRC, 'store.js'));
const Steps = require(path.join(SRC, 'steps.js'));
const Notify = require(path.join(SRC, 'notify.js'));
const SA = globalThis.SA;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
const realToday = ymd(new Date());
const sum = (a) => a.reduce((t, x) => t + x, 0);

function setNative(platform, plugins) {
  globalThis.Capacitor = {
    getPlatform: () => platform,
    isNativePlatform: () => platform !== 'web',
    Plugins: {},
    registerPlugin(name) { if (!plugins[name]) throw new Error('no plugin ' + name); this.Plugins[name] = plugins[name]; return plugins[name]; }
  };
  Store._reset(); Steps._reset();
}
function setWeb(ls) {
  delete globalThis.Capacitor;
  globalThis.localStorage = ls;
  Store._reset(); Steps._reset();
}

/* ================= ブラウザ: ためし歩き ================= */
section('ためし歩き（sim）');
setWeb(makeLS());
{
  const info = await Steps.detect();
  eq(info, { route: 'sim', canBuckets: true, historyDays: 7 }, 'detect は sim');
  eq(Steps.today(), realToday, 'today は実の今日');
  eq(await Steps.permission(), 'granted', 'sim の許可は granted');
  const sim = Steps.sim;
  ok(sim && typeof sim.addSteps === 'function', 'SA.Steps.sim がある');
  let r = sim.addSteps(3000, { hour: 9 });
  eq(r.buckets[9], 3000, 'cont: 9時に3000');
  r = sim.addSteps(15000, { hour: 10, spread: 'cont' });
  eq([r.buckets[10], r.buckets[11]], [11000, 4000], 'cont: 1時間11,000を超えた分は次の時間へ');
  r = sim.addSteps(20000, { hour: 23 });
  ok(r.buckets[23] === 11000 && r.buckets[22] === 9000, '23時を超えた分は前の時間へ', r.buckets.slice(20));
  ok(r.buckets.every((x) => x <= 11000), 'どの時間も11,000以下');
  sim.nextDay();
  const d1 = Steps.today();
  eq(d1, SA.Steps.addDays(realToday, 1), 'nextDay で今日が1日すすむ');
  r = sim.addSteps(1000, { spread: 'bits' });
  const bitsHours = r.buckets.map((x, h) => [h, x]).filter(([h, x]) => x > 0);
  ok(bitsHours.every(([h]) => h >= 8 && h < 20), 'bits: 8〜20時だけ', bitsHours);
  ok(bitsHours.filter(([, x]) => x >= 100).length >= 6, 'bits: 1,000歩で100歩以上の時間が6つ以上', bitsHours);
  eq(sum(r.buckets), 1000, 'bits: 合計が合う');
  const r2 = sim.addSteps(1000, { spread: 'bits' });
  eq(sum(r2.buckets), 2000, 'bits を2回足すと2000');
  sim.nextDay();
  r = sim.addSteps(5000, { spread: 'flat' });
  eq(r.buckets.slice(8, 18), [500, 500, 500, 500, 500, 500, 500, 500, 500, 500], 'flat: 8〜18時に500ずつ');
  eq(sum(r.buckets), 5000, 'flat: 合計');
  r = sim.addSteps(1003, { spread: 'flat' });
  eq(sum(r.buckets), 6003, 'flat: 端数も落とさない');
  r = sim.addSteps(700, { hour: 'shinya' });
  eq(r.buckets[2], 700, "hour: 'shinya' は2時");
  // read
  let days = await Steps.read(SA.Steps.addDays(Steps.today(), -20), Steps.today());
  eq(days.length, 7, 'read は7日まで');
  eq(days[days.length - 1].date, Steps.today(), '最後は今日');
  eq(days[days.length - 1].steps, 6703, '今日の合計');
  eq(days[days.length - 1].src, 'sim', 'src は sim');
  ok(days.every((d) => Array.isArray(d.buckets) && d.buckets.length === 24), 'buckets は24個');
  const byDate = Object.fromEntries(days.map((d) => [d.date, d.steps]));
  eq(byDate[realToday], 38000, '実の今日の記録（3000+15000+20000）');
  eq(byDate[d1], 2000, '翌日の記録');
  days = await Steps.read(SA.Steps.addDays(Steps.today(), 3), SA.Steps.addDays(Steps.today(), 9));
  eq(days.length, 0, '未来の日は返さない');
  // 歩行中
  eq(await Steps.walkingNow(3000), false, 'walkingNow: ふだんは false');
  sim.setWalking(true);
  const t0 = Date.now();
  eq(await Steps.walkingNow(3000), true, 'walkingNow: 歩いている（テスト）で true');
  ok(Date.now() - t0 < 1500, 'sim の歩行中判定は待ちが短い');
  sim.setWalking(false);
  // 保存されているか（読み直し）
  const before = Steps.today();
  Steps._reset();
  eq(Steps.today(), before, 'ずらした日付は localStorage に残る');
  eq((await Steps.read(realToday, realToday))[0].steps, 38000, '記録も残る');
  sim.skipDays !== undefined && Steps.sim.skipDays(7);
  eq(Steps.today(), SA.Steps.addDays(before, 7), 'skipDays(7)');
  days = await Steps.read(realToday, Steps.today());
  ok(days.every((d) => d.steps === 0), '7日すすめたら古い日は読めない（0の日だけ）', days.map((d) => d.steps));
  let changes = 0; const off = Steps.sim.onChange(() => changes++);
  Steps.sim.addSteps(10);
  off();
  Steps.sim.addSteps(10);
  eq(changes, 1, 'onChange');
  Steps.sim.reset();
  eq(Steps.today(), realToday, 'reset で今日が戻る');
  eq((await Steps.read(realToday, realToday))[0].steps, 0, 'reset で記録が消える');
}

/* ================= ブラウザ: WEB_TRIAL=false ================= */
section('WEB_TRIAL=false は none');
{
  D.CONFIG.WEB_TRIAL = false;
  setWeb(makeLS());
  const info = await Steps.detect();
  eq(info.route, 'none', 'none');
  eq(Steps.sim, null, 'sim はない');
  eq(await Steps.read(realToday, realToday), [], 'read は空');
  eq(await Steps.walkingNow(10), false, 'walkingNow は false');
  eq(await Steps.permission(), 'denied', 'permission は denied');
  D.CONFIG.WEB_TRIAL = true;
}

/* ================= ブラウザ: 保存 ================= */
section('保存（localStorage）');
{
  const ls = makeLS();
  setWeb(ls);
  ok(Store.persistent === true && Store.backend === 'local', 'localStorage が使える');
  eq(await Store.load(), null, 'はじめは null');
  const st = { app: 'shinobi-ashi', v: 1, n: 1 };
  eq(await Store.save(st), true, 'save は true');
  eq(await Store.load(), st, 'load で戻る');
  ok(ls._m.has('shinobi-ashi:v1'), 'キーは shinobi-ashi:v1');
  await Store.save({ app: 'shinobi-ashi', v: 1, n: 2 });
  eq(JSON.parse(ls._m.get('shinobi-ashi:v1:bak')).n, 1, 'ひとつ前を bak に残す');
  ls._m.set('shinobi-ashi:v1', '{壊れた');
  eq((await Store.load()).n, 1, '壊れていたら bak から読む');
  eq(await Store.load().then(() => 'ok'), 'ok', '例外を投げない');
  ls._m.set('shinobi-ashi:v1', JSON.stringify({ app: 'other' }));
  ls._m.delete('shinobi-ashi:v1:bak');
  eq(await Store.load(), null, 'ほかのアプリのデータは読まない');
  // 壊れていて控えもない → null ではなく「壊れていた」の印（はじめての画面に進んで上書きしないように）
  ls._m.set('shinobi-ashi:v1', '{"app":"shinobi-ashi","v":1,"chars":{"an');
  const cor = await Store.load();
  eq(cor, { corrupt: true, broken: true, app: 'shinobi-ashi:corrupt', reason: 'main-json' }, '壊れていて :bak もなければ null ではなく壊れた印（broken・reason つき）');
  eq(Store.lastError, { reason: 'main-json', recovered: false, kept: true }, 'SA.Store.lastError にも残る');
  ok(Store.isCorrupt(cor) && !Store.isCorrupt({ app: 'shinobi-ashi' }) && !Store.isCorrupt(null), 'isCorrupt');
  eq(ls._m.get('shinobi-ashi:v1:broken'), '{"app":"shinobi-ashi","v":1,"chars":{"an', '壊れた中身は :broken に写して残す');
  eq(await Store.brokenText(), '{"app":"shinobi-ashi","v":1,"chars":{"an', 'brokenText で読める');
  eq(await Store.loadBackup(), null, 'loadBackup は控えがなければ null');
  ls._m.set('shinobi-ashi:v1:bak', '{壊');
  eq((await Store.load()).corrupt, true, '本体も :bak も壊れていれば corrupt');
  ls._m.set('shinobi-ashi:v1', '[1,2]');
  eq((await Store.load()).reason, 'main-json', '本体が配列（記録の形でない）でも壊れた扱い');
  ls._m.set('shinobi-ashi:v1', '{壊');
  ls._m.delete('shinobi-ashi:v1');
  eq((await Store.load()).reason, 'bak-json', '本体がなく :bak だけ壊れていても corrupt（reason は bak-json）');
  ls._m.set('shinobi-ashi:v1', '   ');
  ls._m.delete('shinobi-ashi:v1:bak');
  eq(await Store.load(), null, '空白だけは「記録なし」');
  eq(Store.lastError, null, '壊れていなければ lastError は null');
  ls._m.set('shinobi-ashi:v1', '{壊');
  ls._m.set('shinobi-ashi:v1:bak', JSON.stringify({ app: 'shinobi-ashi', v: 1, n: 7 }));
  eq((await Store.loadBackup()).n, 7, 'loadBackup は :bak を読む');
  ls._m.delete('shinobi-ashi:v1:broken');
  eq((await Store.load()).n, 7, ':bak が読めれば corrupt にしない');
  eq(Store.lastError, { reason: 'main-json', recovered: true, kept: true }, ':bak から戻したときも lastError（recovered: true）');
  eq(ls._m.get('shinobi-ashi:v1:broken'), '{壊', ':bak から戻したときも、上書きされる前の壊れた本体を :broken に写す');
  await Store.save({ app: 'shinobi-ashi', v: 1, n: 8 });
  eq(await Store.clear({ prefs: false }), true, 'clear');
  eq(ls._m.get('shinobi-ashi:v1:broken'), '{壊', 'clear でも :broken は消さない');
  // 実の rules.js でも、印は新しい記録に直されない（validate も通らない）
  {
    globalThis.NSL_CHARS = require(path.join(SRC, 'chars.js'));
    const R = require(path.join(SRC, 'rules.js'));
    const mk = { corrupt: true, broken: true, app: 'shinobi-ashi:corrupt', reason: 'main-json' };
    eq([R.validate(mk).ok, R.migrate(mk)], [false, null], 'corrupt の印は Rules.validate を通らず migrate も null');
    delete SA.Rules;
  }
  ls._m.delete('shinobi-ashi:v1:bak'); ls._m.delete('shinobi-ashi:v1'); ls._m.delete('shinobi-ashi:v1:broken');
  const cyc = {}; cyc.self = cyc;
  eq(await Store.save(cyc), false, '循環して JSON にできないものは false');
  await Store.setPref('goal', 9500);
  await Store.setPref('mode', 'kodomo');
  await Store.setPref('steps.c', { counter: 5 });
  eq(await Store.getPref('goal'), 9500, 'getPref は数のまま');
  eq(await Store.getPref('mode'), 'kodomo', 'getPref は文字のまま');
  eq(await Store.getPref('nothing'), null, 'ない設定は null');
  await Store.save({ app: 'shinobi-ashi', v: 1, n: 3 });
  eq(await Store.clear(), true, 'clear');
  eq(await Store.load(), null, 'clear で進行データが消える');
  eq(await Store.getPref('goal'), null, 'clear で設定も消える');
  eq(await Store.getPref('steps.c'), { counter: 5 }, 'clear でも steps. の基準は残す');
  await Store.clear({ all: true });
  eq(await Store.getPref('steps.c'), null, 'clear({all:true}) で全部');
  // 容量いっぱい
  const small = makeLS({ quota: 50 });
  setWeb(small);
  eq(await Store.save({ app: 'shinobi-ashi', big: 'x'.repeat(100) }), false, '容量いっぱいなら false（例外なし）');
  // localStorage が使えない
  setWeb(makeLS({ throwAll: true }));
  ok(Store.persistent === false && Store.backend === 'memory', '使えなければメモリだけ（persistent=false）');
  eq(await Store.save({ app: 'shinobi-ashi', n: 9 }), true, 'メモリには保存できる');
  eq((await Store.load()).n, 9, 'メモリから読める');
  await Store.setPref('x', 1);
  eq(await Store.getPref('x'), 1, 'メモリの設定');
  Steps._reset();
  eq(Steps.today(), realToday, 'localStorage がなくても sim は動く');
  Steps.sim.addSteps(100, { hour: 8 });
  eq((await Steps.read(realToday, realToday))[0].steps, 100, 'メモリだけの sim');
  // Rules.migrate を通す
  setWeb(makeLS());
  SA.Rules = { migrate: (o) => Object.assign({}, o, { migrated: true }) };
  await Store.save({ app: 'shinobi-ashi', v: 1 });
  eq((await Store.load()).migrated, true, 'load は SA.Rules.migrate を通す');
  SA.Rules = { migrate: () => { throw new Error('x'); } };
  eq((await Store.load()).v, 1, 'migrate が失敗したら元のまま');
  delete SA.Rules;
}

/* ================= アプリ: 保存（Filesystem・Preferences の作り物） ================= */
section('保存（アプリ: LibraryNoCloud の progress.json）');
function makeFS(opts = {}) {
  const files = new Map(), log = [];
  const k = (o) => (o.directory || '') + '/' + o.path;
  return {
    files, log,
    async readFile(o) { log.push(['read', o.path, o.directory]); if (!files.has(k(o))) throw new Error('File does not exist'); return { data: files.get(k(o)) }; },
    async writeFile(o) { log.push(['write', o.path, o.directory]); if (opts.failWrite) throw new Error('disk'); files.set(k(o), o.data); return { uri: 'file://' + o.path }; },
    async rename(o) {
      log.push(['rename', o.from, o.to]);
      const a = (o.directory || '') + '/' + o.from, b = (o.toDirectory || o.directory || '') + '/' + o.to;
      if (!files.has(a)) throw new Error('no source');
      if (opts.renameFailsIfExists && files.has(b)) throw new Error('exists');
      files.set(b, files.get(a)); files.delete(a);
    },
    async deleteFile(o) { log.push(['delete', o.path]); if (!files.delete(k(o))) throw new Error('no file'); }
  };
}
function makePrefs() {
  const m = new Map();
  return {
    m,
    async get({ key }) { return { value: m.has(key) ? m.get(key) : null }; },
    async set({ key, value }) { if (typeof value !== 'string') throw new Error('value must be string'); m.set(key, value); },
    async remove({ key }) { m.delete(key); },
    async keys() { return { keys: [...m.keys()] }; }
  };
}
{
  const FS = makeFS({ renameFailsIfExists: true }), PR = makePrefs();
  setNative('ios', { Filesystem: FS, Preferences: PR, CapacitorPedometer: {} });
  ok(Store.backend === 'app' && Store.persistent, 'アプリは Filesystem');
  eq(await Store.save({ app: 'shinobi-ashi', n: 1 }), true, 'save');
  eq(FS.log.slice(0, 2).map((x) => x[0] + ':' + x[1]), ['write:progress.tmp.json', 'rename:progress.tmp.json'], '一時ファイルに書いてから rename');
  ok(FS.log.every((x) => x[0] !== 'write' || x[2] === 'LIBRARY_NO_CLOUD'), 'Directory.LibraryNoCloud に書く');
  ok(FS.files.has('LIBRARY_NO_CLOUD/progress.json') && !FS.files.has('LIBRARY_NO_CLOUD/progress.tmp.json'), 'progress.json だけが残る');
  eq(await Store.save({ app: 'shinobi-ashi', n: 2 }), true, '2回目（置き換え先があって rename できない端末でも）');
  eq((await Store.load()).n, 2, 'load');
  // 同時に何回保存しても最後の値
  await Promise.all([1, 2, 3, 4, 5].map((n) => Store.save({ app: 'shinobi-ashi', n: 10 + n })));
  eq((await Store.load()).n, 15, '続けて保存しても順番どおり');
  // 置き換えの途中で落ちた（progress.json がなく tmp だけ）
  FS.files.delete('LIBRARY_NO_CLOUD/progress.json');
  FS.files.set('LIBRARY_NO_CLOUD/progress.tmp.json', JSON.stringify({ app: 'shinobi-ashi', n: 99 }));
  eq((await Store.load()).n, 99, '本体がなければ一時ファイルから読む');
  FS.files.set('LIBRARY_NO_CLOUD/progress.json', '{壊');
  eq((await Store.load()).n, 99, '本体が壊れていても一時ファイルから読む');
  FS.files.delete('LIBRARY_NO_CLOUD/progress.tmp.json');
  eq((await Store.load()).corrupt, true, '本体が壊れていて一時ファイルもなければ corrupt');
  eq(FS.files.get('LIBRARY_NO_CLOUD/progress.broken.json'), '{壊', '壊れた中身は progress.broken.json に写す');
  eq(await Store.brokenText(), '{壊', 'アプリでも brokenText');
  FS.files.set('LIBRARY_NO_CLOUD/progress.tmp.json', JSON.stringify({ app: 'shinobi-ashi', n: 99 }));
  await Store.setPref('mode', 'otona');
  eq(PR.m.get('mode'), '"otona"', 'Preferences には JSON の文字で入れる');
  eq(await Store.getPref('mode'), 'otona', 'Preferences から読む');
  await Store.clear();
  ok(!FS.files.has('LIBRARY_NO_CLOUD/progress.json') && !FS.files.has('LIBRARY_NO_CLOUD/progress.tmp.json'), 'clear でファイルが消える');
  eq(await Store.load(), null, 'clear のあとは null');
  const FS2 = makeFS({ failWrite: true });
  setNative('android', { Filesystem: FS2, Preferences: makePrefs(), ShinobiSteps: {} });
  eq(await Store.save({ app: 'shinobi-ashi' }), false, '書けなければ false（例外なし）');
}

/* ================= iPhone（@capgo/capacitor-pedometer の作り物） ================= */
section('iPhone（ios）');
{
  // 1時間ごとの歩数: 日付ごとに決まった形。8日以上前は「読めない」
  const H = 3600000;
  const perHour = (t) => { const d = new Date(t); const h = d.getHours(); return (h >= 7 && h < 9) ? 1200 : (h === 18 ? 3500 : (h >= 10 && h < 17 ? 150 : 0)); };
  const oldest = new Date(); oldest.setHours(0, 0, 0, 0); oldest.setDate(oldest.getDate() - 6);
  let calls = 0, listener = null, started = false;
  const P = {
    async isAvailable() { return { stepCounting: true, distance: true, pace: true, cadence: true, floorCounting: true }; },
    async checkPermissions() { return { activityRecognition: 'prompt' }; },
    async requestPermissions() { return { activityRecognition: 'granted' }; },
    async getMeasurement({ start, end }) {
      calls++;
      if (start == null || end == null) throw new Error('Start and end timestamps are required on iOS');
      if (start < oldest.getTime()) throw new Error('Failed to query pedometer data');
      let n = 0;
      for (let t = start; t < end; t += H) n += Math.round(perHour(t) * Math.min(1, (end - t) / H));
      return { numberOfSteps: n, startDate: start, endDate: end };
    },
    async addListener(ev, fn) { listener = fn; return { remove: async () => { listener = null; } }; },
    async startMeasurementUpdates() { started = true; setTimeout(() => listener && listener({ numberOfSteps: 6, currentCadence: 1.6, startDate: Date.now() - 3000, endDate: Date.now() }), 50); },
    async stopMeasurementUpdates() { started = false; }
  };
  setNative('ios', { CapacitorPedometer: P, Filesystem: makeFS(), Preferences: makePrefs() });
  eq(Steps.sim, null, 'アプリでは sim はない');
  eq(await Steps.detect(), { route: 'ios', canBuckets: true, historyDays: 7 }, 'detect は ios');
  eq(await Steps.permission(), 'prompt', 'permission は prompt');
  eq(await Steps.request(), 'granted', 'request で granted');
  const from = SA.Steps.addDays(realToday, -9);
  const days = await Steps.read(from, realToday);
  eq(days.length, 7, '過去7日まで（それより前は読まない）');
  eq(days[0].date, SA.Steps.addDays(realToday, -6), 'いちばん古いのは6日前');
  const full = days[0];
  eq(full.buckets.length, 24, 'buckets は24個');
  eq([full.buckets[7], full.buckets[8], full.buckets[18], full.buckets[12], full.buckets[3]], [1200, 1200, 3500, 150, 0], '1時間ごとの歩数');
  eq(full.steps, sum(full.buckets), 'steps は buckets の合計');
  eq(full.src, 'ios', 'src は ios');
  const td = days[days.length - 1];
  eq(td.date, realToday, '最後は今日');
  const hNow = new Date().getHours();
  ok(td.buckets.slice(hNow + 1).every((x) => x === 0), '今日はまだ来ていない時間が0');
  ok(calls > 0, 'getMeasurement を呼んだ');
  // 歩行中
  eq(await Steps.walkingNow(300), true, 'walkingNow: currentCadence 1.6 で true');
  ok(!started && listener === null, '測りおわったら止めて、聞き手を外す');
  P.startMeasurementUpdates = async () => { started = true; setTimeout(() => listener && listener({ numberOfSteps: 1, currentCadence: 0.4 }), 20); };
  eq(await Steps.walkingNow(200), false, 'walkingNow: 0.4 なら false');
  // 通知が測る時間のうちに1回も来ない（CMPedometer の最初の通知は遅い）: 直前10秒の getMeasurement で決める
  P.startMeasurementUpdates = async () => { started = true; };
  eq(await Steps.walkingNow(100), false, 'walkingNow: 通知なし・直前10秒もゆっくり（1歩/秒ほど）なら false');
  const realGet = P.getMeasurement;
  let lookback = null;
  P.getMeasurement = async ({ start, end }) => { if (end - start <= 15000) { lookback = end - start; return { numberOfSteps: 17, startDate: start, endDate: end }; } return realGet({ start, end }); };
  eq(await Steps.walkingNow(100), true, 'walkingNow: 通知なしでも直前10秒に17歩（1.7歩/秒）なら true');
  eq(lookback, 10000, '代わりの読み取りは直前10秒');
  ok(!started && listener === null, '代わりの読み取りのあとも止めて、聞き手を外す');
  P.startMeasurementUpdates = async () => { throw new Error('not available'); };
  eq(await Steps.walkingNow(100), true, 'walkingNow: 通知が使えない端末でも、直前10秒で決める');
  P.getMeasurement = async () => { throw new Error('denied'); };
  eq(await Steps.walkingNow(100), false, 'walkingNow: どちらも読めなければ false（操作できる）');
  P.getMeasurement = realGet;
  P.startMeasurementUpdates = async () => { started = true; setTimeout(() => listener && listener({ numberOfSteps: 1, currentCadence: 0.4 }), 20); };
  // 歩数が使えない iPhone
  setNative('ios', { CapacitorPedometer: Object.assign({}, P, { isAvailable: async () => ({ stepCounting: false }) }), Filesystem: makeFS(), Preferences: makePrefs() });
  eq((await Steps.detect()).route, 'none', 'stepCounting=false なら none');
}

/* ================= Android (b)(c)（ShinobiSteps の作り物） ================= */
section('Android (b) Recording API');
function makeAndroid(o = {}) {
  const st = { perm: o.perm || 'granted', subscribed: 0, counter: o.counter ?? 1000, boot: o.boot ?? 3, installId: o.installId || 'inst-1', events: o.events ?? 0, readHourlyFail: !!o.readHourlyFail, subFail: !!o.subFail };
  const H = 3600000;
  return {
    st,
    async isAvailable() { return { recording: o.recording !== false, counter: o.counterAvail !== false, detector: true, sdk: 34 }; },
    async checkPermission() { return { activity: st.perm }; },
    async requestPermission() { st.perm = 'granted'; return { activity: 'granted' }; },
    async subscribe() { if (st.subFail) throw new Error('SUBSCRIBE_FAILED'); st.subscribed++; return { ok: true }; },
    async readHourly({ start, end }) {
      if (st.readHourlyFail) throw new Error('READ_FAILED');
      if (typeof start !== 'number' || typeof end !== 'number') throw new Error('BAD_RANGE');
      const out = [];
      for (let t = start; t < end; t += H) { const h = new Date(t).getHours(); out.push({ start: t, end: Math.min(t + H, end), steps: h === 12 ? 2000 : (h === 6 ? 500 : 0) }); }
      return { buckets: out };
    },
    async readCounter() { if (st.perm !== 'granted') throw new Error('NO_PERMISSION'); return { steps: st.counter, bootCount: st.boot, elapsedRealtime: 1, timestamp: Date.now(), installId: st.installId }; },
    async walkingNow({ ms }) { return { events: st.events, available: true }; }
  };
}
{
  const A = makeAndroid({ perm: 'prompt' });
  setNative('android', { ShinobiSteps: A, Filesystem: makeFS(), Preferences: makePrefs() });
  eq(await Steps.detect(), { route: 'androidB', canBuckets: true, historyDays: 10 }, '許可の前でも Recording API があれば androidB');
  eq(await Steps.permission(), 'prompt', 'permission');
  eq(await Steps.request(), 'granted', 'request');
  ok(A.st.subscribed >= 1, '許可のあとに購読する');
  const days = await Steps.read(SA.Steps.addDays(realToday, -15), realToday);
  eq(days.length, 10, '過去10日まで');
  eq(days[0].buckets[12], 2000, '12時に2000');
  eq(days[0].steps, 2500, '1日の合計');
  eq(days[0].src, 'androidB', 'src は androidB');
  A.st.events = 5;
  eq(await Steps.walkingNow(100), true, '歩数検出イベント5回で歩行中');
  A.st.events = 3;
  eq(await Steps.walkingNow(100), false, '3回なら歩行中でない');
  // 購読できない端末は (c)
  const A2 = makeAndroid({ subFail: true });
  setNative('android', { ShinobiSteps: A2, Filesystem: makeFS(), Preferences: makePrefs() });
  eq((await Steps.detect()).route, 'androidC', '購読に失敗したら androidC');
  // Recording API がない端末
  setNative('android', { ShinobiSteps: makeAndroid({ recording: false }), Filesystem: makeFS(), Preferences: makePrefs() });
  eq(await Steps.detect(), { route: 'androidC', canBuckets: false, historyDays: 0 }, 'Recording API がなければ androidC');
  setNative('android', { ShinobiSteps: makeAndroid({ recording: false, counterAvail: false }), Filesystem: makeFS(), Preferences: makePrefs() });
  eq((await Steps.detect()).route, 'none', '歩数センサーもなければ none');
  // (b) が読めないときは今日だけ (c)
  const A3 = makeAndroid({ readHourlyFail: true });
  setNative('android', { ShinobiSteps: A3, Filesystem: makeFS(), Preferences: makePrefs() });
  eq((await Steps.detect()).route, 'androidB', 'detect は androidB');
  const d3 = await Steps.read(realToday, realToday);
  eq(d3.map((d) => [d.date, d.steps, d.buckets, d.src]), [[realToday, 0, null, 'androidC']], '(b) が読めないときは (c) で今日だけ（基準を取る）');
}
section('Android (c) 歩数センサーの前景差分');
{
  const A = makeAndroid({ recording: false, counter: 5000, boot: 7, installId: 'inst-A' });
  const PR = makePrefs();
  setNative('android', { ShinobiSteps: A, Filesystem: makeFS(), Preferences: PR });
  eq((await Steps.detect()).route, 'androidC', 'androidC');
  const rd = async () => (await Steps.read(SA.Steps.addDays(realToday, -3), realToday));
  let d = await rd();
  eq(d.length, 1, '(c) は今日だけ');
  eq([d[0].date, d[0].steps, d[0].buckets, d[0].src], [realToday, 0, null, 'androidC'], 'はじめは基準を取るだけ（0）');
  A.st.counter = 6200;
  eq((await rd())[0].steps, 1200, '差分 1,200 が今日に入る');
  A.st.counter = 6500;
  eq((await rd())[0].steps, 1500, 'もう一度開くと 1,500');
  eq((await rd())[0].steps, 1500, '歩いていなければ変わらない（冪等）');
  // 同時に2回読んでも二重に足さない
  A.st.counter = 6600;
  const both = await Promise.all([rd(), rd()]);
  eq([both[0][0].steps, both[1][0].steps], [1600, 1600], '同時に読んでも二重に足さない');
  // 再起動（BOOT_COUNT が変わって値が小さくなる）
  A.st.boot = 8; A.st.counter = 300;
  eq((await rd())[0].steps, 1600, '再起動したら差分を捨てて基準を取り直す（今日の分は残る）');
  A.st.counter = 800;
  eq((await rd())[0].steps, 2100, '再起動のあとの差分');
  // 値が小さくなった（同じ BOOT_COUNT でも）
  A.st.counter = 100;
  eq((await rd())[0].steps, 2100, '値が小さくなったら基準を取り直す');
  A.st.counter = 150;
  eq((await rd())[0].steps, 2150, 'そのあとの差分');
  // バックアップから戻した（installId が変わる）
  A.st.installId = 'inst-B'; A.st.counter = 9000;
  eq((await rd())[0].steps, 0, '入れ直し・バックアップからの復元では基準を捨てる');
  A.st.counter = 9100;
  eq((await rd())[0].steps, 100, '復元のあとの差分');
  // 基準がない
  PR.m.delete('steps.c');
  A.st.counter = 12000;
  eq((await rd())[0].steps, 0, '基準がなければ取り直す');
  // 前回が (b) だった
  await Store.setPref('steps.lastRoute', 'androidB');
  A.st.counter = 15000;
  eq((await rd())[0].steps, 0, '前回が (c) でなければ取り直す');
  // 日付が変わった: 前回からの差分は「今日」に入る（開かなかった日の分は、開いた日の修行に入る）
  const base = await Store.getPref('steps.c');
  base.date = SA.Steps.addDays(realToday, -2); base.today = 4000;
  await Store.setPref('steps.c', base);
  A.st.counter = 18000;
  eq((await rd())[0].steps, 3000, '日をまたいだら今日は0から、差分を今日に');
  // 許可がない
  A.st.perm = 'denied';
  eq(await rd(), [], '許可がなければ空（例外なし）');
}

/* ================= 通知 ================= */
section('通知（notify.js）');
{
  setWeb(makeLS());
  eq(await Notify.schedule({ settings: { notify: { on: true, evening: '18:30' } } }), { ok: false, scheduled: [], skipped: [], reason: 'web' }, 'ブラウザでは何もしない');
  eq(await Notify.cancelAll(), true, 'ブラウザの cancelAll');
  const base = { furigana: true, route: 'ios', lastSyncDate: realToday, settings: { notify: { on: true, evening: '18:30' } } };
  let pl = Notify.plan(base, Date.now());
  eq(pl.list.map((n) => n.id), [7101, 7102, 7103], '3種類');
  eq(pl.list[0].schedule.on, { hour: 18, minute: 30 }, '夕方 18:30');
  eq(pl.list[0].body, 'かえったらとりこもう', 'ふりがな「あり」はかなで');
  eq(Notify.plan(Object.assign({}, base, { furigana: false }), Date.now()).list[0].body, '帰ったら取り込もう', 'ふりがな「なし」は漢字で');
  const at = pl.list[1].schedule.at;
  eq([ymd(at), at.getHours(), at.getMinutes()], [SA.Steps.addDays(realToday, 6), 18, 0], '最後の同期から6日目の18:00');
  eq(pl.list[2].schedule.on, { weekday: 2, hour: 7, minute: 30 }, '月曜 7:30');
  ok(pl.list.every((n) => n.isExactNotification === false), '正確なアラームを求めない');
  ok(pl.list.every((n) => !/[{}|]/.test(n.title + n.body)), '書式が残っていない');
  pl = Notify.plan(Object.assign({}, base, { settings: { notify: { on: true, evening: '21:30' } } }), Date.now());
  ok(!pl.list.some((n) => n.id === 7101) && pl.skipped.includes('evening:quiet'), '21時以降の夕方の通知は出さない');
  pl = Notify.plan(Object.assign({}, base, { settings: { notify: { on: true, evening: '06:45' } } }), Date.now());
  ok(!pl.list.some((n) => n.id === 7101), '7時前も出さない');
  pl = Notify.plan(Object.assign({}, base, { settings: { notify: { on: false } } }), Date.now());
  eq(pl.list, [], 'on=false なら全部止める');
  pl = Notify.plan(Object.assign({}, base, { lastSyncDate: SA.Steps.addDays(realToday, -10) }), Date.now());
  ok(!pl.list.some((n) => n.id === 7102), '6日目が過ぎていたら出さない');
  pl = Notify.plan(Object.assign({}, base, { settings: {} }), Date.now());
  eq(pl.list[0].schedule.on, { hour: 18, minute: 30 }, '設定がなければ既定 18:30');
  // アプリ（作り物の LocalNotifications）
  const calls = [];
  const LN = {
    perm: 'prompt',
    async checkPermissions() { return { display: this.perm }; },
    async requestPermissions() { this.perm = 'granted'; calls.push('request'); return { display: 'granted' }; },
    async cancel(o) { calls.push('cancel:' + o.notifications.map((x) => x.id).join(',')); },
    async schedule(o) { calls.push('schedule:' + o.notifications.map((x) => x.id).join(',')); return { notifications: o.notifications.map((x) => ({ id: x.id })) }; },
    async createChannel(c) { calls.push('channel:' + c.id); }
  };
  setNative('android', { LocalNotifications: LN, ShinobiSteps: makeAndroid(), Filesystem: makeFS(), Preferences: makePrefs() });
  let r = await Notify.schedule(base, { ask: false });
  eq(r.reason, 'permission', 'ask:false なら許可を聞かない');
  r = await Notify.schedule(base);
  eq(r.scheduled, [7101, 7102, 7103], '予定を入れる');
  ok(calls.includes('request') && calls.includes('channel:shinobi-ashi'), '許可を聞いて、Android のチャンネルを作る', calls);
  ok(calls.indexOf('cancel:7101,7102,7103') >= 0 && calls.indexOf('cancel:7101,7102,7103') < calls.lastIndexOf('schedule:7101,7102,7103'), '入れる前に前の予定を消す');
  calls.length = 0;
  r = await Notify.schedule(Object.assign({}, base, { settings: { notify: { on: false } } }));
  eq([r.scheduled, calls], [[], ['cancel:7101,7102,7103']], 'on=false は消すだけ');
  eq(await Notify.cancelAll(), true, 'cancelAll');
}

/* ================= ためし歩きと「修行お休み」（実の rules.js） ================= */
section('ためし歩きで修行お休み（rules.js と合わせて）');
{
  setWeb(); globalThis.localStorage = makeLS(); delete globalThis.Capacitor; Store._reset(); Steps._reset();
  globalThis.NSL_CHARS = globalThis.NSL_CHARS || require(path.join(SRC, 'chars.js'));
  const R = require(path.join(SRC, 'rules.js'));
  const info = await Steps.detect();
  const restAfter = async (n) => {
    Steps.sim.reset();
    const t = Steps.today();
    let st = R.newState({ mainId: 'anne', mode: 'kodomo', today: t, route: 'sim' });
    Steps.sim.addSteps(2000, { hour: 8 });
    st = R.ingest(st, await Steps.read(t, t), { today: t }).state;
    Steps.sim.skipDays(n);
    const t2 = Steps.today();
    let from = R.addDays(t2, -(info.historyDays - 1));
    if (st.lastSyncDate > from) from = st.lastSyncDate;
    const ev = R.ingest(st, await Steps.read(from, t2), { today: t2 }).events.filter((e) => e.type === 'rest');
    return ev.length ? ev[0].days : 0;
  };
  eq(info.historyDays, D.CONFIG.HISTORY_DAYS.ios, 'ためし歩きのさかのぼりは iPhone と同じ日数');
  eq(await restAfter(7), 0, '7日すすめても修行お休みは出ない（7日はさかのぼれる）');
  eq(await restAfter(10), 3, '10日すすめると修行お休み（3日）');
  eq(await restAfter(14), 7, '14日すすめると修行お休み（7日。試遊で修行お休みを出す）');
  {
    Steps.sim.reset();
    const t0 = Steps.today();
    Steps.sim.addSteps(1234, { hour: 9 });
    eq(Steps.sim.skipDays(14), R.addDays(t0, 14), 'skipDays(14) は今日を14日すすめる');
    eq([Steps.today(), Steps.sim.offset()], [R.addDays(t0, 14), 14], 'Steps.today() と offset も14日先');
    const got = await Steps.read(t0, Steps.today());
    eq([got.length, got[0].date, got[got.length - 1].date], [7, R.addDays(t0, 8), R.addDays(t0, 14)], '14日先から読めるのは7日分だけ（それより前は返さない）');
    ok(got.every((d) => d.steps === 0 && d.src === 'sim' && d.buckets.length === 24), '読めた日は 0 歩・区間24');
    Steps.sim.addSteps(500, { hour: 10 });
    eq((await Steps.read(Steps.today(), Steps.today()))[0].steps, 500, '14日先でも歩数を足せる');
    eq(JSON.parse(globalThis.localStorage.getItem('shinobi-ashi:sim')).days[t0][9], 1234, '14日前の記録も残っている（30日まで）');
  }
  delete SA.Rules;
  Steps.sim.reset();
}

/* ================= 戻るボタン（Android の MainActivity が SA.Cap.back() を呼ぶ） ================= */
section('戻るボタン（SA.Cap.back）');
{
  const Cap = SA.Cap;
  delete globalThis.document;
  eq(Cap.back(), false, '画面がなければ false（アプリを閉じる）');
  // 作り物の画面: #layer の中の .modal-back と、#nav のタブ
  function makeDoc() {
    const d = new EventTarget();
    d.modals = []; d.layer = { hidden: true, querySelectorAll: () => d.modals };
    d.getElementById = (id) => (id === 'layer' ? d.layer : null);
    d.querySelector = (sel) => (sel === '#nav [data-nav]' ? { getAttribute: () => 'zukan' } : null);
    d.open = (withClose) => {
      const m = { closed: false };
      // withClose: true＝とじるボタン、'next'＝出来事のカードの「つぎへ」だけ、false＝どちらもない
      const btn = withClose ? { disabled: false, click: () => { m.clicked = (m.clicked || 0) + 1; m.closed = true; d.modals = d.modals.filter((x) => x !== m); d.layer.hidden = !d.modals.length; } } : null;
      m.querySelector = (sel) => (withClose === 'next' ? (sel.includes('ev-next') ? btn : null) : (sel.includes('close') ? btn : null));
      d.modals.push(m); d.layer.hidden = false;
      return m;
    };
    return d;
  }
  const doc = makeDoc();
  globalThis.document = doc;
  const went = [];
  const App = { state: {}, view: false, screen: 'home', walking: false };
  SA.UI = { App, go: (id) => { went.push(id); App.screen = id; } };
  eq(Cap.back(), false, 'ホームで重ねた画面がなければ false（アプリを閉じる）');
  App.screen = 'zukan';
  eq([Cap.back(), went, App.screen], [true, ['home'], 'home'], 'ホーム以外ならホームへ戻す');
  const m1 = doc.open(true), m2 = doc.open(true);
  eq([Cap.back(), m2.closed, m1.closed], [true, true, false], '重ねた画面はいちばん上だけ閉じる');
  eq([Cap.back(), m1.closed, doc.layer.hidden], [true, true, true], 'もう一度で次の画面を閉じる');
  const card = doc.open(false);
  eq([Cap.back(), card.closed], [true, false], '閉じるボタンも「つぎへ」もない画面は閉じず、戻るを食べるだけ');
  doc.modals = []; doc.layer.hidden = true;
  const ev = doc.open('next');
  eq([Cap.back(), ev.clicked, ev.closed], [true, 1, true], '出来事のカードは「つぎへ」を押す（最後のカードなら閉じる）');
  App.walking = true;
  const ev2 = doc.open('next');
  eq([Cap.back(), ev2.clicked || 0], [true, 0], '歩いているあいだは出来事のカードも進めない');
  App.walking = false;
  doc.modals = []; doc.layer.hidden = true;
  App.screen = 'road'; App.walking = true; went.length = 0;
  eq([Cap.back(), went], [false, []], '歩いているあいだは画面を動かさない');
  App.walking = false; App.state = null; App.view = true; App.screen = 'road';
  eq([Cap.back(), App.screen], [true, 'zukan'], 'ながめるモードはいちばん左のタブへ');
  App.view = false; App.screen = 'onboard';
  eq(Cap.back(), false, 'はじめての手順の途中（記録なし）は閉じる');
  // 画面側が自分で片づける: 'backbutton' イベントを preventDefault
  App.state = {}; App.screen = 'menu'; went.length = 0;
  const onEv = (e) => e.preventDefault();
  doc.addEventListener('backbutton', onEv);
  eq([Cap.back(), went], [true, []], "document の 'backbutton' を preventDefault したら、それに任せる");
  doc.removeEventListener('backbutton', onEv);
  const off = Cap.onBack(() => true);
  eq([Cap.back(), went], [true, []], 'SA.Cap.onBack の関数が true なら、それに任せる');
  off();
  const off2 = Cap.onBack(() => { throw new Error('x'); });
  eq([Cap.back(), went], [true, ['home']], '登録した関数が落ちても、ふだんの片づけに進む');
  off2();

  // @capacitor/app の 'backButton' から SA.Cap.back() を呼ぶ（Android のアプリだけ）
  const appCalls = [];
  const listeners = {};
  const AppPlugin = {
    addListener: (name, fn) => {
      (listeners[name] = listeners[name] || []).push(fn); appCalls.push('add:' + name);
      return Promise.resolve({ remove: () => { listeners[name] = listeners[name].filter((f) => f !== fn); appCalls.push('remove:' + name); } });
    },
    minimizeApp: () => { appCalls.push('minimize'); return Promise.resolve(); },
    exitApp: () => { appCalls.push('exit'); return Promise.resolve(); }
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // @capacitor/app の作り物の「戻るボタンが押された」: 受け手を順に呼び、そのあと取り消せない素の 'backbutton' を document に流す
  const press = async () => { for (const f of (listeners.backButton || []).slice()) f({ canGoBack: false }); doc.dispatchEvent(new Event('backbutton', { cancelable: false })); await tick(); };
  let uiGot = 0;
  const onUi = () => { uiGot++; };
  setNative('ios', { App: AppPlugin, Filesystem: makeFS(), Preferences: makePrefs() });
  await tick();
  eq(appCalls, [], 'iPhone では backButton をつながない');
  setNative('android', { App: AppPlugin, Filesystem: makeFS(), Preferences: makePrefs(), ShinobiSteps: {} });
  await tick();
  eq(appCalls, ['add:backButton'], "Android では @capacitor/app の 'backButton' をつなぐ");
  doc.addEventListener('backbutton', onUi);   // 画面側の受け手（store.js より後に登録される）
  App.state = {}; App.screen = 'menu'; App.view = false; App.walking = false; went.length = 0; uiGot = 0;
  await press();
  eq([went, uiGot, appCalls.slice(1)], [['home'], 1, []], 'backButton で片づける（ホームへ）。素の backbutton は止めて、画面側には1回だけ届く');
  await new Promise((r) => setTimeout(r, 300));
  App.screen = 'home'; uiGot = 0;
  await press();
  eq(appCalls.slice(1), ['exit'], '片づけるものがなければアプリを閉じる（exitApp）');
  await new Promise((r) => setTimeout(r, 300));
  delete AppPlugin.exitApp; appCalls.length = 1;
  await press();
  eq(appCalls.slice(1), ['minimize'], 'exitApp がなければ minimizeApp');
  AppPlugin.exitApp = () => { appCalls.push('exit'); return Promise.resolve(); };
  // 画面側（ui.js の hookNativeBack）も同じ App に受け手をつないで SA.Cap.back() を呼ぶとき: 1回の戻るで2枚閉じない
  AppPlugin.addListener('backButton', () => { if (!Cap.back()) AppPlugin.exitApp(); });
  await new Promise((r) => setTimeout(r, 300));
  appCalls.length = 2;
  const w1 = doc.open(true), w2 = doc.open(true);
  await press();
  eq([w2.closed, w1.closed, appCalls.slice(2)], [true, false, []], '受け手が2つでも、1回の戻るで閉じるのはいちばん上の1枚だけ');
  await new Promise((r) => setTimeout(r, 300));
  await press();
  eq([w1.closed, appCalls.slice(2)], [true, []], '次の戻るで次の1枚');
  doc.removeEventListener('backbutton', onUi);
  setWeb(makeLS());
  await tick();
  ok(appCalls.includes('remove:backButton'), '置き場所を選び直すと、前のつなぎは外す');
  delete SA.UI; delete globalThis.document;
}

console.log(`\n${pass} 件合格 / ${fail} 件不合格`);
process.exit(fail ? 1 : 0);
