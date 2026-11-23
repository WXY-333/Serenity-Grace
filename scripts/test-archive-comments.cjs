const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('templates/assets/js/archives.js', 'utf8');
class Element {
  constructor() { this.children = []; this.dataset = {}; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.append(item); }
  replaceChildren(...items) { this.children = items; }
  addEventListener() {}
  setAttribute() {}
  querySelectorAll() { return []; }
  closest() { return { getAttribute: () => this.count || '3' }; }
}

function comment(name, date, kind = 'Post') {
  return {
    metadata: { name, creationTimestamp: '2026-01-01T00:00:00Z' },
    spec: { approved: true, hidden: false, creationTime: date,
      content: '<b>hello</b>', subjectRef: { kind, name: `old-${name}` } },
    owner: { displayName: name }
  };
}

async function render(comments, count = '3', options = {}) {
  const container = new Element();
  container.count = count;
  const requests = [];
  const seed = comments === undefined ? null : { querySelectorAll: () => comments
    .filter(c => c.spec.approved && !c.spec.hidden && !c.metadata.deletionTimestamp)
    .map(c => ({ dataset: {
      commentName: c.metadata.name, created: c.spec.creationTime,
      content: c.spec.content, author: c.owner.displayName,
      subjectKind: c.spec.subjectRef.kind, subjectName: c.spec.subjectRef.name,
      permalink: '/custom-target'
    } })) };
  let activeSeed = seed;
  const context = vm.createContext({
    URL,
    DOMParser: class {
      parseFromString(text) { return { body: { textContent: text.replace(/<[^>]*>/g, '') } }; }
    },
    console: { warn() {} },
    document: {
      readyState: 'loading', addEventListener() {},
      getElementById: id => id === 'archiveCommentData' ? activeSeed : container,
      createElement: () => new Element()
    },
    window: {
      location: { origin: 'https://example.com' },
      SerenityCommentAvatar: options.noAvatarHelper ? undefined : {
        resolve: async () => { throw new Error('Avatar offline'); },
        sanitizeUrl: url => url.startsWith('/') ? url : ''
      }
    },
    fetch: async url => {
      requests.push(url);
      if (options.pendingConfig) return new Promise(() => {});
      if (options.offline) throw new Error('Offline');
      return { ok: true, json: async () => ({ status: { permalink: '/custom-target' } }) };
    }
  });
  if (options.realAvatarHelper) {
    vm.runInContext(fs.readFileSync('templates/assets/js/comment-avatar.js', 'utf8'), context);
  }
  vm.runInContext(source, context);
  await context.loadLatestComments();
  return { items: container.children, requests, context, container,
    setSeed: value => { activeSeed = value; } };
}

(async () => {
  const old = comment('old', '2026-01-01T00:00:00Z');
  old.spec.top = true;
  const latest = comment('latest', '2026-11-24T00:00:00Z');
  const page = comment('page', '2026-11-23T00:00:00Z', 'SinglePage');
  const pending = comment('pending', '2026-12-01T00:00:00Z');
  pending.spec.approved = false;
  const hidden = comment('hidden', '2026-12-01T00:00:00Z');
  hidden.spec.hidden = true;
  const deleted = comment('deleted', '2026-12-01T00:00:00Z');
  deleted.metadata.deletionTimestamp = '2026-12-01T00:00:00Z';
  const { items, requests } = await render([old, pending, hidden, deleted, page, latest], '2');
  assert.equal(items.length, 2);
  assert.equal(items[0].href, 'https://example.com/custom-target#comment-latest');
  assert.equal(items[1].href, 'https://example.com/custom-target#comment-page');
  assert.equal(items[0].children[0].children[1].textContent, 'hello');
  assert.equal(requests.length, 0, 'Comments must render without browser API requests');
  assert.equal((await render([])).items[0].textContent, '\u6682\u65e0\u8bc4\u8bba');
  assert.equal((await render(undefined)).items[0].textContent, '\u8bc4\u8bba\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u91cd\u8bd5');
  assert.equal((await render([latest], 'invalid', { offline: true })).items[0].className, 'comment-item');
  const noHelpers = await render([latest], '3', { noAvatarHelper: true, offline: true });
  assert.equal(noHelpers.items[0].href, 'https://example.com/custom-target#comment-latest');
  assert.equal(noHelpers.requests.length, 0);
  const slowAvatar = await render([latest], '3', { realAvatarHelper: true, pendingConfig: true });
  assert.equal(slowAvatar.items[0].className, 'comment-item', 'Pending avatar config must not block comments');
  assert.equal(slowAvatar.items[0].children[0].textContent, 'L');
  assert.equal(slowAvatar.items[0].children[1].children[1].textContent, 'hello');
  const repeated = await render([old]);
  repeated.setSeed({ querySelectorAll: () => [{ dataset: {
    commentName: 'latest', created: latest.spec.creationTime, content: 'new', permalink: '/new'
  } }] });
  await repeated.context.loadLatestComments();
  assert.equal(repeated.container.children.length, 1);
  assert(repeated.container.children[0].href.endsWith('#comment-latest'));
  const linkItems = ['first', 'second'].map(name => ({
    dataset: { subjectKind: 'Post', subjectName: name, commentName: name }, href: '/'
  }));
  const linkContainer = { querySelectorAll: () => linkItems };
  let linkRequests = 0;
  repeated.context.fetch = async () => { linkRequests += 1; return { status: 429, ok: false }; };
  await repeated.context.updateArchiveCommentLinks(linkContainer);
  assert.equal(linkRequests, 1, 'Stop resolving links when rate limited');
  assert.equal(linkItems[0].href, '/');
  repeated.context.fetch = async () => ({ status: 200, ok: true,
    json: async () => ({ status: { permalink: '/actual-post' } }) });
  await repeated.context.updateArchiveCommentLinks(linkContainer);
  assert.equal(linkItems[0].href, 'https://example.com/actual-post#comment-first');
  repeated.context.fetch = async () => { throw new Error('Offline'); };
  await repeated.context.updateArchiveCommentLinks(linkContainer);
  assert.equal(linkItems[0].href, 'https://example.com/actual-post#comment-first');
  const template = fs.readFileSync('templates/archives.html', 'utf8');
  assert(template.includes('th:with="comments=${commentFinder.list(null, 1, 0)}"'));
  assert(!template.includes('postFinder.getByName'));
  assert(!template.includes('singlePageFinder.getByName'));
  assert(!template.includes('window.__serenityArchiveComments'));
  console.log('Archive comment regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
