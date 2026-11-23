const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let onError;
const container = {
  closest: () => ({ getAttribute: () => 'false' }),
  addEventListener(type, handler, capture) {
    assert.equal(type, 'error');
    assert.equal(capture, true);
    onError = handler;
  }
};
vm.runInNewContext(fs.readFileSync('templates/assets/js/steam.js', 'utf8'), {
  document: { getElementById: () => container },
  // Leave the profile request pending: image recovery must already be installed.
  fetch: () => new Promise(() => {})
});

function image(icon = '') {
  const attempts = [];
  const classes = new Set();
  return {
    dataset: { appid: '3241660', icon }, attempts, classes,
    classList: { contains: name => name === 'steam-game-card-img' },
    parentElement: { classList: { add: name => classes.add(name) } },
    set src(url) { attempts.push(url); },
    removeAttribute(name) { assert.equal(name, 'src'); this.removed = true; }
  };
}

const missing = image('icon-hash');
for (let i = 0; i < 15; i++) onError({ target: missing });
assert.equal(missing.attempts.length, 4, 'Retries must stop after the last candidate');
assert.equal(new Set(missing.attempts).size, 4, 'Never retry the same failed URL');
assert(missing.attempts[0].includes('store_item_assets/steam/apps/3241660/library_600x900.jpg'));
assert(missing.attempts[3].endsWith('/3241660/icon-hash.jpg'));
assert.equal(missing.hidden, true);
assert.equal(missing.removed, true);
assert(missing.classes.has('steam-game-card--no-cover'));

const withoutIcon = image();
for (let i = 0; i < 10; i++) onError({ target: withoutIcon });
assert.equal(withoutIcon.attempts.length, 3);
assert.equal(withoutIcon.hidden, true);

const recovered = image();
onError({ target: recovered });
assert.equal(recovered.attempts.length, 1);
assert.equal(recovered.hidden, undefined, 'A successful fallback stays visible');
assert.equal(recovered.classes.size, 0);

const healthy = image();
assert.equal(healthy.attempts.length, 0, 'Healthy covers are unchanged');
onError({ target: { classList: { contains: () => false } } });
assert(!fs.readFileSync('templates/assets/js/steam.js', 'utf8').includes('onerror='));
console.log('Steam cover regression checks passed.');
