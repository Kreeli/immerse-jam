(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  /* ---------- 五步截图导览 ---------- */
  const steps = [
    {
      image: 'assets/Win_home.png',
      alt: '音乐库右上角的导入音乐按钮',
      caption: '音乐库：点右上角「导入音乐」，或直接把文件拖进窗口。',
      title: '拖进来，就从这里开始。',
      text: '在「音乐库」点右上角「导入音乐」，或把本地音频、视频直接拖进窗口。已有的 .ijam / .aum 项目也能导入。第一次建议选一首听熟的歌。',
      tip: '先选一首熟悉的歌，第一次练习更容易找到感觉。',
      x: 94,
      y: 12,
    },
    {
      image: 'assets/Win_model.png',
      alt: '设置与模型窗口，底部显示推荐的 BS RoFormer SW 六轨模型',
      caption: '设置与模型：装好模型后，打开歌曲点右上角「开始分析」。',
      title: '让电脑把这首歌拆开。',
      text: '安装时选推荐模型，或在侧栏「设置与模型」里补装。打开歌曲点「开始分析」，按需要选分离模式。模型可以随时换，不同结果各自保存。',
      tip: '默认推荐六轨 BS RoFormer SW；配置低可选轻量四轨。',
      x: 47,
      y: 91,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '跟练模式工作台，右侧为独立音轨控制台',
      caption: '跟练模式：右侧控制台里找到要练的声部，点「M」关闭声音。',
      title: '要练哪轨，就关哪轨。',
      text: '从「以这首歌创建」或侧栏新建跟练。右侧控制台关掉你要演奏的声部，剩下的自动变成伴奏。想听清原演奏？用「S」单独或组合试听。',
      tip: '控制台可以滚动，音量、声像都能逐轨调。',
      x: 91,
      y: 20,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '跟练页左上角的循环段落按钮，右下角可调整播放速度',
      caption: '循环练习：点两次左上角按钮设开始和结束，底栏右侧调速度。',
      title: '难的那几秒，多给自己一点时间。',
      text: '点两次「设置循环段落」设好起止，拖波形定位，速度调到 0.5 慢慢啃；需要时单独移调。熟了再回到原速。',
      tip: '空格播放/暂停，L 设循环位置，M 加标记点。',
      x: 18,
      y: 13,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '跟练模式底部的练琴录音按钮，上下对齐显示伴奏和演奏录音',
      caption: '录音回听：底栏「练琴录音」开录，录音和伴奏波形上下对齐。',
      title: '录下来，听听自己的进步。',
      text: '先设好输入设备、伴奏输出和声道，点底栏「练琴录音」。录完从录音库回听，对着波形看自己是抢拍还是拖拍。',
      tip: '请戴耳机。输入只有乐器选「只录乐器」，声卡已混入伴奏选「声卡已混音」。',
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
    tour.querySelector('.tour-icon').textContent = playing ? 'Ⅱ' : '▶';
    $('tour-label').textContent = playing ? '暂停自动演示' : '自动演示这五步';
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

  /* ---------- 截图弹窗 ---------- */
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
      if (window.innerWidth <= 560) $('image-caption').textContent += '（可左右滑动查看完整截图）';
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

  /* ---------- 六轨分轨试听 ---------- */
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
      playButton.querySelector('span').textContent = next ? 'Ⅱ' : '▶';
      playButton.setAttribute(
        'aria-label',
        `${next ? '暂停' : '播放'}${state.mode === 'original' ? '原始录音' : '全部声部'}`,
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

    // 进度显示与漂移修正
    setInterval(() => {
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

  /* ---------- 最新版本信息（GitHub Releases API，失败时保留静态兜底） ---------- */
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
        versionEls.windows.textContent = win.release.tag_name || 'v0.1.11';
      }
      if (win && releaseDateEl && win.release.published_at) {
        releaseDateEl.textContent = `发布于 ${formatDate(win.release.published_at)}`;
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
        releaseDateInlineEl.textContent = `发布于 ${formatDate(latest.published_at)}`;
      }
      if (releaseNotesEl && typeof latest.body === 'string' && latest.body.trim()) {
        const text = latest.body.trim();
        releaseNotesEl.textContent = text.slice(0, 600) + (text.length > 600 ? '……' : '');
      }
    } catch {
      // 网络或接口失败时保留页面里的静态版本信息
    } finally {
      clearTimeout(timeout);
    }
  }
  loadReleaseInfo();
})();
