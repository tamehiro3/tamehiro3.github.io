/* ニンジャ相棒道場 — 物語（5章：出会い → 初めての失敗 → 方針の違い → 協力 → 師匠の試験）
 * 会話は本作の創作（公式設定ではない）。{p}＝相棒の呼び名、{I}＝相棒の一人称、{E}＝名詞のあとの語尾、{V}＝動詞のあとの語尾。
 * 評価や振り返りの文は、修行で実際に起きた出来事（result.events）だけから作る。
 */
(function (root) {
  'use strict';

  // 1行 = [話す人, 文]。話す人は公式キャラの id / 'partner' / 'nar'（地の文）
  var CH = {
    ch1: {
      intro: [
        ['hayate', 'よく来たな、見習い。ここは里のはずれにある「相棒道場」だ。'],
        ['hayate', 'この道場では、相棒といっしょに修行をする。相棒は、きみが教えたことを覚えて、自分で考えて動く。'],
        ['hayate', 'まずは、きみの相棒を決めよう。見た目と呼び名を選んでくれ。']
      ],
      met: [
        ['partner', '{I}が{p}{E}！ いっしょに修行、がんばろうね！'],
        ['hayate', 'いい相棒だ。では、さっそく修行の道へ出よう。最初の修行は、わしが見る。']
      ],
      pre: [
        ['hayate', '道の先に、課題を置いておいた。まずは歩いてみろ。']
      ],
      end: [
        ['hayate', '最初の修行は、ここまでだ。']
      ]
    },
    ch2: {
      pre: [
        ['konga', 'ウホッ！ 今日の修行はオレが見る。救助修行だ！'],
        ['konga', 'まきびしの向こうにも、へとへとの仲間がいる。{p}がどう動くか、よく見ておけ！']
      ],
      postFail: [
        ['konga', 'ウホ……今日は、うまくいかない場面があったな。これが「初めての失敗」だ。'],
        ['konga', '失敗はわるいことじゃない。どこでつまずいたか振り返って、教えればいい！'],
        ['konga', '今日から「安全を優先」の作戦が使えるぞ。まきびしや煙の中には入らない作戦だ。']
      ],
      postOk: [
        ['konga', 'ウホッ！ 大きな失敗はなかったな！'],
        ['konga', 'だが、危ない場面はあったはずだ。振り返って、次に生かせ！'],
        ['konga', '今日から「安全を優先」の作戦が使えるぞ。まきびしや煙の中には入らない作戦だ。']
      ]
    },
    ch3: {
      pre: [
        ['magoichi', 'よう、見習い。今日は探索修行だ。宝も巻物も、見つけたもん勝ちだぜ。'],
        ['benten', 'あら、孫市はんはそう言わはるけど……うちは、仲間を置いていかへんのが一番やと思いますえ。'],
        ['magoichi', 'どっちが正しいかは、{p}の動きで確かめてみな。']
      ],
      post: [
        ['magoichi', 'なるほどな。{p}なりに、ちゃんと考えて動いてたぜ。'],
        ['benten', 'どっちのやり方でも、道はあるってことどすなぁ。'],
        ['magoichi', 'ああ。場面に合わせて、作戦を使い分けりゃいい。'],
        ['nar', '作戦の枠がひとつ増えた（探索型）。「探索を優先」「敵を先に」の作戦も使えるようになった。']
      ]
    },
    ch4: {
      pre: [
        ['rei', '今日は護衛修行です。結が、術の巻物を門まで運びます。'],
        ['yui', 'よろしくお願いします。からくりが来たら、守ってくださいね。'],
        ['rei', 'ひとりで全部しようとしないこと。{p}と役わりを分けるのが、協力です。']
      ],
      postOk: [
        ['yui', '無事に着きました。ありがとうございます！'],
        ['rei', 'おふたりの役わり分け、見事でした。'],
        ['nar', '作戦の枠がひとつ増えた（護衛型）。「護衛を守る」の作戦も使えるようになった。']
      ],
      postFail: [
        ['yui', '今日は、道場にもどることにしました……'],
        ['rei', 'だいじょうぶ。役わりの分け方は、きっと見えてきたはずです。'],
        ['nar', '作戦の枠がひとつ増えた（護衛型）。「護衛を守る」の作戦も使えるようになった。']
      ]
    },
    ch5: {
      pre: [
        ['hayate', '師匠の試験だ。救助・探索・護衛の3つの段を、続けて行う。'],
        ['hayate', '段がかわるごとに、作戦を切りかえてよい。作戦の枠を、うまく使え。']
      ],
      stage: [
        ['hayate', '救助の段だ。へとへとの仲間を、全員助け起こせ。'],
        ['hayate', '探索の段だ。かくされた巻物を見つけろ。作戦を切りかえるなら、今だ。'],
        ['hayate', '護衛の段だ。運び役を守りながら、大からくりを止めろ。']
      ],
      postOk: [
        ['hayate', '……合格だ。'],
        ['hayate', '{p}は、きみが教えたことを覚えて、場面に合わせて動けるようになった。'],
        ['hayate', 'これで、きみたちは一人前の相棒だ。これからも、この道場で修行を続けるといい。']
      ],
      postFail: [
        ['hayate', '今日はここまでだ。'],
        ['hayate', '試験は何度でも受けられる。作戦を見直して、また来い。']
      ]
    }
  };

  // 最初の修行（ch1）の案内。sim の合図（signal）に合わせて出す
  var GUIDE = {
    start: ['hayate', '指でなぞると歩ける（パソコンは矢印キーかWASD）。からくりに近づくと、自動で攻撃するぞ。あの木人を止めてみろ。'],
    autoAttack: ['hayate', 'いいぞ。近づくだけで攻撃できる。'],
    commands: ['hayate', '相棒には3つの指示が出せる。「集合」「助けて」「下がって」だ。ためしに「集合」を押してみろ。'],
    commandDone: ['hayate', '指示は、相棒の考えより優先される。困ったときに使え。では、門の先へ進もう。'],
    watch1: ['hayate', 'ここからは「見守りタイム」だ。宝箱と、へとへとの仲間がいる。{p}がどうするか、見ていよう。'],
    after1: ['hayate', '{p}は{first}を先に選んだな。選んだ理由も、カードに出ている。きみも、へとへとの仲間や宝箱のそばで止まれば、助け起こしたり調べたりできるぞ。'],
    review1: ['hayate', 'では、振り返ろう。{p}の判断に、きみはどう教える？ 教えたことは、次の課題ですぐ確かめられる。'],
    watch2: ['hayate', 'さっきと配置を変えた、似た課題だ。教えたことが、{p}の行動にどう出るか見てみよう。'],
    boss: ['hayate', '最後は、からくり小将だ。{p}といっしょに止めてみろ。赤い輪が出たら「回避」で外へ出ろ！'],
    partnerDown: ['hayate', '{p}がへとへとだ！ そばに行って3秒じっとしていれば、助け起こせる。'],
    playerDown: ['hayate', 'きみがへとへとになった。{p}が助けに来るのを待つか、「助けて」を押せ。']
  };
  // 見守りの結果に合わせた、ひとこと（実際の行動から）
  function verifyLine(taughtId, firstAct, partnerName) {
    var p = partnerName;
    var did = firstAct === 'rescue' ? '仲間を先に助けた' : (firstAct === 'search' ? '宝箱を先に調べた' : '別の行動をえらんだ');
    if (taughtId === 'next_rescue') return firstAct === 'rescue' ? '教えたとおり、' + p + 'は仲間を先に助けたな！ 前は宝箱、今は救助。変わった理由も、カードで見られる。' : p + 'は' + did + '。まだ宝箱が気になるらしい。作戦「仲間を優先」もいっしょに教えると、はっきり変わるぞ。';
    if (taughtId === 'keep') return firstAct === 'search' ? '「この行動を続ける」と教えたから、' + p + 'は今回も宝箱を先に調べた。教えたとおりだ。' : p + 'は' + did + '。';
    if (taughtId === 'safety') return '「安全を優先」は、危ない場所で効く作戦だ。宝箱と仲間のどちらを先にするかは、変わらなかったな（' + p + 'は' + did + '）。';
    if (!taughtId) return '今回は何も教えなかったから、' + p + 'は前と同じ考えで動いた（' + did + '）。';
    return p + 'は' + did + '。';
  }

  // 次に教えたいこと（最初の修行のあと）
  var NEXT_FOCUS = [
    { id: 'rescue', label: '危ない場所での助け方', kind: 'rescue', note: '救助修行がおすすめ。第2章でコンガが待っている。' },
    { id: 'explore', label: '探し物のコツ', kind: 'explore', note: '探索修行がおすすめ。' },
    { id: 'escort', label: '守りながら進むこと', kind: 'escort', note: '護衛修行がおすすめ。' }
  ];

  // 師匠の評価：実際の出来事だけを数える
  function evaluation(result, masterName, partnerName) {
    var ev = result.events || [], out = [];
    var byP = function (t) { return ev.filter(function (e) { return e.type === t && e.who === 'partner'; }).length; };
    var byY = function (t) { return ev.filter(function (e) { return e.type === t && e.who === 'player'; }).length; };
    var rP = byP('rescue'), rY = byY('rescue'), cP = byP('chest'), sP = byP('scroll'), sY = byY('scroll'), stP = byP('stop') + byP('boss'), stY = byY('stop') + byY('boss');
    var rv = ev.filter(function (e) { return e.type === 'revive'; });
    var parts = [];
    if (rP) parts.push(partnerName + 'が' + rP + '人を助け起こした');
    if (rY) parts.push('きみが' + rY + '人を助け起こした');
    if (sP + sY) parts.push('巻物を' + (sP + sY) + 'つ見つけた' + (sP ? '（' + partnerName + 'が' + sP + 'つ）' : ''));
    else if (cP) parts.push(partnerName + 'が宝箱を' + cP + 'つ開けた');
    if (stP + stY) parts.push('からくりを' + (stP + stY) + '体止めた' + (stP ? '（' + partnerName + 'が' + stP + '体）' : ''));
    rv.forEach(function (e) { parts.push(e.who === 'player' ? 'へとへとの' + partnerName + 'を、きみが助けた' : 'へとへとのきみを、' + partnerName + 'が助けた'); });
    if (ev.some(function (e) { return e.type === 'arrive'; })) parts.push('運び役を門まで送りとどけた');
    if (ev.some(function (e) { return e.type === 'gaveup'; })) parts.push('待ちきれずに帰った仲間がいた');
    out.push(parts.length ? parts.join('。') + '。' : '今日は、大きな出来事はなかった。');
    return out.join('');
  }

  var api = { CH: CH, GUIDE: GUIDE, verifyLine: verifyLine, NEXT_FOCUS: NEXT_FOCUS, evaluation: evaluation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NAD_STORY = api;
})(typeof window !== 'undefined' ? window : globalThis);
