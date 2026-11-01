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

    const reduced = window.matchMedia(
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

    const typingStarts = new WeakMap();

    /*
     * 스크롤·클릭 보정 및 요청한 화면 요소 숨김.
     * 기존 요소는 스크립트 연결을 위해 DOM에 유지합니다.
     */
    const repairStyle = document.createElement('style');

    repairStyle.textContent = `
      html {
        height: auto !important;
        min-height: 100% !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        scroll-behavior: auto !important;
      }

      body {
        position: static !important;
        height: auto !important;
        min-height: 100% !important;
        overflow: visible !important;
      }

      #story {
        position: relative !important;
        overflow: visible !important;
      }

      #stage {
        position: sticky !important;
        top: 0 !important;
        width: 100% !important;
        overflow: hidden !important;
        touch-action: pan-x pinch-zoom;
      }

      #stage .scene {
        pointer-events: none !important;
      }

      #stage .scene.is-active button {
        pointer-events: auto !important;
      }

      #stage .sky,
      #stage #intro-art,
      #stage .progress {
        pointer-events: none !important;
      }

      #stage .story-footer {
        position: absolute !important;
        z-index: 100 !important;
        pointer-events: none !important;
      }

      #stage .story-footer button {
        pointer-events: auto !important;
      }

      #continue {
        cursor: pointer;
        min-height: 44px;
      }

      /* 왼쪽 위 나뭇잎 그림과 사이트명 */
      .masthead #brand {
        display: none !important;
      }

      /* '처음으로' 버튼은 오른쪽 위에 유지 */
      .masthead {
        justify-content: flex-end !important;
      }

      /* 왼쪽 아래 장면 번호와 설명 */
      #stage .story-footer .chapter {
        display: none !important;
      }

      /* 오른쪽 아래 동그라미 진행 표시 */
      #stage .story-footer .pagination {
        display: none !important;
      }

      #choices {
        z-index: 110 !important;
      }

      #refuse.has-moved {
        position: absolute !important;
        z-index: 120 !important;
        margin: 0 !important;
        transform: none !important;
        transition: none !important;
        will-change: left, top;
      }

      #dodge-message {
        display: none !important;
      }

      [hidden] {
        display: none !important;
      }
    `;

    document.head.append(repairStyle);

    function scrollTop() {
      return window.scrollY ||
        document.scrollingElement?.scrollTop ||
        0;
    }

    function measure() {
      vh = Math.max(
        1,
        document.documentElement.clientHeight || window.innerHeight
      );

      stage.style.setProperty('height', `${vh}px`, 'important');

      story.style.setProperty(
        'height',
        `${Math.ceil((storyLength + 1) * vh)}px`,
        'important'
      );
    }

    function goToPixels(top, animate = true) {
      const maximum = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );

      window.scrollTo({
        top: Math.max(0, Math.min(maximum, top)),
        left: 0,
        behavior: animate && !reduced ? 'smooth' : 'auto'
      });
    }

    function jump(to, animate = true) {
      goToPixels(to * vh, animate);
    }

    function changeScroll(delta) {
      if (Number.isFinite(delta)) {
        goToPixels(scrollTop() + delta, false);
      }
    }

    /*
     * 대사 글자별 등장.
     */
    const dialogues = $$('.dialogue');

    dialogues.forEach(element => {
      const content = (element.dataset.text || '')
        .replaceAll('\\n', '\n');

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

    function reveal(element, progress) {
      if (!element?._chars) return;

      const count = Math.max(1, element._chars.length - 1);

      element._chars.forEach((character, index) => {
        const opacity = reduced
          ? 1
          : smooth((progress - index / count * 0.8) / 0.2);

        character.style.opacity = opacity;
        character.style.transform =
          `translateY(${(1 - opacity) * 8}px)`;
      });
    }

    function type(element, progress, now) {
      if (!element?._chars) return;

      if (!typingStarts.has(element)) {
        typingStarts.set(element, now);
      }

      const duration = element._chars.length * 34 + 350;
      const automatic = (now - typingStarts.get(element)) / duration;

      reveal(element, Math.max(progress, automatic));
    }

    function visibility(element, opacity) {
      if (!element) return;

      opacity = clamp(opacity);
      const active = opacity > 0.001;

      element.style.opacity = opacity;
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

    /*
     * 거절 버튼의 위치와 속도.
     */
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
      if (!refuse || !choices) return;

      const note = $('#dodge-note');

      if (note && note.parentElement === choices) {
        choices.insertBefore(refuse, note);
      } else {
        choices.append(refuse);
      }

      refuse.hidden = false;
      refuse.classList.remove('has-moved');
      refuse.style.left = '';
      refuse.style.top = '';

      repel.vx = 0;
      repel.vy = 0;
      repel.pointer = null;
    }

    function updateRefuse(dt) {
      const current = scrollTop() / vh;

      const enabled = refuse &&
        !refuse.hidden &&
        !accepted &&
        current >= 8.15 &&
        current <= 9.2;

      if (!enabled) {
        repel.vx = 0;
        repel.vy = 0;
        return;
      }

      if (!prepareRefuse()) return;

      const invitation = $('#invitation');
      const sceneRect = invitation.getBoundingClientRect();

      const width = refuse.offsetWidth;
      const height = refuse.offsetHeight;
      const centerX = repel.x + width / 2;
      const centerY = repel.y + height / 2;

      let accelerationX = 0;
      let accelerationY = 0;

if (repel.pointer && performance.now() >= repel.bounceUntil) {
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

      /*
       * 수락 버튼과 대사에 가까워지면 반대 방향으로 밀어냅니다.
       */
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

  /*
   * 벽 반대 방향 + 화면 중앙 방향으로 튕깁니다.
   * 모서리에서는 두 축 모두 안쪽을 향합니다.
   */
  let directionX = hitLeft ? 1 : hitRight ? -1 : 0;
  let directionY = hitTop ? 1 : hitBottom ? -1 : 0;

  if (!directionX) {
    directionX = repel.x < (minX + maxX) / 2 ? 0.75 : -0.75;
  }

  if (!directionY) {
    directionY = repel.y < (minY + maxY) / 2 ? 0.75 : -0.75;
  }

  const length = Math.hypot(directionX, directionY);
  const bounceSpeed = MAX_SPEED;

  repel.vx = directionX / length * bounceSpeed;
  repel.vy = directionY / length * bounceSpeed;

  // 잠시 커서의 반발력을 무시해 벽에서 빠져나옵니다.
  repel.bounceUntil = performance.now() + 650;
}

      refuse.style.left = `${repel.x.toFixed(2)}px`;
      refuse.style.top = `${repel.y.toFixed(2)}px`;
    }

let pointerStopTimer;

stage.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;

  repel.pointer = {
    x: event.clientX,
    y: event.clientY,
    touch: false
  };

  clearTimeout(pointerStopTimer);

  pointerStopTimer = setTimeout(() => {
    // 커서가 멈추면 반발력·관성·반사를 모두 멈춥니다.
    repel.pointer = null;
    repel.vx = 0;
    repel.vy = 0;
    repel.bounceUntil = 0;
  }, 70);
});

    stage.addEventListener('pointerleave', () => {
      repel.pointer = null;
    });

    refuse?.addEventListener('pointerdown', event => {
      event.preventDefault();

      if (!repel.pointer) {
  repel.vx = 0;
  repel.vy = 0;
  return;
}

      if (!prepareRefuse()) return;

      repel.pointer = {
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType === 'touch'
      };

      /*
       * タッチ時は指を離しても少しだけ力を残します。
       */
      if (event.pointerType === 'touch') {
        const pointer = repel.pointer;

        setTimeout(() => {
          if (repel.pointer === pointer) {
            repel.pointer = null;
          }
        }, 300);
      }
    });

    refuse?.addEventListener('click', event => {
      event.preventDefault();
    });

    document.addEventListener('pointercancel', () => {
      repel.pointer = null;
    });

    /*
     * スクロール位置に合わせて各場面を描画します。
     */

    /*
 * 기존 고래 이미지를 Canvas로 그려
 * 몸 중앙은 유지하고 양쪽 지느러미 부위를 변형합니다.
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

  // Canvas 해상도 제한으로 확대 시 과도한 메모리 사용 방지.
  const width = Math.min(sourceWidth, 1400);
  const height = Math.round(width * sourceHeight / sourceWidth);
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

    // 몸통 중앙은 고정하고 양쪽으로 갈수록 변형을 늘립니다.
    const finWeight = Math.pow(
      Math.max(0, (Math.abs(u - 0.5) - 0.17) / 0.33),
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

  // Canvas에 정상적으로 그린 후 원본 이미지를 숨깁니다.
  swimSource.style.visibility = 'hidden';
}

    let previousTime = 0;

    function render(now) {
      const dt = Math.min(
        0.033,
        Math.max(0.001, (now - (previousTime || now)) / 1000)
      );

      previousTime = now;

      const s = Math.min(
        storyLength,
        Math.max(0, scrollTop() / vh)
      );

      const introFade = 1 - seg(s, 0.85, 1.25);
      const mapFade =
        seg(s, 0.95, 1.45) * (1 - seg(s, 3.05, 3.8));
      const harborFade =
        seg(s, 3.2, 4) * (1 - seg(s, 6.65, 7.35));
      const inviteFade =
        seg(s, 6.9, 7.65) *
        (accepted ? 1 - seg(s, 9.15, 9.75) : 1);
      const acceptedFade =
        accepted ? seg(s, 9.15, 9.85) : 0;

      visibility($('#intro'), introFade);
      opacity('#intro-art', introFade * 0.75);

      reveal(
        dialogues[0],
        (now - introStart) /
          ((dialogues[0]?._chars.length || 1) * 36 + 500)
      );

      visibility($('#map-scene'), mapFade);

      const z = seg(s, 2.05, 3.55);
      const mapWorld = $('#map-world');

      if (mapWorld) {
        const width = mapWorld.clientWidth;
        const height = mapWorld.clientHeight;

        mapWorld.style.transform = reduced
          ? 'none'
          : `translate(${width * 0.115 * z}px,
                       ${height * 0.243 * z}px)
             scale(${1 + 4.5 * z * z})`;
      }

      opacity('.map-heading', 1 - seg(s, 2.1, 2.65));
      opacity('.compass', 1 - seg(s, 2.7, 3.2));
      opacity('.marker-label', 1 - seg(s, 2.2, 2.6));

      visibility($('#harbor'), harborFade);

      const harborImage = $('#harbor-image');

      if (harborImage) {
        harborImage.style.transform = reduced
          ? 'none'
          : `scale(${1.06 - 0.06 * seg(s, 3.2, 6.6)})
             translateY(${-1.5 * seg(s, 4, 6.6)}%)`;
      }

      const arrival =
        seg(s, 3.65, 4.1) * (1 - seg(s, 4.45, 4.8));
      const night =
        seg(s, 5, 5.2) * (1 - seg(s, 6.4, 6.8));

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
        type(dialogues[1], seg(s, 3.8, 4.35), now);
      }

      if (night > 0.01) {
        type(dialogues[2], seg(s, 5.05, 6.1), now);
      }

/*
 * 선착장 고래:
 * 중앙의 먼 곳에서 등장 → 정면으로 접근 →
 * 화면을 가득 채움 → 선착장과 함께 다음 장면으로 전환.
 */
