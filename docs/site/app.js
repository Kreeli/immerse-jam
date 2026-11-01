(() => {
  'use strict';
  const steps = [
    {
      image: 'assets/Win_home.png',
      alt: '音乐库右上角的导入音乐按钮',
      caption: '音乐库：点击右上角「导入音乐」，或直接拖入本地音频。',
      title: '拖进来，就从这里开始。',
      text: '在「音乐库」点击右上角「导入音乐」，或把本地音频、视频直接拖进窗口。已有 .ijam / .aum 项目也可以导入。',
      tip: '先选一首熟悉的歌，第一次练习更容易找到感觉。',
      x: 94,
      y: 12,
    },
    {
      image: 'assets/Win_model.png',
      alt: '设置与模型窗口，底部显示推荐的 BS RoFormer SW 六轨模型',
      caption: '设置与模型：安装或补装模型后，打开歌曲并点击右上角「开始分析」。',
      title: '让电脑，拆开这首歌。',
      text: '安装时选择推荐模型，或在侧栏「设置与模型」补装。打开歌曲，点击「开始分析」，按需要选择分离模式；分析完成后，各声部可独立调节。',
      tip: '默认推荐 BS RoFormer SW 六轨；也可按用途选择轻量四轨或专用模型。',
      x: 47,
      y: 91,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '跟练模式工作台，右侧为独立音轨控制台',
      caption:
        '跟练模式：在右侧控制台找到要练的声部，点击「关闭声音」。截图中控制台已滚动到录音音轨。',
      title: '把主角的位置，留给自己。',
      text: '从歌曲的「以这首歌创建」或侧栏「跟练/创作」新建跟练。右侧控制台中关闭你要演奏的声部，其他声部继续作为伴奏。',
      tip: '控制台可以滚动。想听清原演奏？用「选听」单独或组合试听声部。',
      x: 91,
      y: 20,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '跟练页左上角的循环段落按钮，右下角可调整播放速度',
      caption: '循环练习：点两次左上角按钮设置开始和结束；底栏右侧可调整播放速度。',
      title: '难的那几秒，多给自己一点时间。',
      text: '在左上角点两次「设置循环段落」按钮，分别设置开始和结束。拖动波形定位，调低底栏右侧的播放速度；需要时在控制台独立移调。',
      tip: '空格播放 / 暂停，L 设置循环位置，M 添加标记点。先慢练，再回到原速。',
      x: 18,
      y: 13,
    },
    {
      image: 'assets/Win_practice.png',
      alt: '跟练模式底部的练琴录音按钮，上下对齐显示伴奏和演奏录音',
      caption: '录音回听：底栏「练琴录音」开始录制，录音与伴奏波形沿共同时间轴显示。',
      title: '录下来，再听听自己的进步。',
      text: '先设置输入设备、伴奏输出与声道，再点底栏「练琴录音」。结束后从录音库选择录音回听，结合对齐的波形比较自己的演奏位置。',
      tip: '请戴耳机。输入只有乐器选「只录乐器」；声卡已混入伴奏选「声卡已混音」。',
      x: 20,
      y: 96,
    },
  ];
  const $ = (id) => document.getElementById(id);
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

  function setPlaying(value) {
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
      setPlaying(false);
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
      setPlaying(false);
      showStep(next);
      buttons[next].focus();
    });
  });
  tour.addEventListener('click', () => setPlaying(!playing));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPlaying(false);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setPlaying(false);
      },
      { threshold: 0.15 },
    ).observe(document.querySelector('.guide-layout'));
  }

  const dialog = $('image-dialog');
  document.querySelectorAll('[data-image]').forEach((button) => {
    button.addEventListener('click', () => {
      setPlaying(false);
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
})();
