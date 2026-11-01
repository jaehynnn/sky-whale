'use strict';

(() => {
  function start() {
    const $ = selector => document.querySelector(selector);
    const $$ = selector => [...document.querySelectorAll(selector)];

    const stage = $('#stage');
    const story = $('#story');

    if (!stage || !story) {
      console.error('#stage 또는 #story 요소가 없습니다.');
      return;
    }

    const reduced = matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const clamp = value => Math.max(0, Math.min(1, value));

    function smooth(value) {
      value = clamp(value);
      return value * value * (3 - 2 * value);
    }

    function seg(position, from, to) {
      return smooth((position - from) / (to - from));
    }

    const choices = $('#choices');
    const refuse = $('#refuse');
    const accept = $('#accept');
    const continueButton = $('#continue');
    const missions = $('#missions');

    let accepted = false;
    let storyLength = 9.6;
    let vh = 1;
    let currentChapter = -1;
    let introStart = performance.now();
    let resizeTimer;
    let touchPoint = null;
    let pointerStopTimer;

    const typingStarts = new WeakMap();

    /* 기존 CSS 유지 + 필요한 보정과 새 장면 스타일 */
    const repairStyle = document.createElement('style');

    repairStyle.textContent = `
      html {
        height:auto !important;
        min-height:100% !important;
        overflow-x:hidden !important;
        overflow-y:auto !important;
        scroll-behavior:auto !important;
      }

      body {
        position:static !important;
        height:auto !important;
        min-height:100% !important;
        overflow:visible !important;
      }

      #story {
        position:relative !important;
        overflow:visible !important;
      }

      #stage {
        position:sticky !important;
        top:0 !important;
        width:100% !important;
        overflow:hidden !important;
        touch-action:pan-x pinch-zoom;
      }

      #stage .scene {
        pointer-events:none !important;
      }

      #stage .scene.is-active button {
        pointer-events:auto !important;
      }

      #stage .sky,
      #stage #intro-art,
      #stage .progress {
        pointer-events:none !important;
      }

      #stage .story-footer {
        position:absolute !important;
        z-index:100 !important;
        pointer-events:none !important;
      }

      #stage .story-footer button {
        pointer-events:auto !important;
      }

      #continue {
        cursor:pointer;
        min-height:44px;
      }

      .masthead #brand,
      #stage .story-footer .chapter,
      #stage .story-footer .pagination,
      #dodge-message,
      #dodge-note,
      #intro-art,
      .compass {
        display:none !important;
      }

      .masthead {
        justify-content:flex-end !important;
      }

      #choices {
        z-index:110 !important;
      }

      #refuse.has-moved {
        position:absolute !important;
        z-index:120 !important;
        margin:0 !important;
        transform:none !important;
        transition:none !important;
        will-change:left,top;
      }

      #intro .eyebrow,
      .map-heading .eyebrow,
      #arrival-caption .eyebrow,
      #night-caption .eyebrow,
      #accepted .eyebrow,
      .mission-heading .eyebrow,
      .marker-label {
        display:none !important;
      }

      .accepted-copy > p:not(.eyebrow):not(.dialogue),
      #missions .mission-end > p {
        display:none !important;
      }

      #intro {
        background:
          linear-gradient(#0000004d,#0000004d),
          url("assets/night-whales.png")
          center/cover no-repeat;
      }

      #stage > .sky {
        background:
          linear-gradient(#0000004d,#0000004d),
          url("assets/night-clean.png")
          center/cover no-repeat;
      }

      #stage > .sky .moon,
      #stage > .sky .mist,
      #stage > .sky .aurora {
        display:none !important;
      }

      #map-scene,
      #invitation,
      #accepted {
        background:transparent !important;
      }

      .map-position {
        width:min(84svh,720px) !important;
      }

      #map-world > img {
        background:transparent;
        mask-image:none !important;
        -webkit-mask-image:none !important;
        filter:drop-shadow(0 0 3px #76d8cc35);
      }

      .marker-dot {
        background:#c5fff4;
        box-shadow:0 0 12px #8be9da;
      }

      .marker-ring {
        border-color:#a3f0df99;
      }

      .dialogue {
        font-style:italic !important;
        color:#fff;
        text-shadow:
          0 2px 8px #000b,
          0 0 24px #030817cc;
      }

      .dialogue .word {
        padding-right:.08em;
        margin-right:-.08em;
      }

      .invitation-question.dialogue {
        margin-top:20px;
        font-size:clamp(20px,2vw,27px);
      }

      #missions {
        background:
          linear-gradient(#0000004d,#0000004d),
          url("assets/night-clean.png")
          center/cover no-repeat;
      }

      .mission-grid > details,
      .mission-card {
        border-color:#e6d1a386;
        animation:skywhale-mission-glow 5s ease-in-out infinite;
      }

      .mission-grid > details:nth-child(2) {
        animation-delay:-1.2s;
      }

      .mission-grid > details:nth-child(3) {
        animation-delay:-2.4s;
      }

      .mission-grid > details:nth-child(4) {
        animation-delay:-3.6s;
      }

      @keyframes skywhale-mission-glow {
        0%,100% {
          border-color:#e6d1a370;
          box-shadow:
            inset 0 0 0 5px #0c14254d,
            0 0 9px #d7c3ff12,
            0 0 22px #9bbce914,
            0 12px 35px #02071540;
        }

        50% {
          border-color:#f0dab29e;
          box-shadow:
            inset 0 0 0 5px #0c14254d,
            0 0 12px #e3d1ff26,
            0 0 30px #9bbce926,
            0 12px 35px #02071540;
        }
      }

      /* 구체가 모이는 장면과 마지막 탑승 장면 */
      #memory-ending {
        position:relative;
        background:#081725;
      }

      .memory-stage {
        position:sticky;
        top:0;
        height:100svh;
        overflow:hidden;
        isolation:isolate;
      }

      .memory-night,
      .memory-final-image {
        position:absolute;
        inset:0;
        pointer-events:none;
      }

      .memory-night {
        z-index:0;
        background:
          linear-gradient(#0000004d,#0000004d),
          url("assets/night-clean.png")
          center/cover no-repeat;
      }

      .memory-final-image {
        z-index:1;
        opacity:0;
        background:
          linear-gradient(#0000004d,#0000004d),
          url("assets/finale-riders.png")
          center/cover no-repeat;
      }

      .memory-bundle {
        position:absolute;
        z-index:3;
        left:50%;
        top:50%;
        width:clamp(150px,24vw,280px);
        aspect-ratio:1;
        transform:translate(-50%,-50%);
        background:
          url("assets/parcel-fantasy.png")
          center/contain no-repeat;
        pointer-events:none;
      }

      .memory-bundle::before {
        content:"";
        position:absolute;
        inset:-30% -40%;
        background:
          url("assets/parcel-light.png")
          center/contain no-repeat;
        animation:memory-light-float 8s ease-in-out infinite;
      }

      .memory-orbs {
        position:absolute;
        z-index:4;
        inset:0;
        pointer-events:none;
      }

      .memory-orb {
        position:absolute;
        left:50%;
        top:50%;
        width:clamp(85px,13vw,150px);
        height:auto;
        opacity:0;
        filter:drop-shadow(0 0 12px #ffe28d80);
        will-change:transform,opacity;
      }

      .memory-flash {
        position:absolute;
        z-index:8;
        left:50%;
        top:50%;
        width:0;
        height:0;
        border-radius:50%;
        transform:translate(-50%,-50%);
        background:#fff;
        box-shadow:
          0 0 60px 20px #fff8d9,
          0 0 100px 35px #ffe7a5a0;
        opacity:0;
        pointer-events:none;
      }

      .memory-caption.dialogue {
        position:absolute;
        z-index:10;
        inset:0;
        display:grid;
        place-items:center;
        margin:0;
        padding:8%;
        opacity:0;
        text-align:center;
        font-family:var(--serif);
        font-size:clamp(25px,3.2vw,42px);
        font-weight:400;
        font-style:italic;
        line-height:1.9;
        color:#fff;
        text-shadow:
          0 2px 10px #000b,
          0 0 28px #23162ec0;
        pointer-events:none;
      }

      @keyframes memory-light-float {
        0%,100% {
          transform:translateY(5px) rotate(-7deg);
          opacity:.7;
        }

        50% {
          transform:translateY(-7px) rotate(7deg);
          opacity:1;
        }
      }

      [hidden] {
        display:none !important;
      }

      @media(max-width:760px) {
        .map-position {
          width:min(110.4vw,78svh) !important;
        }

        .memory-bundle {
          width:min(45vw,220px);
        }

        .memory-orb {
          width:95px;
        }

        .memory-final-image {
          background-color:#312838;
          background-size:100% 100%,100% auto;
        }
      }

      @media(prefers-reduced-motion:reduce) {
        .mission-grid > details,
        .mission-card,
        .memory-bundle::before {
          animation:none !important;
        }
      }
    `;

    document.head.append(repairStyle);

    /* 실제 스크롤 위치와 이야기 진행 위치 */
    function rawScrollTop() {
      return window.scrollY ||
        document.scrollingElement?.scrollTop ||
        0;
    }

    function toStory(pagePosition) {
      if (pagePosition <= 6.3) return pagePosition;

      if (pagePosition <= 7.8) {
        return 6.3 + (pagePosition - 6.3) / 5;
      }

      return pagePosition - 1.2;
    }

    function toPage(storyPosition) {
      if (storyPosition <= 6.3) return storyPosition;

      if (storyPosition <= 6.6) {
        return 6.3 + (storyPosition - 6.3) * 5;
      }

      return storyPosition + 1.2;
    }

    function scrollTop() {
      return toStory(rawScrollTop() / vh) * vh;
    }

    function measure() {
      vh = Math.max(
        1,
        document.documentElement.clientHeight || innerHeight
      );

      stage.style.setProperty('height', `${vh}px`, 'important');

      story.style.setProperty(
        'height',
        `${Math.ceil((storyLength + 2.2) * vh)}px`,
        'important'
      );
    }

    function goToPixels(top, animate = true) {
      const maximum = Math.max(
        0,
        document.documentElement.scrollHeight - innerHeight
      );

      window.scrollTo({
        top: Math.max(
          0,
          Math.min(maximum, toPage(top / vh) * vh)
        ),
        left: 0,
        behavior: animate && !reduced ? 'smooth' : 'auto'
      });
    }

    function jump(to, animate = true) {
      goToPixels(to * vh, animate);
    }

    function changeScroll(delta) {
      if (!Number.isFinite(delta)) return;

      const nextPosition =
        Math.max(0, rawScrollTop() + delta) / vh;

      goToPixels(toStory(nextPosition) * vh, false);
    }

    /* 새로운 마지막 장면 생성 */
    const ending = document.createElement('section');
    ending.id = 'memory-ending';
    ending.hidden = true;

    ending.setAttribute(
      'aria-label',
      '추억이 모여 열리는 하늘길'
    );

    ending.innerHTML = `
      <div class="memory-stage">
        <div class="memory-night" aria-hidden="true"></div>
        <div class="memory-final-image" aria-hidden="true"></div>
        <div class="memory-bundle" aria-hidden="true"></div>
        <div class="memory-orbs" aria-hidden="true"></div>
        <div class="memory-flash" aria-hidden="true"></div>

        <p
          class="memory-caption dialogue"
          data-text="우리의 이야기는 이제 시작이라네"
          aria-hidden="true"
        ></p>
      </div>
    `;

    if (missions) missions.after(ending);

    const endingStage = ending.querySelector('.memory-stage');
    const endingBundle = ending.querySelector('.memory-bundle');
    const endingFlash = ending.querySelector('.memory-flash');
    const endingImage = ending.querySelector('.memory-final-image');

    const endingOrbs = Array.from({ length: 6 }, () => {
      const image = document.createElement('img');

      image.src = 'assets/memory-orb.png';
      image.alt = '';
      image.className = 'memory-orb';

      ending.querySelector('.memory-orbs').append(image);

      return image;
    });

    /* 요청한 문구 변경 */
    [
      [
        '.map-heading h2',
        '좀 더 자세히 살펴보자고'
      ],
      [
        '#accepted .dialogue',
        '하하, 그럴 줄 알았어\n자, 함께 추억을 만들어 보게!'
      ],
      [
        '#mission-title',
        '우리의 추억이,\n한 곳으로 모이는 순간'
      ]
    ].forEach(([selector, text]) => {
      const element = $(selector);
      if (element) element.dataset.text = text;
    });

    const missionOpenButton = $('#open-missions');

    if (missionOpenButton) {
      missionOpenButton.textContent = '미션 펼쳐보기';
    }

    const narration = {
      intro: $('#intro .dialogue'),
      arrival: $('#arrival-caption .dialogue'),
      night: $('#night-caption .dialogue'),
      offer: $('.invitation-copy .dialogue'),
      accepted: $('#accepted .dialogue'),
      map: $('.map-heading h2'),
      mission: $('#mission-title'),
      question: $('.invitation-question'),
      finale: ending.querySelector('.memory-caption')
    };

    const dialogues = [
      ...new Set([
        ...$$('.dialogue'),
        ...Object.values(narration)
      ].filter(Boolean))
    ];

    /* 모든 나레이션을 동일한 글자별 구조로 구성 */
    dialogues.forEach(element => {
      let content = element.dataset.text;

      if (content === undefined) {
        content = [...element.childNodes]
          .map(node =>
            node.nodeName === 'BR' ? '\n' : node.textContent
          )
          .join('');
      }

      content = content.replaceAll('\\n', '\n');

      element.dataset.text = content;
      element.classList.add('dialogue');
      element.setAttribute('aria-label', content);

      const visual = document.createElement('span');
      visual.setAttribute('aria-hidden', 'true');

      content.split('\n').forEach(line => {
        const row = document.createElement('span');
        row.className = 'line';

        line.split(/(\s+)/).forEach(word => {
          const group = document.createElement('span');
          group.className = 'word';

          [...word].forEach(character => {
            const span = document.createElement('span');
            span.className = 'char';
            span.textContent = character;
            group.append(span);
          });

          row.append(group);
        });

        visual.append(row);
      });

      element.replaceChildren(visual);
      element._chars = [...element.querySelectorAll('.char')];
    });

    const mapImage = $('#map-world > img');

    if (mapImage) {
      mapImage.src = 'assets/korea-teal.png';
    }

    let missionTitleVisible = false;

    if (narration.mission) {
      const observer = new IntersectionObserver(entries => {
        missionTitleVisible = entries[0].isIntersecting;

        if (!missionTitleVisible) {
          typingStarts.delete(narration.mission);
        }
      }, {
        threshold: 0.15
      });

      observer.observe(narration.mission);
    }

    /* 기존 별빛 효과 */
    const stars = $('#stars');

    if (stars) {
      stars.replaceChildren();

      for (let i = 0; i < 100; i++) {
        const star = document.createElement('i');

        star.style.cssText = `
          left:${(i * 61.71) % 100}%;
          top:${(i * 37.39) % 100}%;
          width:${i % 9 === 0 ? 2 : 1}px;
          height:${i % 9 === 0 ? 2 : 1}px;
          --twinkle:${3 + i % 6}s;
          animation-delay:-${i % 7}s;
        `;

        stars.append(star);
      }
    }

    /* 첫 화면과 동일한 글자 등장 모션 */
    function reveal(element, progress) {
      if (!element?._chars) return;

      const count = Math.max(1, element._chars.length - 1);

      element._chars.forEach((character, index) => {
        const value = reduced
          ? 1
          : smooth((progress - index / count * 0.8) / 0.2);

        character.style.opacity = value;
        character.style.transform =
          `translateY(${(1 - value) * 8}px)`;
      });
    }

    function type(element, progress, now) {
      if (!element?._chars) return;

      if (!typingStarts.has(element)) {
        typingStarts.set(element, now);
      }

      const duration = element._chars.length * 36 + 500;

      reveal(
        element,
        (now - typingStarts.get(element)) / duration
      );
    }

    function visibility(element, value) {
      if (!element) return;

      value = clamp(value);
      const active = value > 0.001;

      element.style.opacity = value;
      element.style.visibility = active ? 'visible' : 'hidden';
      element.classList.toggle('is-active', active);
      element.inert = !active;
      element.setAttribute('aria-hidden', String(!active));
    }

    function opacity(selector, value) {
      const element = $(selector);
      if (element) element.style.opacity = clamp(value);
    }

    const chapterLabels = [
      '낯선 여행자의 목소리',
      '별빛이 가리키는 곳',
      '하늘고래의 선착장',
      '당신을 위한 초대',
      '함께 떠날 준비'
    ];

    function setChapter(index) {
      if (currentChapter === index) return;
      currentChapter = index;

      const number = $('#chapter-number');
      const name = $('#chapter-name');

      if (number) {
        number.textContent = String(index + 1).padStart(2, '0');
      }

      if (name) name.textContent = chapterLabels[index];
    }

    /* 거절 버튼 */
    const repel = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      pointer: null,
      bounceUntil: 0
    };

    const REPULSION_RADIUS = 190;
    const MAX_SPEED = 760;

    function stopRefuse() {
      clearTimeout(pointerStopTimer);

      repel.pointer = null;
      repel.vx = 0;
      repel.vy = 0;
      repel.bounceUntil = 0;
    }

    function scheduleRefuseStop(delay) {
      clearTimeout(pointerStopTimer);
      pointerStopTimer = setTimeout(stopRefuse, delay);
    }

    function prepareRefuse() {
      const invitation = $('#invitation');

      if (!refuse || !invitation) return false;

      if (!refuse.classList.contains('has-moved')) {
        const buttonRect = refuse.getBoundingClientRect();
        const sceneRect = invitation.getBoundingClientRect();

        repel.x = buttonRect.left - sceneRect.left;
        repel.y = buttonRect.top - sceneRect.top;
        repel.vx = 0;
        repel.vy = 0;

        invitation.append(refuse);
        refuse.classList.add('has-moved');

        refuse.style.left = `${repel.x}px`;
        refuse.style.top = `${repel.y}px`;
      }

      return true;
    }

    function restoreRefuse() {
      stopRefuse();

      if (!refuse || !choices) return;

      const note = $('#dodge-note');

      if (note && note.parentElement === choices) {
        choices.insertBefore(refuse, note);
      } else {
        choices.append(refuse);
      }

      refuse.hidden = false;
      refuse.inert = false;
      refuse.classList.remove('has-moved');

      refuse.style.left = '';
      refuse.style.top = '';
      refuse.style.opacity = '';
      refuse.style.pointerEvents = '';
    }

    function updateRefuse(dt) {
      const current = scrollTop() / vh;

      const enabled = refuse &&
        !refuse.hidden &&
        !accepted &&
        current >= 8.15 &&
        current <= 9.2;

      if (!enabled || !repel.pointer) {
        repel.vx = 0;
        repel.vy = 0;
        return;
      }

      if (!prepareRefuse()) return;

      const sceneRect =
        $('#invitation').getBoundingClientRect();

      const width = refuse.offsetWidth;
      const height = refuse.offsetHeight;
      const centerX = repel.x + width / 2;
      const centerY = repel.y + height / 2;

      let accelerationX = 0;
      let accelerationY = 0;

      if (performance.now() >= repel.bounceUntil) {
        const pointerX = repel.pointer.x - sceneRect.left;
        const pointerY = repel.pointer.y - sceneRect.top;

        let dx = centerX - pointerX;
        let dy = centerY - pointerY;
        let distance = Math.hypot(dx, dy);

        if (distance < 1) {
          dx = 1;
          dy = -0.5;
          distance = Math.hypot(dx, dy);
        }

        if (distance < REPULSION_RADIUS) {
          const proximity = 1 - distance / REPULSION_RADIUS;
          const force = 5200 * proximity * proximity;

          accelerationX += dx / distance * force;
          accelerationY += dy / distance * force;
        }
      }

      const obstacles = [
        { element: accept, padding: 30 },
        { element: $('.invitation-copy'), padding: 18 },
        { element: $('.masthead'), padding: 12 }
      ];

      obstacles.forEach(({ element, padding }) => {
        if (!element) return;

        const rect = element.getBoundingClientRect();

        const left =
          rect.left - sceneRect.left - width / 2 - padding;
        const right =
          rect.right - sceneRect.left + width / 2 + padding;
        const top =
          rect.top - sceneRect.top - height / 2 - padding;
        const bottom =
          rect.bottom - sceneRect.top + height / 2 + padding;

        if (
          centerX <= left || centerX >= right ||
          centerY <= top || centerY >= bottom
        ) {
          return;
        }

        const exits = [
          { distance: centerX - left, x: -1, y: 0 },
          { distance: right - centerX, x: 1, y: 0 },
          { distance: centerY - top, x: 0, y: -1 },
          { distance: bottom - centerY, x: 0, y: 1 }
        ];

        exits.sort((a, b) => a.distance - b.distance);

        const exit = exits[0];
        const force = 3500 + exit.distance * 35;

        accelerationX += exit.x * force;
        accelerationY += exit.y * force;
      });

      repel.vx += accelerationX * dt;
      repel.vy += accelerationY * dt;

      const bouncing = performance.now() < repel.bounceUntil;
      const friction = Math.exp(-(bouncing ? 0.8 : 5) * dt);

      repel.vx *= friction;
      repel.vy *= friction;

      const speed = Math.hypot(repel.vx, repel.vy);

      if (speed > MAX_SPEED) {
        repel.vx *= MAX_SPEED / speed;
        repel.vy *= MAX_SPEED / speed;
      }

      repel.x += repel.vx * dt;
      repel.y += repel.vy * dt;

      const minX = 16;
      const maxX = Math.max(
        minX,
        stage.clientWidth - width - 16
      );

      const minY = Math.min(
        75,
        Math.max(8, stage.clientHeight - height - 16)
      );

      const maxY = Math.max(
        minY,
        stage.clientHeight - height - 85
      );

      const hitLeft = repel.x < minX;
      const hitRight = repel.x > maxX;
      const hitTop = repel.y < minY;
      const hitBottom = repel.y > maxY;

      if (hitLeft || hitRight || hitTop || hitBottom) {
        repel.x = Math.max(minX, Math.min(maxX, repel.x));
        repel.y = Math.max(minY, Math.min(maxY, repel.y));

        let directionX = hitLeft ? 1 : hitRight ? -1 : 0;
        let directionY = hitTop ? 1 : hitBottom ? -1 : 0;

        if (!directionX) {
          directionX =
            repel.x < (minX + maxX) / 2 ? 0.75 : -0.75;
        }

        if (!directionY) {
          directionY =
            repel.y < (minY + maxY) / 2 ? 0.75 : -0.75;
        }

        const length = Math.hypot(directionX, directionY);

        repel.vx = directionX / length * MAX_SPEED;
        repel.vy = directionY / length * MAX_SPEED;
        repel.bounceUntil = performance.now() + 650;
      }

      refuse.style.left = `${repel.x.toFixed(2)}px`;
      refuse.style.top = `${repel.y.toFixed(2)}px`;
    }

    stage.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;

      repel.pointer = {
        x: event.clientX,
        y: event.clientY,
        touch: false
      };

      scheduleRefuseStop(70);
    });

    stage.addEventListener('pointerleave', stopRefuse);

    refuse?.addEventListener('pointerdown', event => {
      event.preventDefault();

      if (!prepareRefuse()) return;

      repel.pointer = {
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType === 'touch'
      };

      scheduleRefuseStop(
        event.pointerType === 'touch' ? 300 : 70
      );
    });

    refuse?.addEventListener('click', event => {
      event.preventDefault();
    });

    document.addEventListener('pointercancel', stopRefuse);

    /*
     * 기존 고래 Canvas 변형 유지.
     * 지느러미를 별도 분리한 애니메이션은 아닙니다.
     */
    const swimSource = $('#whale-flight img');
    const swimCanvas = document.createElement('canvas');
    const swimContext = swimCanvas.getContext('2d');

    swimCanvas.setAttribute('aria-hidden', 'true');

    swimCanvas.style.cssText = `
      position:absolute;
      left:0;
      top:-12%;
      width:100%;
      height:124%;
      pointer-events:none;
    `;

    if (swimSource && swimContext) {
      swimSource.parentElement.append(swimCanvas);
    }

    function drawSwimmingWhale(now) {
      if (
        !swimSource ||
        !swimContext ||
        !swimSource.complete ||
        !swimSource.naturalWidth
      ) {
        return;
      }

      const sourceWidth = swimSource.naturalWidth;
      const sourceHeight = swimSource.naturalHeight;
      const width = Math.min(sourceWidth, 1400);

      const height = Math.round(
        width * sourceHeight / sourceWidth
      );

      const padding = Math.ceil(height * 0.12);

      if (
        swimCanvas.width !== width ||
        swimCanvas.height !== height + padding * 2
      ) {
        swimCanvas.width = width;
        swimCanvas.height = height + padding * 2;
      }

      swimContext.clearRect(
        0, 0, swimCanvas.width, swimCanvas.height
      );

      const phase = now / 1000 * Math.PI * 2 / 3.6;
      const strips = reduced ? 1 : 100;

      for (let i = 0; i < strips; i++) {
        const u = (i + 0.5) / strips;

        const finWeight = Math.pow(
          Math.max(
            0,
            (Math.abs(u - 0.5) - 0.17) / 0.33
          ),
          1.6
        );

        const bend = reduced
          ? 0
          : Math.sin(phase + finWeight * 0.45) *
            height * 0.065 * finWeight;

        const sourceX = i * sourceWidth / strips;

        const sourceStripWidth = Math.min(
          sourceWidth / strips + 1,
          sourceWidth - sourceX
        );

        swimContext.drawImage(
          swimSource,
          sourceX,
          0,
          sourceStripWidth,
          sourceHeight,
          i * width / strips,
          padding + bend,
          sourceStripWidth * width / sourceWidth,
          height - bend * 0.3
        );
      }

      swimSource.style.visibility = 'hidden';
    }

    /* 마지막 장면의 스크롤 길이 */
    function measureEnding() {
      if (ending.hidden) return;

      ending.style.height =
        `${Math.max(1, endingStage.clientHeight) * 6}px`;
    }

    function renderEnding(now) {
      if (ending.hidden) return;

      const width = endingStage.clientWidth;
      const height = endingStage.clientHeight;

      const p = clamp(
        -ending.getBoundingClientRect().top /
        Math.max(1, ending.offsetHeight - height)
      );

      const radiusX = Math.min(width * 0.34, 360);
      const radiusY = Math.min(height * 0.29, 240);
      const born = seg(p, 0.04, 0.15);

      /*
       * 1. 구체 등장
       * 2. 구체 6개가 보따리 중앙까지 모두 이동
       */
      endingOrbs.forEach((orb, index) => {
        const gathered = seg(
          p,
          0.20 + index * 0.025,
          0.44 + index * 0.015
        );

        const angle =
          -Math.PI / 2 + index * Math.PI / 3;

        const float = reduced
          ? 0
          : Math.sin(now / 1000 * 1.5 + index) *
            8 * (1 - gathered);

        const x =
          Math.cos(angle) * radiusX * (1 - gathered);

        const y =
          Math.sin(angle) * radiusY * (1 - gathered) +
          float;

        orb.style.opacity =
          born * (1 - seg(gathered, 0.94, 1));

        orb.style.transform = `
          translate(
            calc(-50% + ${x}px),
            calc(-50% + ${y}px)
          )
          scale(${1 - gathered * 0.65})
        `;
      });

      endingBundle.style.opacity =
        1 - seg(p, 0.60, 0.64);

      const glow = 12 + seg(p, 0.35, 0.54) * 42;

      endingBundle.style.filter =
        `drop-shadow(0 0 ${glow}px #ffe6a0)`;

      /*
       * 마지막 구체 도착: p = 0.515
       * 빛 확산 시작:      p = 0.54
       * 화면 전체 덮임:   p = 0.62
       * 배경 전환:        p = 0.64 ~ 0.66
       * 흰빛 걷힘:        p = 0.72 ~ 0.82
       */
      const expansion = seg(p, 0.54, 0.62);

      const diameter =
        Math.hypot(width, height) * 1.15 * expansion;

      endingFlash.style.width = `${diameter}px`;
      endingFlash.style.height = `${diameter}px`;

      endingFlash.style.opacity =
        seg(p, 0.54, 0.56) *
        (1 - seg(p, 0.72, 0.82));

      /*
       * 이 시점에는 흰 원이 화면 전체를 덮고 있습니다.
       */
      endingImage.style.opacity =
        seg(p, 0.64, 0.66);

      const showText = p >= 0.82;
      const caption = narration.finale;

      caption.style.opacity = showText ? 1 : 0;
      caption.setAttribute('aria-hidden', String(!showText));

      if (showText) {
        type(caption, 0, now);
      } else {
        typingStarts.delete(caption);
        reveal(caption, 0);
      }
    }

    /* 전체 장면 렌더링 */
    let previousTime = 0;

    function render(now) {
      const dt = Math.min(
        0.033,
        Math.max(
          0.001,
          (now - (previousTime || now)) / 1000
        )
      );

      previousTime = now;

      let s = Math.min(
        storyLength,
        Math.max(0, scrollTop() / vh)
      );

      /*
       * 선착장 나레이션 완료 전에는
       * 중앙 고래 접근 구간으로 넘어가지 않습니다.
       */
      const nightStarted = typingStarts.get(narration.night);

      if (
        !accepted &&
        s >= 6.1 &&
        s < 7.35 &&
        nightStarted !== undefined
      ) {
        const duration =
          narration.night._chars.length * 36 + 500;

        if (now - nightStarted < duration) {
          s = 6.1;
          goToPixels(6.1 * vh, false);
        }
      }

      const introFade = 1 - seg(s, 0.85, 1.25);

      const mapFade =
        seg(s, 0.95, 1.45) *
        (1 - seg(s, 3.05, 3.8));

      const harborFade =
        seg(s, 3.2, 4) *
        (1 - seg(s, 6.65, 7.35));

      const inviteFade =
        seg(s, 6.9, 7.65) *
        (accepted ? 1 - seg(s, 9.15, 9.75) : 1);

      const acceptedFade =
        accepted ? seg(s, 9.15, 9.85) : 0;

      /* 첫 화면 */
      visibility($('#intro'), introFade);

      reveal(
        narration.intro,
        (now - introStart) /
          ((narration.intro?._chars.length || 1) * 36 + 500)
      );

      /* 지도 */
      visibility($('#map-scene'), mapFade);

      if (mapFade > 0.01) {
        type(narration.map, 0, now);
      }

      const z = seg(s, 2.05, 3.55);
      const mapWorld = $('#map-world');

      if (mapWorld) {
        const width = mapWorld.clientWidth;
        const height = mapWorld.clientHeight;

        mapWorld.style.transform = reduced
          ? 'none'
          : `translate(
               ${width * 0.115 * z}px,
               ${height * 0.243 * z}px
             ) scale(${1 + 4.5 * z * z})`;
      }

      opacity('.map-heading', 1 - seg(s, 2.1, 2.65));

      /* 선착장 */
      visibility($('#harbor'), harborFade);

      const harborImage = $('#harbor-image');

      if (harborImage) {
        harborImage.style.transform = reduced
          ? 'none'
          : `scale(${1.06 - 0.06 * seg(s, 3.2, 6.6)})
             translateY(${-1.5 * seg(s, 4, 6.6)}%)`;
      }

      const arrival =
        seg(s, 3.65, 4.1) *
        (1 - seg(s, 4.45, 4.8));

      const night =
        seg(s, 5, 5.2) *
        (1 - seg(s, 6.4, 6.8));

      opacity('#arrival-caption', arrival);
      opacity('#night-caption', night);

      $('#arrival-caption')?.setAttribute(
        'aria-hidden',
        String(arrival < 0.01)
      );

      $('#night-caption')?.setAttribute(
        'aria-hidden',
        String(night < 0.01)
      );

      if (arrival > 0.01) {
        type(narration.arrival, 0, now);
      }

      if (night > 0.01) {
        type(narration.night, 0, now);
      }

      /* 중앙 고래 접근 */
      const whaleFlight = $('#whale-flight');

      if (whaleFlight) {
        const image = whaleFlight.querySelector('img');

        const width = stage.clientWidth;
        const height = stage.clientHeight;

        const ratio =
          image?.naturalWidth && image?.naturalHeight
            ? image.naturalWidth / image.naturalHeight
            : 1.5;

        const baseWidth = Math.min(
          width * 0.72,
          height * 0.85
        );

        const baseHeight = baseWidth / ratio;

        const fullScale = Math.max(
          width / baseWidth,
          height / baseHeight
        ) * 1.8;

        const approach = seg(s, 6.3, 6.6);
        const appear = seg(s, 6.3, 6.36);

        const scale = reduced
          ? 0.9
          : 0.18 + (fullScale - 0.18) * approach;

        [
          ['position', 'absolute'],
          ['left', '50%'],
          ['top', '55%'],
          ['width', `${baseWidth}px`],
          ['height', `${baseHeight}px`],
          ['margin', '0'],
          ['animation', 'none'],
          ['transition', 'none']
        ].forEach(([property, value]) => {
          whaleFlight.style.setProperty(
            property, value, 'important'
          );
        });

        whaleFlight.style.transformOrigin = '50% 50%';
        whaleFlight.style.opacity = appear;

        const bob = reduced
          ? 0
          : Math.sin(now / 1000 * Math.PI * 2 / 3.6) *
            7 * (1 - approach);

        whaleFlight.style.transform =
          `translate(-50%,calc(-50% + ${bob}px))
           scale(${scale})`;

        if (image) {
          image.style.display = 'block';
          image.style.width = '100%';
          image.style.height = '100%';
          image.style.objectFit = 'contain';
          image.style.animation = 'none';
          image.style.transform = 'none';
        }

        if (appear > 0 && harborFade > 0) {
          drawSwimmingWhale(now);
        }
      }

      /* 보따리와 참여 제안 */
      visibility($('#invitation'), inviteFade);

      if (inviteFade > 0.01) {
        type(narration.offer, 0, now);
      }

      opacity(
        '.invitation-question',
        seg(s, 7.95, 8.25)
      );

      if (inviteFade > 0.01 && s >= 7.95) {
        type(narration.question, 0, now);
      }

      const choiceReady = s >= 8.15 && !accepted;
      const choiceOpacity = seg(s, 8.05, 8.45);

      if (choices) {
        choices.style.opacity = choiceOpacity;
        choices.inert = !choiceReady;

        choices.setAttribute(
          'aria-hidden',
          String(!choiceReady)
        );
      }

      if (refuse?.classList.contains('has-moved')) {
        refuse.style.opacity = choiceOpacity;
        refuse.inert = !choiceReady;

        refuse.style.pointerEvents =
          choiceReady ? 'auto' : 'none';
      }

      /* 수락 후 나레이션 */
      visibility($('#accepted'), acceptedFade);

      if (acceptedFade > 0.01) {
        type(narration.accepted, 0, now);
      }

      const progress = $('#progress-bar');

      if (progress) {
        progress.style.width =
          `${clamp(s / storyLength) * 100}%`;
      }

      setChapter(
        accepted && s > 9.35 ? 4 :
        s < 1.25 ? 0 :
        s < 3.5 ? 1 :
        s < 7 ? 2 : 3
      );

      if (continueButton) {
        const waitingForChoice =
          s > 8.4 && !accepted;

        continueButton.style.opacity =
          waitingForChoice ? 0 : 1;

        continueButton.style.visibility =
          waitingForChoice ? 'hidden' : 'visible';

        continueButton.disabled = waitingForChoice;

        continueButton.textContent =
          accepted && s > 9.4
            ? '추억을 모으러 가볼까요 ↓'
            : s < 1
              ? '천천히 스크롤해 이야기를 따라오세요 ↓'
              : '다음 이야기로 ↓';
      }

      if (missionTitleVisible) {
        type(narration.mission, 0, now);
      }

      renderEnding(now);
      updateRefuse(dt);

      requestAnimationFrame(render);
    }

    const stops = [
      1.6, 2.7, 4.15, 4.9, 5.65,
      6.25, 6.48, 6.62, 7.75, 8.6, 10.1
    ];

    function nextScene() {
      const current = scrollTop() / vh;

      if (accepted && current > 9.4) {
        openMissions();
        return;
      }

      const next = stops.find(stop =>
        stop > current + 0.03 &&
        (accepted || stop <= 8.6)
      );

      if (next !== undefined) jump(next);
    }

    continueButton?.addEventListener('click', nextScene);

    $$('[data-jump]').forEach(button => {
      button.addEventListener('click', () => {
        const destination = Number(button.dataset.jump);

        if (Number.isFinite(destination)) {
          jump(destination);
        }
      });
    });

    function reset() {
      accepted = false;
      storyLength = 9.6;
      ending.hidden = true;

      if (missions) missions.hidden = true;

      missionTitleVisible = false;
      restoreRefuse();

      const message = $('#dodge-message');
      if (message) message.textContent = '';

      dialogues.forEach(element => {
        typingStarts.delete(element);
        reveal(element, 0);
      });

      currentChapter = -1;
      introStart = performance.now();

      measure();
      jump(0, false);
    }

    $('#restart')?.addEventListener('click', reset);
    $('#replay')?.addEventListener('click', reset);

    $('#brand')?.addEventListener('click', event => {
      event.preventDefault();
      reset();
    });

    $('.skip-link')?.addEventListener('click', event => {
      event.preventDefault();
      jump(8.6, false);
    });

    accept?.addEventListener('click', () => {
      if (accepted) return;

      accepted = true;
      storyLength = 10.6;

      if (refuse) refuse.hidden = true;

      stopRefuse();
      measure();
      jump(10.1);
    });

    function openMissions() {
      if (!accepted || !missions) return;

      missions.hidden = false;
      ending.hidden = false;

      measureEnding();

      missions.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start'
      });
    }

    $('#open-missions')?.addEventListener(
      'click',
      openMissions
    );

    /* 마우스 휠 */
    stage.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) return;

      if (
        Math.abs(event.deltaX) >
        Math.abs(event.deltaY)
      ) {
        return;
      }

      const multiplier = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? vh
          : 1;

      event.preventDefault();
      changeScroll(event.deltaY * multiplier);
    }, {
      passive: false
    });

    /* 모바일 스크롤 */
    stage.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) {
        touchPoint = null;
        return;
      }

      touchPoint = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    }, {
      passive: true
    });

    stage.addEventListener('touchmove', event => {
      if (!touchPoint || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = touchPoint.x - touch.clientX;
      const deltaY = touchPoint.y - touch.clientY;

      touchPoint = {
        x: touch.clientX,
        y: touch.clientY
      };

      if (Math.abs(deltaX) > Math.abs(deltaY)) return;

      if (event.cancelable) event.preventDefault();

      changeScroll(deltaY);
    }, {
      passive: false
    });

    stage.addEventListener('touchend', () => {
      touchPoint = null;
    });

    stage.addEventListener('touchcancel', () => {
      touchPoint = null;
    });

    /* 키보드 스크롤 */
    document.addEventListener('keydown', event => {
      const tag = event.target?.tagName;

      if (
        [
          'INPUT', 'TEXTAREA', 'SELECT',
          'BUTTON', 'A', 'SUMMARY'
        ].includes(tag) ||
        event.target?.isContentEditable ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      if (
        rawScrollTop() >= story.offsetHeight - vh
      ) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        changeScroll(80);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        changeScroll(-80);
      } else if (
        event.key === 'PageDown' ||
        event.key === ' '
      ) {
        event.preventDefault();
        changeScroll(vh * 0.8);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        changeScroll(-vh * 0.8);
      }
    });

    /* 화면 크기 변경 */
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        const oldPosition = scrollTop() / vh;
        const wasInsideStory = oldPosition <= storyLength;

        restoreRefuse();

        if (accepted && refuse) {
          refuse.hidden = true;
        }

        measure();
        measureEnding();

        if (wasInsideStory) {
          jump(oldPosition, false);
        }
      }, 150);
    });

    window.addEventListener('blur', stopRefuse);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopRefuse();
    });

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    measure();
    jump(0, false);
    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );
  } else {
    start();
  }
})();
