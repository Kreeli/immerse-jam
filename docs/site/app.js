(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  /* ---------- 浜旀鎴浘瀵艰 ---------- */
  const steps = [
    {
      image: 'assets/Win_home.png',
      alt: '闊充箰搴撳伐鍏锋爮鐨勫鍏ラ煶涔愭寜閽?,
      caption: '闊充箰搴擄細鐐瑰伐鍏锋爮銆屽鍏ラ煶涔愩€嶏紝鎴栫洿鎺ユ妸鏂囦欢鎷栬繘绐楀彛銆?,
      title: '鎷栬繘鏉ワ紝灏变粠杩欓噷寮€濮嬨€?,
      text: '鍦ㄣ€岄煶涔愬簱銆嶅伐鍏锋爮鐐广€屽鍏ラ煶涔愩€嶏紝鎴栨妸鏈湴闊抽銆佽棰戠洿鎺ユ嫋杩涚獥鍙ｃ€傚凡鏈夌殑 .ijam / .aum 椤圭洰涔熻兘瀵煎叆銆傜涓€娆″缓璁€変竴棣栧惉鐔熺殑姝屻€?,
      tip: '鍏堥€変竴棣栫啛鎮夌殑姝岋紝绗竴娆＄粌涔犳洿瀹规槗鎵惧埌鎰熻銆?,
      x: 47,
      y: 10,
    },
    {
      image: 'assets/Win_model.png',
      alt: '璁剧疆涓庢ā鍨嬬獥鍙ｏ紝搴曢儴鏄剧ず鎺ㄨ崘鐨?BS RoFormer SW 鍏建妯″瀷',
      caption: '璁剧疆涓庢ā鍨嬶細瑁呭ソ妯″瀷鍚庯紝鎵撳紑姝屾洸鐐瑰彸涓婅銆屽紑濮嬪垎鏋愩€嶃€?,
      title: '璁╃數鑴戞妸杩欓姝屾媶寮€銆?,
      text: '鍏堝畬鎴愬簲鐢ㄥ畨瑁咃紝鍐嶅埌渚ф爮銆岃缃笌妯″瀷銆嶆寜闇€涓嬭浇鎴栧鍏ャ€傛墦寮€姝屾洸鐐广€屽紑濮嬪垎鏋愩€嶏紝閫夋嫨鍒嗙妯″紡銆備笉鍚屾ā鍨嬬殑缁撴灉鍚勮嚜淇濆瓨锛屽彲闅忔椂鍒囨崲銆?,
      tip: '妯″瀷涓嬭浇鍙兘杈冩參锛屼篃鍙互鎵撳紑鍘熷鍙戝竷婧愰摼鎺ヤ笅杞斤紝鍐嶅鍏ユ湰鍦版枃浠跺す銆?,
      x: 40,
      y: 59,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '璺熺粌妯″紡宸ヤ綔鍙帮紝鍙充晶涓虹嫭绔嬮煶杞ㄦ帶鍒跺彴',
      caption: '璺熺粌妯″紡锛氬彸渚ф帶鍒跺彴閲屾壘鍒拌缁冪殑澹伴儴锛岀偣銆孧銆嶅叧闂０闊炽€?,
      title: '瑕佺粌鍝建锛屽氨鍏冲摢杞ㄣ€?,
      text: '浠庛€屼互杩欓姝屽垱寤恒€嶆垨渚ф爮鏂板缓璺熺粌銆傚彸渚ф帶鍒跺彴鍏虫帀浣犺婕斿鐨勫０閮紝鍓╀笅鐨勮嚜鍔ㄥ彉鎴愪即濂忋€傛兂鍚竻鍘熸紨濂忥紵鐢ㄣ€孲銆嶅崟鐙垨缁勫悎璇曞惉銆?,
      tip: '鎺у埗鍙板彲浠ユ粴鍔紝闊抽噺銆佸０鍍忛兘鑳介€愯建璋冦€?,
      x: 97,
      y: 56,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '璺熺粌椤靛乏涓婅鐨勫惊鐜钀芥寜閽紝鍙充笅瑙掑彲璋冩暣鎾斁閫熷害',
      caption: '寰幆缁冧範锛氱偣涓ゆ宸︿笂瑙掓寜閽寮€濮嬪拰缁撴潫锛屽簳鏍忓彸渚ц皟閫熷害銆?,
      title: '闅剧殑閭ｅ嚑绉掞紝澶氱粰鑷繁涓€鐐规椂闂淬€?,
      text: '鐐逛袱娆°€岃缃惊鐜钀姐€嶈濂借捣姝紝鎷栨尝褰㈠畾浣嶏紝閫熷害璋冨埌 0.5 鎱㈡參鍟冿紱闇€瑕佹椂鍗曠嫭绉昏皟銆傜啛浜嗗啀鍥炲埌鍘熼€熴€?,
      tip: '绌烘牸鎾斁/鏆傚仠锛孡 璁惧惊鐜綅缃紝M 鍔犳爣璁扮偣銆?,
      x: 42,
      y: 8,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '璺熺粌妯″紡搴曢儴鐨勭粌鐞村綍闊虫寜閽紝涓婁笅瀵归綈鏄剧ず浼村鍜屾紨濂忓綍闊?,
      caption: '褰曢煶鍥炲惉锛氬簳鏍忋€岀粌鐞村綍闊炽€嶅紑褰曪紝褰曢煶鍜屼即濂忔尝褰笂涓嬪榻愩€?,
      title: '褰曚笅鏉ワ紝鍚惉鑷繁鐨勮繘姝ャ€?,
      text: '鍏堣濂借緭鍏ヨ澶囥€佷即濂忚緭鍑哄拰澹伴亾锛岀偣搴曟爮銆岀粌鐞村綍闊炽€嶃€傚綍瀹屼粠褰曢煶搴撳洖鍚紝瀵圭潃娉㈠舰鐪嬭嚜宸辨槸鎶㈡媿杩樻槸鎷栨媿銆?,
      tip: '璇锋埓鑰虫満銆傝緭鍏ュ彧鏈変箰鍣ㄩ€夈€屽彧褰曚箰鍣ㄣ€嶏紝澹板崱宸叉贩鍏ヤ即濂忛€夈€屽０鍗″凡娣烽煶銆嶃€?,
      x: 20,
      y: 96,
    },
  ];
  const buttons = [...document.querySelectorAll('[data-step]')];
  const tour = $('tour-toggle');
  let current = 0;
  let timer = null;
  let playing = false;

  function showStep(index) {
    current = (index + steps.length) % steps.length;
    const step = steps[current];
    buttons.forEach((button, i) => {
      button.classList.toggle('active', i === current);
      if (i === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('guide-image').src = step.image;
    $('guide-image').alt = step.alt;
    const imageButton = $('guide-image-button');
    imageButton.dataset.image = step.image;
    imageButton.dataset.caption = step.caption;
    $('guide-heading').textContent = step.title;
    $('guide-text').textContent = step.text;
    $('guide-tip').textContent = step.tip;
    $('step-counter').textContent = `0${current + 1} / 05`;
    const hotspot = $('guide-hotspot');
    hotspot.style.setProperty('--x', `${step.x}%`);
    hotspot.style.setProperty('--y', `${step.y}%`);
    hotspot.textContent = String(current + 1);
  }

  function setTourPlaying(value) {
    playing = value;
    clearInterval(timer);
    timer = null;
    tour.setAttribute('aria-pressed', String(playing));
    tour.querySelector('.tour-icon').textContent = playing ? '鈪? : '鈻?;
    $('tour-label').textContent = playing ? '鏆傚仠鑷姩婕旂ず' : '鑷姩婕旂ず杩欎簲姝?;
    if (playing) timer = setInterval(() => showStep(current + 1), 6500);
  }
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      setTourPlaying(false);
      showStep(index);
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return;
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? steps.length - 1
            : (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + steps.length) %
              steps.length;
      setTourPlaying(false);
      showStep(next);
      buttons[next].focus();
    });
  });
  tour.addEventListener('click', () => setTourPlaying(!playing));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setTourPlaying(false);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setTourPlaying(false);
      },
      { threshold: 0.15 },
    ).observe(document.querySelector('.guide-layout'));
  }

  /* ---------- 鎴浘寮圭獥 ---------- */
  const dialog = $('image-dialog');
  document.querySelectorAll('[data-image]').forEach((button) => {
    button.addEventListener('click', () => {
      setTourPlaying(false);
      $('dialog-image').src = button.dataset.image;
      $('dialog-image').alt = button.querySelector('img').alt;
      $('image-caption').textContent = button.dataset.caption;
      dialog.showModal();
      document.body.classList.add('dialog-open');
      const imageWrap = dialog.querySelector('.dialog-image-wrap');
      imageWrap.scrollTo(0, 0);
      $('dialog-image')
        .decode()
        .then(() => {
          if (!dialog.open || button.id !== 'guide-image-button') return;
          imageWrap.scrollLeft =
            ($('dialog-image').clientWidth * steps[current].x) / 100 - imageWrap.clientWidth / 2;
          imageWrap.scrollTop =
            ($('dialog-image').clientHeight * steps[current].y) / 100 - imageWrap.clientHeight / 2;
        })
        .catch(() => {});
      if (window.innerWidth <= 560) $('image-caption').textContent += '锛堝彲宸﹀彸婊戝姩鏌ョ湅瀹屾暣鎴浘锛?;
    });
  });
  $('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  });
  dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));

  /* ---------- 鍏建鍒嗚建璇曞惉 ---------- */
  const TRACKS = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
  const ALL_AUDIO = ['original', ...TRACKS];
  const stemRows = [...document.querySelectorAll('#stem-list li')];
  if (stemRows.length && window.Audio) {
    const audios = {};
    ALL_AUDIO.forEach((name) => {
      const audio = new Audio(`assets/audio/fabulous-rehearsal/${name}.mp3`);
      audio.preload = 'metadata';
      audio.volume = 1;
      audios[name] = audio;
    });
    let clock = audios[TRACKS[0]];
    const state = {
      playing: false,
      muted: new Set(),
      solo: new Set(),
      mode: 'stems',
    };
    const playButton = $('stem-play');
    const seek = $('stem-seek');
    const currentLabel = $('stem-current');
    const durationLabel = $('stem-duration');

    const formatTime = (seconds) => {
      if (!Number.isFinite(seconds)) return '0:00';
      const s = Math.floor(seconds);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    function effectiveMuted(name) {
      if (state.muted.has(name)) return true;
      return state.solo.size > 0 && !state.solo.has(name);
    }

    function refreshMuteState() {
      stemRows.forEach((row) => {
        const name = row.dataset.track;
        audios[name].muted = effectiveMuted(name);
        row.classList.toggle('muted', effectiveMuted(name));
        row.querySelector('.stem-mute').setAttribute('aria-pressed', String(state.muted.has(name)));
        row.querySelector('.stem-solo').setAttribute('aria-pressed', String(state.solo.has(name)));
        row.querySelectorAll('button, input').forEach((control) => {
          control.disabled = state.mode === 'original';
        });
      });
    }

    function setPlaying(next) {
      state.playing = next;
      playButton.querySelector('span').textContent = next ? '鈪? : '鈻?;
      playButton.setAttribute(
        'aria-label',
        `${next ? '鏆傚仠' : '鎾斁'}${state.mode === 'original' ? '鍘熷褰曢煶' : '鍏ㄩ儴澹伴儴'}`,
      );
      if (next) {
        if (clock.ended) clock.currentTime = 0;
        (state.mode === 'original' ? ['original'] : TRACKS).forEach((name) => {
          if (
            Number.isFinite(audios[name].duration) &&
            Math.abs(audios[name].currentTime - clock.currentTime) > 0.03
          )
            audios[name].currentTime = clock.currentTime;
          audios[name].play().catch(() => {});
        });
      } else {
        ALL_AUDIO.forEach((name) => audios[name].pause());
      }
    }

    playButton.addEventListener('click', () => setPlaying(!state.playing));
    window.addEventListener('immerse-demo-start', () => setPlaying(false));

    document.querySelectorAll('[data-audio-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.audioMode === state.mode) return;
        const at = clock.currentTime,
          playing = state.playing;
        setPlaying(false);
        state.mode = button.dataset.audioMode;
        clock = audios[state.mode === 'original' ? 'original' : TRACKS[0]];
        if (Number.isFinite(clock.duration)) clock.currentTime = Math.min(at, clock.duration);
        document.querySelectorAll('[data-audio-mode]').forEach((item) => {
          item.setAttribute('aria-pressed', String(item === button));
        });
        durationLabel.textContent = formatTime(clock.duration);
        refreshMuteState();
        setPlaying(playing);
      });
    });

    ALL_AUDIO.forEach((name) => {
      audios[name].addEventListener('loadedmetadata', () => {
        durationLabel.textContent = formatTime(clock.duration);
      });
      audios[name].addEventListener('ended', () => {
        if (audios[name] === clock) setPlaying(false);
      });
    });

    let seeking = false;
    seek.addEventListener('input', () => {
      seeking = true;
    });
    seek.addEventListener('change', () => {
      const target = (Number(seek.value) / 1000) * (clock.duration || 0);
      ALL_AUDIO.forEach((name) => {
        if (Number.isFinite(audios[name].duration)) audios[name].currentTime = target;
      });
      seeking = false;
    });

    stemRows.forEach((row) => {
      const name = row.dataset.track;
      row.querySelector('.stem-mute').addEventListener('click', () => {
        if (state.muted.has(name)) state.muted.delete(name);
        else state.muted.add(name);
        refreshMuteState();
      });
      row.querySelector('.stem-solo').addEventListener('click', () => {
        if (state.solo.has(name)) state.solo.delete(name);
        else state.solo.add(name);
        refreshMuteState();
      });
      row.querySelector('.stem-volume').addEventListener('input', (event) => {
        audios[name].volume = Number(event.target.value) / 100;
      });
    });

    $('stem-reset').addEventListener('click', () => {
      state.muted.clear();
      state.solo.clear();
      TRACKS.forEach((name) => {
        audios[name].volume = 1;
      });
      document.querySelectorAll('.stem-volume').forEach((slider) => {
        slider.value = 100;
      });
      refreshMuteState();
    });

    // 杩涘害鏄剧ず涓庢紓绉讳慨姝?    setInterval(() => {
      if (!seeking && Number.isFinite(clock.duration) && clock.duration > 0) {
        seek.value = String((clock.currentTime / clock.duration) * 1000);
        currentLabel.textContent = formatTime(clock.currentTime);
      }
      if (!state.playing) return;
      (state.mode === 'original' ? ['original'] : TRACKS).forEach((name) => {
        const audio = audios[name];
        if (audio === clock || audio.paused) return;
        if (Math.abs(audio.currentTime - clock.currentTime) > 0.12) {
          audio.currentTime = clock.currentTime;
        }
      });
    }, 500);

    refreshMuteState();
  }

  /* ---------- 鏈€鏂扮増鏈俊鎭紙GitHub Releases API锛屽け璐ユ椂淇濈暀闈欐€佸厹搴曪級 ---------- */
  const versionEls = {
    windows: document.querySelector('[data-release-version="windows"]'),
    android: document.querySelector('[data-release-version="android"]'),
  };
  const releaseNameEl = document.querySelector('[data-release-name]');
  const releaseDateEl = document.querySelector('[data-release-date]');
  const releaseDateInlineEl = document.querySelector('[data-release-date-inline]');
  const releaseNotesEl = document.querySelector('[data-release-notes]');

  function findAsset(releases, pattern) {
    for (const release of releases) {
      if (release.draft) continue;
      const asset = (release.assets || []).find((item) => pattern.test(item.name));
      if (asset) return { release, asset };
    }
    return null;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  async function loadReleaseInfo() {
    if (!window.fetch) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('download/releases.json', {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const releases = await response.json();
      if (!Array.isArray(releases) || !releases.length) return;

      const win = findAsset(releases, /setup.*\.exe$/i);
      if (win && versionEls.windows) {
        versionEls.windows.textContent = win.release.tag_name || 'v0.1.12';
      }
      if (win && releaseDateEl && win.release.published_at) {
        releaseDateEl.textContent = `鍙戝竷浜?${formatDate(win.release.published_at)}`;
      }
      const android = findAsset(releases, /\.apk$/i);
      if (android && versionEls.android) {
        const match = android.asset.name.match(
          /android-([\d.]+(?:-[\w.]+)?)-(?:arm64|x86_64|x64)/i,
        );
        versionEls.android.textContent = match ? match[1] : '0.1.0-preview';
      }
      const latest = releases.find((release) => !release.draft) || {};
      if (releaseNameEl && latest.name) releaseNameEl.textContent = latest.name;
      if (releaseDateInlineEl && latest.published_at) {
        releaseDateInlineEl.textContent = `鍙戝竷浜?${formatDate(latest.published_at)}`;
      }
      if (releaseNotesEl && typeof latest.body === 'string' && latest.body.trim()) {
        const text = latest.body.trim();
        releaseNotesEl.textContent = text.slice(0, 600) + (text.length > 600 ? '鈥︹€? : '');
      }
    } catch {
      // 缃戠粶鎴栨帴鍙ｅけ璐ユ椂淇濈暀椤甸潰閲岀殑闈欐€佺増鏈俊鎭?    } finally {
      clearTimeout(timeout);
    }
  }
  loadReleaseInfo();
})();
