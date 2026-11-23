/**
 * Theme: theme-Serenity
 * Author: Serenity
 * Build: 2026-10-01 20:34:46
 * Fingerprint: 9ac9d5b43683cf67
 * Copyright (c) 2026 Serenity. All rights reserved.
 */

/**
 * Theme: theme-Serenity
 * Author: Serenity
 * Build: 2026-08-31 17:36:30
 * Fingerprint: 897f796e1b7f0d91
 * Copyright (c) 2026 Serenity. All rights reserved.
 */

/**
 * Theme: theme-Serenity
 * Author: Serenity
 * Build: 2026-07-05 00:01:15
 * Fingerprint: 1a93cc3686d739b8
 * Copyright (c) 2026 Serenity. All rights reserved.
 */

(function () {
  const mode = document.currentScript?.dataset.commentProvider || 'auto';
  const configCache = window.__serenityCommentAvatarConfigs || new Map();
  window.__serenityCommentAvatarConfigs = configCache;

  function getAnnotations(item) {
    return item?.spec?.owner?.annotations || {};
  }

  function getEmailHash(item) {
    return getAnnotations(item)['email-hash'] || '';
  }

  function getOwnerAvatar(item) {
    return item?.owner?.avatar || '';
  }

  function getOwnerKind(item) {
    return item?.owner?.kind || '';
  }

  function sanitizeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim(), window.location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function withSeedParam(url, seed) {
    return `${url}${url.includes('?') ? '&' : '?'}_avatar=${encodeURIComponent(seed)}`;
  }

  function resolveCustomAvatar(url, seed) {
    const source = (url || '').trim();
    const safeSeed = seed || 'anonymous';

    if (!source) {
      return '';
    }

    if (/\{(?:hash|seed)\}/.test(source)) {
      return sanitizeHttpUrl(source
        .replace(/\{hash\}/g, encodeURIComponent(safeSeed))
        .replace(/\{seed\}/g, encodeURIComponent(safeSeed)));
    }

    return sanitizeHttpUrl(withSeedParam(source, safeSeed));
  }

  function resolveProviderAvatar(config, seed) {
    const avatar = config?.avatar || {};
    const provider = avatar.provider || 'gravatar';
    const mirror = avatar.providerMirror || '';

    if (provider === 'custom') {
      return resolveCustomAvatar(mirror, seed);
    }

    const baseUrl = (mirror || 'https://gravatar.com').replace(/\/+$/, '');
    return sanitizeHttpUrl(`${baseUrl}/avatar/${seed || ''}`);
  }

  async function requestConfig(provider) {
    const group = provider === 'next' ? 'api.commentnext.xhhao.com' : 'api.commentwidget.halo.run';
    const response = await fetch(`/apis/${group}/v1alpha1/config`, {
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(5000) : undefined
    });
    return { provider, status: response.status, config: response.ok ? await response.json() : null };
  }

  async function fetchConfig() {
    if (!configCache.has(mode)) {
      const pending = (async function () {
        if (mode === 'official') return requestConfig('official');
        const next = await requestConfig('next');
        // A missing Next endpoint means the official component may be installed.
        // Do not send another request when the server is rate limiting us.
        if (mode === 'auto' && next.status === 404) return requestConfig('official');
        return next;
      })().catch(() => ({ provider: mode, config: null }));
      configCache.set(mode, pending);
    }
    return configCache.get(mode);
  }

  async function resolveCommentAvatar(item) {
    const ownerAvatar = sanitizeHttpUrl(getOwnerAvatar(item));
    const result = await fetchConfig();
    const config = result.config;
    if (result.provider === 'next') {
      const hash = getEmailHash(item);
      return ownerAvatar || (hash ? `https://weavatar.com/avatar/${encodeURIComponent(hash)}?d=404&f=webp&s=96` : '');
    }
    const avatarConfig = config?.avatar;

    if (!avatarConfig?.enable) {
      return ownerAvatar;
    }

    const ownerKind = getOwnerKind(item);
    const isAnonymous = ownerKind === 'Email';
    const seed = getEmailHash(item);
    const policy = avatarConfig.policy || 'anonymousUser';

    if (policy === 'allUser') {
      return resolveProviderAvatar(config, seed);
    }

    if (policy === 'noAvatarUser' && (isAnonymous || !ownerAvatar)) {
      return resolveProviderAvatar(config, seed);
    }

    if (isAnonymous) {
      return resolveProviderAvatar(config, seed);
    }

    return ownerAvatar;
  }

  function identityHash(value) {
    let hash = 2166136261;
    for (const char of value.trim().toLowerCase()) {
      hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    }
    return hash >>> 0;
  }

  async function avatarCandidates(item) {
    const primary = await resolveCommentAvatar(item);
    const result = await fetchConfig();
    const pool = result.provider === 'next'
      ? (result.config?.avatar?.fallbackAvatars || []).map(entry => sanitizeHttpUrl(entry?.url)).filter(Boolean)
      : [];
    const identity = getEmailHash(item) || item?.owner?.displayName || item?.metadata?.name || 'anonymous';
    const fallback = pool.length ? pool[identityHash(identity) % pool.length] : '';
    return [...new Set([primary, fallback].filter(Boolean))];
  }

  function createAvatarElement(item) {
    const author = item?.owner?.displayName || '匿名';
    const wrapper = document.createElement('span');
    wrapper.className = 'comment-avatar comment-avatar-placeholder';
    wrapper.textContent = Array.from(author.trim())[0]?.toUpperCase() || '?';
    wrapper.setAttribute('role', 'img');
    wrapper.setAttribute('aria-label', author);
    // Text is immediately visible, even while the optional config endpoint is slow.
    avatarCandidates(item).then(sources => {
      if (!sources.length) return;
      const image = document.createElement('img');
      image.alt = author;
      let index = 0;
      image.addEventListener('load', () => wrapper.replaceChildren(image), { once: true });
      image.addEventListener('error', () => {
        index += 1;
        if (index < sources.length) image.src = sources[index];
      });
      image.src = sources[index];
    }).catch(() => {});
    return wrapper;
  }

  window.SerenityCommentAvatar = {
    resolve: resolveCommentAvatar,
    candidates: avatarCandidates,
    createElement: createAvatarElement,
    sanitizeUrl: sanitizeHttpUrl,
  };
})();
