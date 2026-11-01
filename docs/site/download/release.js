/*
 * release.js — 下载页共用的 GitHub Releases 资产查找逻辑。
 *
 * 为什么不用 /releases/latest：Android 的 APK 挂在 pre-release 上，
 * latest 接口不返回 pre-release，所以要拉列表自己遍历。
 * 资产命名不规范（Setup / -Setup- / .Setup. 都出现过），只能按规则匹配，不能写死文件名。
 *
 * 浏览器里挂在 window.ReleaseFinder 上；Node 里 module.exports，方便离线测试。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && root.document) {
    root.ReleaseFinder = api;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var API_URL = 'https://api.github.com/repos/Kreeli/immerse-jam/releases?per_page=20';
  var FALLBACK_URL = 'https://github.com/Kreeli/immerse-jam/releases/latest';
  var RELEASES_URL = 'https://github.com/Kreeli/immerse-jam/releases';
  var TIMEOUT_MS = 4000;

  // 名字统一转小写后再比。规则：
  //   windows       文件名含 setup、以 .exe 结尾、不含 blockmap
  //   android-arm64 以 .apk 结尾且含 arm64
  //   android-x64   以 .apk 结尾且含 x86_64 或 x64，排除 arm64
  var MATCHERS = {
    windows: function (n) {
      return n.indexOf('setup') !== -1 && endsWith(n, '.exe') && n.indexOf('blockmap') === -1;
    },
    'android-arm64': function (n) {
      return endsWith(n, '.apk') && n.indexOf('arm64') !== -1;
    },
    'android-x64': function (n) {
      return endsWith(n, '.apk') && n.indexOf('arm64') === -1 && (n.indexOf('x86_64') !== -1 || n.indexOf('x64') !== -1);
    }
  };

  // 校验文件优先挑和本平台沾边的，挑不到就用 release 里第一个 SHA256SUMS*.txt
  var SUMS_HINTS = {
    windows: ['win', 'setup', 'exe'],
    'android-arm64': ['arm64', 'android', 'apk'],
    'android-x64': ['x86_64', 'x64', 'android', 'apk']
  };

  function endsWith(s, suffix) {
    return s.length >= suffix.length && s.lastIndexOf(suffix) === s.length - suffix.length;
  }

  // 拉 release 列表，约 4 秒拿不到就报错，让页面走兜底。
  function fetchReleases() {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('这个浏览器不支持 fetch'));
    }
    return new Promise(function (resolve, reject) {
      var settled = false;
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (controller) controller.abort();
        reject(new Error('请求 GitHub API 超时'));
      }, TIMEOUT_MS);

      function settle(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      }

      var request;
      try {
        request = fetch(API_URL, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: controller ? controller.signal : undefined
        });
      } catch (err) {
        settle(reject, err);
        return;
      }

      request.then(function (res) {
        if (!res.ok) throw new Error('GitHub API 返回 HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        if (!Array.isArray(data)) throw new Error('GitHub API 返回的不是列表');
        settle(resolve, data);
      }, function (err) {
        settle(reject, err);
      });
    });
  }

  // 按 API 返回顺序（最新在前）遍历，跳过 draft，第一个命中就用。
  // 这样挂 pre-release 上的 Android 包也能被找到。
  function findAsset(releases, kind) {
    var match = MATCHERS[kind];
    if (!match || !Array.isArray(releases)) return null;
    for (var i = 0; i < releases.length; i++) {
      var release = releases[i];
      if (!release || release.draft) continue;
      var assets = Array.isArray(release.assets) ? release.assets : [];
      for (var j = 0; j < assets.length; j++) {
        var asset = assets[j];
        if (!asset || typeof asset.name !== 'string' || !asset.browser_download_url) continue;
        if (match(asset.name.toLowerCase())) {
          return { asset: asset, release: release, sums: findSums(release, kind) };
        }
      }
    }
    return null;
  }

  function findSums(release, kind) {
    var assets = release && Array.isArray(release.assets) ? release.assets : [];
    var hints = SUMS_HINTS[kind] || [];
    var fallback = null;
    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];
      if (!asset || typeof asset.name !== 'string') continue;
      var n = asset.name.toLowerCase();
      if (!(n.indexOf('sha256') !== -1 && endsWith(n, '.txt'))) continue;
      if (!fallback) fallback = asset;
      for (var j = 0; j < hints.length; j++) {
        if (n.indexOf(hints[j]) !== -1) return asset;
      }
    }
    return fallback;
  }

  // size 是字节，给人看换算一下
  function formatSize(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return '—';
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  // published_at 形如 2026-01-02T03:04:05Z，取日期部分就够用
  function formatDate(iso) {
    if (typeof iso !== 'string' || iso.length < 10) return '—';
    return iso.slice(0, 10);
  }

  return {
    API_URL: API_URL,
    FALLBACK_URL: FALLBACK_URL,
    RELEASES_URL: RELEASES_URL,
    TIMEOUT_MS: TIMEOUT_MS,
    MATCHERS: MATCHERS,
    fetchReleases: fetchReleases,
    findAsset: findAsset,
    findSums: findSums,
    formatSize: formatSize,
    formatDate: formatDate
  };
});
