// Node で判定とデータを読みこむ（ブラウザと同じ順番）。globalThis に NYT_* がそろう。
const path = require('path');
const dir = path.join(__dirname, '..');
const files = ['../ninja-sato-life/chars.js', 'data_base.js', 'data_skills.js', 'data_chars.js', 'data_items.js', 'data_enemies.js', 'data_maps.js', 'data_story.js', 'state.js', 'battle.js', 'field.js', 'script.js'];
const fs = require('fs');
for (const f of files) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) require(p);
}
module.exports = globalThis;
