const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('templates/assets/js/comment-avatar.js', 'utf8');

class Element {
  constructor(tag) { this.tag = tag; this.events = {}; this.children = []; this.attempts = []; }
  setAttribute() {}
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) { this.events[type] = callback; }
  set src(value) { this.attempts.push(value); }
}

function setup(mode = 'auto', responses = {}) {
  const requests = [];
  const elements = [];
  const context = vm.createContext({
    URL, Map,
    window: { location: { origin: 'https://blog.example' } },
    document: {
      currentScript: { dataset: { commentProvider: mode } },
      createElement(tag) { const element = new Element(tag); elements.push(element); return element; }
    },
    fetch: async url => {
      requests.push(url);
      const value = responses[url.includes('commentnext') ? 'next' : 'official'];
      if (value instanceof Error) throw value;
      const status = value?.status || 200;
      return { status, ok: status === 200, json: async () => value?.config || {} };
    }
  });
  vm.runInContext(source, context);
  return { api: context.window.SerenityCommentAvatar, requests, elements, context };
}

const anonymous = {
  owner: { kind: 'Email', displayName: '云志' },
  spec: { owner: { annotations: { 'email-hash': 'abc123' } } }
};
const flush = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const next = setup('auto', { next: { config: {
    avatar: { fallbackAvatars: [{ url: '/avatars/default.webp' }, { url: 'javascript:alert(1)' }] }
  } } });
  const choices = await next.api.candidates(anonymous);
  assert.equal(choices[0], 'https://weavatar.com/avatar/abc123?d=404&f=webp&s=96');
  assert.equal(choices[1], 'https://blog.example/avatars/default.webp');
  assert.equal(choices.length, 2);
  await Promise.all([next.api.resolve(anonymous), next.api.resolve(anonymous)]);
  assert.equal(next.requests.length, 1, 'Cache config across comments');
  assert(next.requests[0].includes('api.commentnext.xhhao.com'));
  vm.runInContext(source, next.context);
  await next.context.window.SerenityCommentAvatar.resolve(anonymous);
  assert.equal(next.requests.length, 1, 'Reuse config after PJAX script execution');

  const wrapper = next.api.createElement(anonymous);
  assert.equal(wrapper.textContent, '云');
  await flush();
  const image = next.elements.find(element => element.tag === 'img');
  assert.equal(image.attempts.length, 1);
  image.events.error();
  assert.equal(image.attempts[1], choices[1]);
  image.events.error();
  image.events.error();
  assert.equal(image.attempts.length, 2, 'Stop when every URL has failed');
  assert.equal(wrapper.children.length, 0);
  assert.equal(wrapper.textContent, '云', 'Keep visible initials when all images fail');

  const successWrapper = next.api.createElement(anonymous);
  await flush();
  const successImage = next.elements.filter(element => element.tag === 'img').at(-1);
  successImage.events.error();
  successImage.events.load();
  assert.equal(successWrapper.children[0], successImage);

  const user = { owner: { avatar: '/user.webp', kind: 'User', displayName: 'User' } };
  assert.equal(await next.api.resolve(user), 'https://blog.example/user.webp');

  const official = setup('auto', {
    next: { status: 404 },
    official: { config: { avatar: { enable: true, providerMirror: 'https://avatar.example', policy: 'anonymousUser' } } }
  });
  assert.equal(await official.api.resolve(anonymous), 'https://avatar.example/avatar/abc123');
  assert.equal(official.requests.length, 2);

  const explicitOfficial = setup('official');
  await explicitOfficial.api.resolve(user);
  assert.equal(explicitOfficial.requests.length, 1);
  assert(explicitOfficial.requests[0].includes('api.commentwidget.halo.run'));

  const explicitNext = setup('next', { next: { status: 404 } });
  await explicitNext.api.resolve(anonymous);
  assert.equal(explicitNext.requests.length, 1, 'Explicit Next must not request official config');

  const limited = setup('auto', { next: { status: 429 } });
  await limited.api.candidates(anonymous);
  assert.equal(limited.requests.length, 1, 'Do not probe again when rate limited');
  const offline = setup('next', { next: new Error('Offline') });
  assert.equal(offline.api.createElement(anonymous).textContent, '云');
  await flush();
  assert.equal(offline.requests.length, 1);
  assert.equal(next.api.sanitizeUrl('javascript:alert(1)'), '');
  console.log('Comment Next and official avatar regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
