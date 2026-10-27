/* 忍び足（しのびあし）— キャラの絵 SA.Fig
 * art.js（NinjaArt.render）を包んで、ゲームで使う形にする。art.js・chars.js・sheet.js は変えない。
 *   状態（6欄）: normal / happy / surprised / serious / walk / hide（かくれる＝擬態）
 *   向き: front / quarter / side / back（NinjaArt.VIEWS のほかの名前や数値の yaw も受ける）
 *   染め: DYES の色で装束の主な色（と同系の色）を差し替える
 *   武器: weapon=false のとき、体ごとの表（WEAPON_PARTS）の部品を外す。孫市の銃は CONFIG.SHOW_GUN=false なら常に外す
 *   ラスタ化: SVG → Image → canvas（OffscreenCanvas があれば ImageBitmap）。25MB を目安に古いものから捨てる
 * ブラウザでも Node でも動く（Node では svg / def / silhouette だけ。el・bitmap・sheet6 はブラウザだけ）。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var A = root.NinjaArt || (typeof require !== 'undefined' ? require('./art.js') : null);
  var CH = root.NSL_CHARS || (typeof require !== 'undefined' ? require('./chars.js') : null);
  var DATA = SA.DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var U = A.util;
  var OUT = U.OUT;
  var seq = 0;

  /* ---------------- 武器の部品（体ごと） ----------------
   * chars.js の「武器」欄と art の定義を照らして決めた。外すのは weapon=false のとき。
   *   prop        … 手に持つ物（art.prop）
   *   back.katana … 背中・腰の刀（脇差を含む）
   *   back.tube   … 巻物の筒 / back.box … 笈（おい）
   *   halo        … 円光 / arrow … 頭の毒矢 / claws … 鉤爪 / obi.chain … 鎖鎌の鎖 / arms.beads … 数珠
   *   companion:<kind> … 相棒の欄にある武器（久遠の鬼火）
   * 相棒の動物（鷹・白蛇・パンダ・ひよこ・うさぎ・ミタマ・ヤーマ）と体の一部（カルラの翼）は武器ではないので残す。
   * 武器の欄が「なし」「—」の体（イズナ・ササガネ）は外す部品がない（ササガネの煙管は武器ではない）。 */
  var WEAPON_PARTS = {
    jin: ['prop', 'back.katana'],            // 手裏剣（＋背中の刀）
    sakuya: ['prop', 'back.katana'],         // 手裏剣
    kohaku: ['prop'],                        // 刀
    shiba: ['back.katana'],                  // 空手（背中の刀だけ）
    kanaoni: ['prop'],                       // 牛刀
    oto: ['prop', 'back.katana', 'back.tube'], // 巻物（筒も）
    rotten: ['arrow'],                       // 毒矢
    nagisa: ['prop', 'back.katana'],         // 巻物
    anne: ['prop', 'back.katana'],           // 団子
    dan: ['prop', 'back.katana'],            // 閃光刀
    hinanojoh: ['prop'],                     // 焙烙玉
    torika: ['prop', 'back.katana'],         // 手裏剣
    atoza: ['prop', 'back.katana'],          // 棍棒
    hayate: ['back.katana'],                 // 鷹（鷹は相棒なので残す。刀だけ）
    uka: ['prop'],                           // 護符
    ganzi: ['arms.beads'],                   // 数珠
    yui: ['prop'],                           // 巻物
    fuuta: ['back.katana'],                  // 正宗（腰の刀）
    rei: ['prop'],                           // 匕首
    sattva: ['halo'],                        // 円光
    nekomata: ['back.katana'],               // 妖刀村正
    janome: ['prop', 'back.katana'],         // 毒手裏剣（白蛇オロチは残す）
    benten: ['prop'],                        // 三味線
    karma: ['prop', 'obi.chain'],            // 鎖鎌
    ichiya: ['prop'],                        // 筆（虹は忍術なので残す）
    nemu: ['prop'],                          // 絵筆（ピヨチ・ウサピ・絵の具は残す）
    karura: [],                              // 羽（翼は体の一部なので残す）
    xiaolan: ['back.katana'],                // 太極拳（パンダのリーリーは残す）
    aum: ['prop', 'back.katana'],            // 棍棒
    konga: ['back.katana'],                  // 拳
    shion: ['claws'],                        // 鉤爪
    seori: ['prop'],                         // 木槌（ミタマは残す）
    quon: ['back.katana', 'companion:wisps'], // 鬼火
    magoichi: ['prop'],                      // 銃（SHOW_GUN=false なら weapon に関係なく外す）
    ibuki: ['prop'],                         // 呪符（ヤーマは残す）
    oen: ['back.box'],                       // 笈
    izuna: [],                               // なし
    sekishusai: ['back.katana'],             // 大典太（脇差も）
    sasagane: []                             // —
  };
  var GUN_IDS = ['magoichi'];

  /* ---------------- 染め ----------------
   * 主な色は公式の代表色（chars.js の color）にいちばん近い装束の色。表にある体はその指定を使う。
   * 主な色と同系（色の距離が近い）の装束の色は、明るさの差を保ったまま染め色に寄せる。 */
  var DYE_MAIN_FIELDS = ['top.color', 'over.color', 'bottom.color', 'hood.color', 'sleeves.color'];
  var DYE_FAMILY_FIELDS = ['top.color', 'top.trim', 'top.inner', 'top.lower', 'sleeves.color', 'bottom.color', 'over.color', 'hood.color', 'mask.color'];
  var DYE_OVERRIDE = {
    konga: { main: 'top.tasuki', fields: ['top.tasuki', 'bottom.color'] }, // ゴリラの体は灰色。たすきと下衣を染める
    magoichi: { main: 'over.color', fields: ['over.color', 'sleeves.color', 'bottom.color'] } // 上は素肌（入れ墨）。上着を染める
  };
  var FAMILY_DIST = 52;

  function rgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function dist(a, b) { var A1 = rgb(a), B1 = rgb(b); if (!A1 || !B1) return 999; return Math.sqrt(Math.pow(A1[0] - B1[0], 2) + Math.pow(A1[1] - B1[1], 2) + Math.pow(A1[2] - B1[2], 2)); }
  function getPath(o, p) { var k = p.split('.'); for (var i = 0; i < k.length; i++) { if (o == null || typeof o !== 'object') return undefined; o = o[k[i]]; } return o; }
  function setPath(o, p, v) { var k = p.split('.'); for (var i = 0; i < k.length - 1; i++) { if (o[k[i]] == null || typeof o[k[i]] !== 'object') return false; o = o[k[i]]; } o[k[k.length - 1]] = v; return true; }
  function delPath(o, p) { var k = p.split('.'); for (var i = 0; i < k.length - 1; i++) { if (o[k[i]] == null || typeof o[k[i]] !== 'object') return false; o = o[k[i]]; } if (!(k[k.length - 1] in o)) return false; delete o[k[k.length - 1]]; return true; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function charOf(id) { var c = CH && CH.BY_ID[id]; if (!c) throw new Error('SA.Fig: 知らない体 ' + id); return c; }
  function dyeColor(dyeId) {
    if (!dyeId || dyeId === 'none') return null;
    var list = (DATA && DATA.DYES) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === dyeId) return list[i].color ? list[i].color.toLowerCase() : null;
    if (/^#[0-9a-f]{6}$/i.test(dyeId)) return dyeId.toLowerCase(); // 開発用: 色そのもの
    return null;
  }
  // 主な色の場所を決める（表→公式の代表色にいちばん近い装束の色→top.color）
  function dyePlan(id, def) {
    if (DYE_OVERRIDE[id]) return DYE_OVERRIDE[id];
    var ch = charOf(id), best = 'top.color', bd = 1e9;
    DYE_MAIN_FIELDS.forEach(function (f) {
      var v = getPath(def, f); if (typeof v !== 'string') return;
      var d = dist(v, ch.color); if (d < bd - 0.5) { bd = d; best = f; }
    });
    return { main: best, fields: DYE_FAMILY_FIELDS };
  }
  function applyDye(id, def, col) {
    var plan = dyePlan(id, def);
    var main = getPath(def, plan.main);
    if (typeof main !== 'string') return [];
    var lm = U.lum(main), changed = [];
    var seen = {};
    plan.fields.concat([plan.main]).forEach(function (f) {
      if (seen[f]) return; seen[f] = true;
      var v = getPath(def, f);
      if (typeof v !== 'string' || !rgb(v)) return;
      if (f === 'mask.color' && def.mask && def.mask.kind !== 'cloth') return;
      var d = dist(v, main);
      var forced = DYE_OVERRIDE[id] != null; // 表で指定した場所はかならず染める
      if (!forced && d > FAMILY_DIST) return;
      var lv = U.lum(v), nv;
      if (d < 3) nv = col;
      else if (lv <= lm) nv = U.dk(col, clamp((lm - lv) / Math.max(lm, 0.06), 0, 0.75));
      else nv = U.lt(col, clamp((lv - lm) / Math.max(1 - lm, 0.06), 0, 0.75));
      setPath(def, f, nv); changed.push(f);
    });
    return changed;
  }
  function stripWeapons(id, def) {
    var removed = [];
    (WEAPON_PARTS[id] || []).forEach(function (p) {
      if (p.indexOf('companion:') === 0) {
        var kind = p.slice(10);
        if (def.companions) {
          var before = def.companions.length;
          def.companions = def.companions.filter(function (c) { return c.kind !== kind; });
          if (def.companions.length !== before) removed.push(p);
          if (!def.companions.length) delete def.companions;
        }
      } else if (delPath(def, p)) removed.push(p);
    });
    if (def.back && typeof def.back === 'object' && !Object.keys(def.back).length) delete def.back;
    return removed;
  }
  function stripGun(id, def) {
    if (GUN_IDS.indexOf(id) >= 0 && def.prop && def.prop.kind === 'pistol') { delete def.prop; return true; }
    return false;
  }

  // 描くための定義（複製してから染め・武器を反映）。テストからも使う
  function makeDef(id, opts) {
    opts = opts || {};
    var ch = charOf(id);
    var def = clone(ch.art);
    var info = { removed: [], dyed: [] };
    if (!opts.weapon) info.removed = stripWeapons(id, def);
    var showGun = DATA && DATA.CONFIG ? !!DATA.CONFIG.SHOW_GUN : false;
    if (!showGun && stripGun(id, def)) info.removed.push('gun');
    var col = dyeColor(opts.dye);
    if (col) info.dyed = applyDye(id, def, col);
    Object.defineProperty(def, '__info', { value: info, enumerable: false });
    return def;
  }

  /* ---------------- 状態 → ポーズ ---------------- */
  var STATES = ['normal', 'happy', 'surprised', 'serious', 'walk', 'hide'];
  var STATE_POSE = {
    normal: { pose: 'stand', fx: null },
    happy: { pose: 'happy', fx: 'joy' },
    surprised: { pose: 'surprised', fx: 'surprise' },
    serious: { pose: 'serious', fx: 'focus' },
    walk: { pose: 'walk', fx: null },
    hide: { pose: 'surprised', fx: null }
  };
  var STATE_LABEL = { normal: 'ふつう', happy: 'うれしい', surprised: 'びっくり', serious: 'しんけん', walk: 'あるく', hide: 'かくれる' };
  function yawOf(view, state) {
    if (typeof view === 'number') return view;
    if (view == null) view = state === 'walk' ? 'walkR' : 'front';
    var y = A.VIEWS[view];
    return y == null ? 0 : y;
  }

  /* ---- かくれる（擬態）: びっくり顔の体の前に、竹柄の布を張った枠（sheet.js の bambooCloth と同じ考え方を 200×240 に） ---- */
  function bambooCloth(x, y, w, h, uid) {
    var shape = 'M' + x + ' ' + y + 'h' + w + 'l-3 ' + h + 'q-' + (w / 2) + ' 8 -' + (w - 6) + ' 0Z';
    var o = '<defs><clipPath id="' + uid + 'cl"><path d="' + shape + '"/></clipPath></defs>';
    o += '<g clip-path="url(#' + uid + 'cl)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h + 12) + '" fill="#b9c79a"/>';
    var n = 4;
    for (var i = 0; i < n; i++) {
      var bx = x + 12 + i * (w - 24) / (n - 1);
      o += '<rect x="' + (bx - 6) + '" y="' + y + '" width="12" height="' + (h + 12) + '" fill="#8fa86a"/>';
      for (var j = 1; j < 6; j++) { var ny = y + j * h / 6 + (i % 2) * 12; o += '<path d="M' + (bx - 7) + ' ' + ny + 'h14" stroke="#6f8a4c" stroke-width="2.6"/>'; }
      o += '<path d="M' + (bx + 6) + ' ' + (y + 34 + i * 11) + 'q10 -5 15 4q-8 2 -15 -4Z" fill="#7a9a54"/>';
    }
    o += '</g>';
    o += '<path d="' + shape + '" fill="none" stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"/>';
    return o;
  }
  function clothFrame(x, y, w, h) {
    var col = '#c9a46a', dk = '#8a6a3a';
    return '<path d="M' + (x - 2) + ' ' + (y + h * 0.6) + 'l-12 ' + (h * 0.4 - 2) + 'M' + (x + w + 2) + ' ' + (y + h * 0.6) + 'l' + Math.min(12, 198 - x - w) + ' ' + (h * 0.4 - 2) + '" stroke="' + dk + '" stroke-width="5" stroke-linecap="round"/>' +
      '<g stroke="' + OUT + '" stroke-width="2.6" stroke-linejoin="round">' +
      '<rect x="' + (x - 7) + '" y="' + (y - 10) + '" width="9" height="' + (h + 12) + '" rx="2.5" fill="' + col + '"/>' +
      '<rect x="' + (x + w - 3) + '" y="' + (y - 10) + '" width="9" height="' + (h + 12) + '" rx="2.5" fill="' + col + '"/>' +
      '<rect x="' + (x - 14) + '" y="' + (y - 15) + '" width="' + Math.min(w + 26, 198 - (x - 14)) + '" height="9" rx="3" fill="' + col + '"/>' +
      '</g>';
  }
  function grass(x, y, n) {
    var o = '';
    for (var i = 0; i < n; i++) {
      var gx = x + i * 11 + (i % 3) * 2, h = 11 + (i * 7) % 8;
      o += '<path d="M' + gx + ' ' + y + 'q-2 ' + (-h * 0.6) + ' -6 ' + (-h) + 'M' + (gx + 3) + ' ' + y + 'q1 ' + (-h * 0.7) + ' 2 ' + (-h - 3) + 'M' + (gx + 6) + ' ' + y + 'q3 ' + (-h * 0.5) + ' 7 ' + (-h + 2) + '" stroke="#5b8a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    }
    return o;
  }
  function hideInner(def, opts, yaw) {
    var uid = 'sah' + (++seq).toString(36);
    var cx = 92, cy = 50, cw = 100, chh = 176;
    var o = '';
    o += clothFrame(cx, cy, cw, chh);
    o += '<g transform="translate(-14 4)">' + A.render(def, { raw: true, yaw: yaw, pose: 'surprised', expr: 'surprised', prop: false, companions: false, shadow: opts.shadow !== false }) + '</g>';
    o += bambooCloth(cx, cy, cw, chh, uid);
    o += grass(4, 236, 4) + grass(150, 236, 4);
    o += '<g stroke="#f08c1c" stroke-width="3" stroke-linecap="round"><path d="M22 88l-9 -6M19 99l-11 1M24 78l-5 -9"/></g>';
    return o;
  }

  /* ---------------- SVG ---------------- */
  function svgInner(id, opts) {
    opts = opts || {};
    var state = STATES.indexOf(opts.state) >= 0 ? opts.state : 'normal';
    var def = makeDef(id, opts);
    var yaw = yawOf(opts.view, state);
    if (state === 'hide') return hideInner(def, opts, opts.view == null || opts.view === 'front' ? -24 : yaw);
    var sp = STATE_POSE[state];
    var ro = { raw: true, yaw: yaw, pose: sp.pose, shadow: opts.shadow !== false };
    if (state === 'walk') ro.frame = ((opts.frame | 0) % 4 + 4) % 4;
    if (sp.fx && opts.fx !== false) ro.fx = sp.fx;
    if (opts.companions === false) ro.companions = false;
    return A.render(def, ro);
  }
  function wrapSvg(inner, opts) {
    opts = opts || {};
    var size = (opts.w ? ' width="' + opts.w + '"' : '') + (opts.h ? ' height="' + opts.h + '"' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"' + size + ' overflow="visible">' + inner + '</svg>';
  }
  function svg(id, opts) {
    opts = opts || {};
    if (opts.silhouette) return silhouette(id, opts);
    return wrapSvg(svgInner(id, opts), opts);
  }

  /* 来訪前の「？」影。輪郭の中を濃い灰で塗りつぶし、真ん中に「？」。opts.color で色、opts.q=false で「？」なし
   * （演出の金の縁取り・大きな影にも使う。そのときは opts.state / view / weapon で形を合わせる） */
  function silhouette(id, opts) {
    opts = opts || {};
    var uid = 'sas' + (++seq).toString(36);
    var col = opts.color || '#4a4650';
    var inner = svgInner(id, { state: opts.state || 'normal', view: opts.view || 'front', frame: opts.frame, weapon: !!opts.weapon, shadow: false, fx: false });
    var o = '<defs><filter id="' + uid + 'f" x="-10%" y="-10%" width="120%" height="120%"><feFlood flood-color="' + col + '"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>';
    if (opts.shadow !== false) o += '<ellipse cx="100" cy="233" rx="44" ry="8" fill="#3a2a1e" opacity=".16"/>';
    o += '<g filter="url(#' + uid + 'f)">' + inner + '</g>';
    if (opts.q !== false) {
      o += '<text x="100" y="168" text-anchor="middle" font-size="76" font-weight="900" fill="#f7f1e5" opacity=".92" font-family="\'Hiragino Maru Gothic ProN\',\'Hiragino Sans\',\'Yu Gothic\',\'Meiryo\',sans-serif">？</text>';
    }
    return wrapSvg(o, opts);
  }

  /* ---------------- ブラウザの部品 ---------------- */
  var hasDoc = typeof document !== 'undefined';
  function el(id, opts, cssSize) {
    var d = document.createElement('div');
    d.className = 'sa-fig';
    var w = cssSize == null ? 120 : cssSize;
    d.style.width = typeof w === 'number' ? w + 'px' : w;
    d.style.aspectRatio = '200 / 240';
    d.innerHTML = svg(id, Object.assign({}, opts || {}, { w: '100%', h: '100%' }));
    d.setAttribute('data-char', id);
    d.setAttribute('aria-hidden', 'true');
    return d;
  }
  function silhouetteEl(id, cssSize, opts) {
    return el(id, Object.assign({ silhouette: true }, opts || {}), cssSize);
  }

  // ラスタ化のキャッシュ（キー → { bmp, bytes }）。Map は入れた順なので、使ったら入れ直して「新しい」にする
  var CACHE_LIMIT = 25 * 1024 * 1024;
  var cache = typeof Map !== 'undefined' ? new Map() : null;
  var cacheBytes = 0;
  var pending = {};
  function cacheKey(id, opts, px) {
    var o = opts || {};
    return [id, o.state || 'normal', o.view == null ? '' : o.view, o.dye || 'none', o.weapon ? 1 : 0, o.frame | 0, o.shadow === false ? 0 : 1,
      o.silhouette ? 'S' + (o.color || '') + (o.q === false ? 'n' : 'q') : '', o.fx === false ? 0 : 1, o.companions === false ? 0 : 1, px].join('|');
  }
  function cachePut(k, bmp, bytes) {
    if (cache.has(k)) { cacheBytes -= cache.get(k).bytes; cache.delete(k); }
    cache.set(k, { bmp: bmp, bytes: bytes });
    cacheBytes += bytes;
    var it = cache.keys();
    while (cacheBytes > CACHE_LIMIT && cache.size > 1) {
      var old = it.next().value;
      if (old === k) continue;
      cacheBytes -= cache.get(old).bytes;
      cache.delete(old);
    }
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('SA.Fig: 絵を読み込めませんでした')); };
      im.src = src;
    });
  }
  /* px＝出力の高さ（画素）。幅は 200:240 の比で決まる。戻り値は ImageBitmap（OffscreenCanvas があるとき）か HTMLCanvasElement */
  function bitmap(id, opts, px) {
    px = Math.max(8, Math.round(px || 240));
    var k = cacheKey(id, opts, px);
    if (cache && cache.has(k)) {
      var hit = cache.get(k); cache.delete(k); cache.set(k, hit);
      return Promise.resolve(hit.bmp);
    }
    if (pending[k]) return pending[k];
    var w = Math.round(px * 200 / 240), h = px;
    var text = svg(id, Object.assign({}, opts || {}, { w: w, h: h }));
    var src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    var p = loadImage(src).then(function (im) {
      var out;
      if (typeof OffscreenCanvas !== 'undefined') {
        var oc = new OffscreenCanvas(w, h);
        oc.getContext('2d').drawImage(im, 0, 0, w, h);
        out = oc.transferToImageBitmap ? oc.transferToImageBitmap() : oc;
      } else {
        out = document.createElement('canvas');
        out.width = w; out.height = h;
        out.getContext('2d').drawImage(im, 0, 0, w, h);
      }
      if (cache) cachePut(k, out, w * h * 4);
      delete pending[k];
      return out;
    }, function (e) { delete pending[k]; throw e; });
    pending[k] = p;
    return p;
  }
  function clearCache() { if (cache) cache.clear(); cacheBytes = 0; }

  // ふりがな書式の文字を画面用にする（UI があれば SA.UI.furi、なければ書式を外す）
  function furiHtml(s) {
    if (SA.UI && typeof SA.UI.furi === 'function') return SA.UI.furi(s);
    return String(s).replace(/\{([^|}]+)\|([^}]+)\}/g, '$1').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }
  var styled = false;
  function ensureStyle() {
    if (styled || !hasDoc) return;
    styled = true;
    var st = document.createElement('style');
    // :where で詳細度を0にして、style.css から上書きしやすくする
    st.textContent = ':where(.sa-sheet6){display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}' +
      ':where(.sa-sheet6-cell){display:flex;flex-direction:column;align-items:center;margin:0;}' +
      ':where(.sa-sheet6-cell .sa-fig){width:100%;max-width:120px;}' +
      ':where(.sa-sheet6-cell figcaption){font-size:13px;line-height:1.6;}';
    (document.head || document.documentElement).appendChild(st);
  }
  /* 6欄（ふつう・うれしい・びっくり・しんけん・あるく・かくれる）。opts は dye / weapon / view / labels（ふりがな書式の6つ） */
  function sheet6(id, opts) {
    opts = opts || {};
    ensureStyle();
    var box = document.createElement('div');
    box.className = 'sa-sheet6';
    box.setAttribute('data-char', id);
    var labels = opts.labels || STATES.map(function (s) { return STATE_LABEL[s]; });
    STATES.forEach(function (s, i) {
      var cell = document.createElement('figure');
      cell.className = 'sa-sheet6-cell sa-st-' + s;
      var o = { state: s, dye: opts.dye, weapon: opts.weapon, frame: 1 };
      if (s !== 'hide') o.view = s === 'walk' ? (opts.view || 'walkR') : (opts.view || 'front');
      cell.appendChild(el(id, o, '100%'));
      var cap = document.createElement('figcaption');
      cap.innerHTML = furiHtml(labels[i]);
      cell.appendChild(cap);
      box.appendChild(cell);
    });
    return box;
  }

  SA.Fig = {
    STATES: STATES,
    STATE_LABEL: STATE_LABEL,
    VIEWS: ['front', 'quarter', 'side', 'back'],
    WEAPON_PARTS: WEAPON_PARTS,
    svg: svg,
    def: makeDef,
    silhouette: silhouette,
    el: hasDoc ? el : function () { throw new Error('SA.Fig.el はブラウザだけ'); },
    silhouetteEl: hasDoc ? silhouetteEl : function () { throw new Error('SA.Fig.silhouetteEl はブラウザだけ'); },
    bitmap: hasDoc ? bitmap : function () { return Promise.reject(new Error('SA.Fig.bitmap はブラウザだけ')); },
    sheet6: hasDoc ? sheet6 : function () { throw new Error('SA.Fig.sheet6 はブラウザだけ'); },
    clearCache: clearCache,
    cacheInfo: function () { return { entries: cache ? cache.size : 0, bytes: cacheBytes, limit: CACHE_LIMIT }; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.Fig;
})(typeof window !== 'undefined' ? window : globalThis);