const whaleFlight = $('#whale-flight');

if (whaleFlight) {
  const image = whaleFlight.querySelector('img');

  const screenWidth = stage.clientWidth;
  const screenHeight = stage.clientHeight;

  const imageRatio =
    image?.naturalWidth && image?.naturalHeight
      ? image.naturalWidth / image.naturalHeight
      : 1.5;

  const baseWidth = Math.min(
    screenWidth * 0.72,
    screenHeight * 0.85
  );

  const baseHeight = baseWidth / imageRatio;

  /*
   * 이미지의 투명 여백도 고려해
   * 화면보다 충분히 크게 확대합니다.
   */
  const fullScale = Math.max(
    screenWidth / baseWidth,
    screenHeight / baseHeight
  ) * 1.8;

  const approach = seg(s, 5.7, 6.6);
  const appear = seg(s, 5.7, 5.95);

  const scale = reduced
    ? 0.9
    : 0.18 + (fullScale - 0.18) * approach;

  whaleFlight.style.setProperty(
    'position', 'absolute', 'important'
  );

  whaleFlight.style.setProperty(
    'left', '50%', 'important'
  );

  whaleFlight.style.setProperty(
    'top', '55%', 'important'
  );

  whaleFlight.style.setProperty(
    'width', `${baseWidth}px`, 'important'
  );

  whaleFlight.style.setProperty(
    'height', `${baseHeight}px`, 'important'
  );

  whaleFlight.style.setProperty(
    'margin', '0', 'important'
  );

  whaleFlight.style.setProperty(
    'animation', 'none', 'important'
  );

  whaleFlight.style.setProperty(
    'transition', 'none', 'important'
  );

  whaleFlight.style.transformOrigin = '50% 50%';
  whaleFlight.style.opacity = appear;

const bob = reduced
  ? 0
  : Math.sin(now / 1000 * Math.PI * 2 / 3.6) *
    7 * (1 - approach);

whaleFlight.style.transform =
  `translate(-50%, calc(-50% + ${bob}px)) scale(${scale})`;

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

      visibility($('#invitation'), inviteFade);

      if (inviteFade > 0.01) {
        type(dialogues[3], seg(s, 7.3, 8.15), now);
      }

      const choiceReady = s >= 8.15 && !accepted;

      if (choices) {
        choices.style.opacity = seg(s, 8.05, 8.45);
        choices.inert = !choiceReady;
        choices.setAttribute('aria-hidden', String(!choiceReady));
      }

      /*
       * 거절 버튼이 choices 밖으로 이동한 후에도
       * 동일한 등장 시점과 클릭 가능 상태를 적용합니다.
       */
      if (refuse?.classList.contains('has-moved')) {
        refuse.style.opacity = seg(s, 8.05, 8.45);
        refuse.inert = !choiceReady;
        refuse.style.pointerEvents = choiceReady ? 'auto' : 'none';
      }

      opacity('.invitation-question', seg(s, 7.95, 8.25));

      visibility($('#accepted'), acceptedFade);

      if (acceptedFade > 0.01) {
        type(dialogues[4], seg(s, 9.55, 10.15), now);
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
        const waitingForChoice = s > 8.4 && !accepted;

        continueButton.style.opacity = waitingForChoice ? 0 : 1;
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

      updateRefuse(dt);
      requestAnimationFrame(render);
    }

    const stops = [
      1.6, 2.7, 4.15, 4.9, 5.65,
      6.25, 7.75, 8.6, 10.1
    ];

    function nextScene() {
      const current = scrollTop() / vh;

      if (accepted && current > 9.4) {
        openMissions();
        return;
      }

      const next = stops.find(stop =>
        stop > current + 0.22 &&
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

      if (missions) missions.hidden = true;

      restoreRefuse();

      const message = $('#dodge-message');
      if (message) message.textContent = '';

      dialogues.forEach(element => typingStarts.delete(element));

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

      repel.pointer = null;

      measure();
      jump(10.1);
    });

    function openMissions() {
      if (!accepted || !missions) return;

      missions.hidden = false;

      missions.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start'
      });
    }

    $('#open-missions')?.addEventListener('click', openMissions);

    /*
     * 고정된 장면 위의 휠 입력을 문서 스크롤에 연결합니다.
     */
    stage.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const multiplier = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? vh
          : 1;

      event.preventDefault();
      changeScroll(event.deltaY * multiplier);
    }, { passive: false });

    /*
     * 모바일 한 손가락 세로 스크롤.
     */
    stage.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) {
        touchPoint = null;
        return;
      }

      touchPoint = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    }, { passive: true });

    stage.addEventListener('touchmove', event => {
      if (!touchPoint || event.touches.length !== 1) return;

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
    }, { passive: false });

    stage.addEventListener('touchend', () => {
      touchPoint = null;
    });

    stage.addEventListener('touchcancel', () => {
      touchPoint = null;
    });

    /*
     * 키보드 스크롤.
     */
    document.addEventListener('keydown', event => {
      const tag = event.target?.tagName;

      if (
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']
          .includes(tag) ||
        event.target?.isContentEditable ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      if (scrollTop() >= story.offsetHeight - vh) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        changeScroll(80);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        changeScroll(-80);
      } else if (event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        jump(scrollTop() / vh + 0.8);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        jump(scrollTop() / vh - 0.8);
      }
    });

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        const oldPosition = scrollTop() / vh;
        const wasInsideStory = oldPosition <= storyLength;

        restoreRefuse();

        if (accepted && refuse) refuse.hidden = true;

        measure();

        if (wasInsideStory) jump(oldPosition, false);
      }, 150);
    });

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    measure();
    jump(0, false);
    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
