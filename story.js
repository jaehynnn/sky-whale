'use strict';

(() => {
  function start() {
    const $ = selector => document.querySelector(selector);
    const $$ = selector => [...document.querySelectorAll(selector)];

    const stage = $('#stage');
    const story = $('#story');

    if (!stage || !story) {
      console.error('필수 요소 #stage 또는 #story가 없습니다.');
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
    let position = 0;
    let currentChapter = -1;
    let introStart = performance.now();
    let lastDodge = 0;
    let dodgeCount = 0;
    let resizeTimer;
    let touchPoint = null;

    const typingStarts = new WeakMap();

    /*
     * 기존 CSS와 관계없이 스크롤 영역과 버튼의
     * 클릭 가능 상태를 명확하게 설정합니다.
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
        touch-action: none;
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

      #stage .story-footer button,
      #stage .pagination button {
        pointer-events: auto !important;
      }

      #continue {
        cursor: pointer;
        min-height: 44px;
      }

      #choices {
        z-index: 110 !important;
      }

      #refuse.has-moved {
        position: absolute !important;
        z-index: 120 !important;
        margin: 0 !important;
        transform: none !important;
        transition:
          left .42s cubic-bezier(.22,.8,.32,1),
          top .42s cubic-bezier(.22,.8,.32,1);
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
      const previousVh = vh;
      const previousPosition = scrollTop() / previousVh;

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

      return previousPosition;
    }

    function goToPixels(top, animate = true) {
      const max = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );

      const destination = Math.max(0, Math.min(max, top));

      window.scrollTo({
        top: destination,
        left: 0,
        behavior: animate && !reduced ? 'smooth' : 'auto'
      });
    }

    function jump(to, animate = true) {
      goToPixels(to * vh, animate);
    }

    function changeScroll(delta) {
      if (!Number.isFinite(delta)) return;
      goToPixels(scrollTop() + delta, false);
    }

    /*
     * 대사를 글자별 요소로 구성합니다.
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

      $$('[data-jump]').forEach((button, buttonIndex) => {
        if (buttonIndex === Math.min(3, index)) {
          button.setAttribute('aria-current', 'step');
        } else {
          button.removeAttribute('aria-current');
        }
      });
    }

    function render(now) {
      position = Math.min(
        storyLength,
        Math.max(0, scrollTop() / vh)
      );

      const s = position;

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

        /*
         * 목적지를 향해 이동하며 확대합니다.
         * 회전은 적용하지 않습니다.
         */
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

      const fly = seg(s, 5.7, 6.9);
      const whaleFlight = $('#whale-flight');

      if (whaleFlight) {
        whaleFlight.style.left = `${-85 + 145 * fly}%`;

        whaleFlight.style.opacity = reduced
          ? 0
          : seg(s, 5.7, 5.95) *
            (1 - seg(s, 6.65, 6.95));

        whaleFlight.style.transform =
          `scale(${0.45 + 1.25 * fly})
           rotate(${-12 + 15 * fly}deg)`;
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
    }

    function reset() {
      accepted = false;
      storyLength = 9.6;
      if (missions) missions.hidden = true;

      restoreRefuse();

      const message = $('#dodge-message');
      if (message) message.textContent = '';

      dialogues.forEach(element => typingStarts.delete(element));

      dodgeCount = 0;
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

    function dodge(event) {
      if (!refuse || !accept || accepted) return;

      const current = scrollTop() / vh;

      if (
        current < 8.1 ||
        current > 9.2 ||
        performance.now() - lastDodge < 380
      ) {
        return;
      }

      if (event?.cancelable) event.preventDefault();

      lastDodge = performance.now();
      dodgeCount++;

      const stageRect = stage.getBoundingClientRect();
      const acceptRect = accept.getBoundingClientRect();
      const copyRect = $('.invitation-copy')?.getBoundingClientRect();

      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const buttonWidth = refuse.offsetWidth;
      const buttonHeight = refuse.offsetHeight;

      const pointerX =
        Number.isFinite(event?.clientX)
          ? event.clientX - stageRect.left
          : width / 2;

      const pointerY =
        Number.isFinite(event?.clientY)
          ? event.clientY - stageRect.top
          : height * 0.75;

      const candidates = [
        [0.1, 0.2], [0.66, 0.21],
        [0.06, 0.63], [0.65, 0.63],
        [0.08, 0.82], [0.66, 0.83],
        [0.1, 0.12], [0.64, 0.12]
      ];

      let best = null;
      let bestScore = -Infinity;

      candidates.forEach(([fractionX, fractionY]) => {
        const x = Math.max(
          16,
          Math.min(width - buttonWidth - 16, fractionX * width)
        );

        const y = Math.max(
          80,
          Math.min(height - buttonHeight - 86, fractionY * height)
        );

        const rect = {
          left: x + stageRect.left,
          right: x + stageRect.left + buttonWidth,
          top: y + stageRect.top,
          bottom: y + stageRect.top + buttonHeight
        };

        const overlaps = other => other &&
          rect.left < other.right + 14 &&
          rect.right > other.left - 14 &&
          rect.top < other.bottom + 14 &&
          rect.bottom > other.top - 14;

        if (overlaps(acceptRect) || overlaps(copyRect)) return;

        const score = Math.hypot(
          x + buttonWidth / 2 - pointerX,
          y + buttonHeight / 2 - pointerY
        );

        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      });

      if (!best) return;

      if (!refuse.classList.contains('has-moved')) {
        const oldRect = refuse.getBoundingClientRect();

        $('#invitation').append(refuse);
        refuse.classList.add('has-moved');

        refuse.style.left = `${oldRect.left - stageRect.left}px`;
        refuse.style.top = `${oldRect.top - stageRect.top}px`;

        void refuse.offsetWidth;
      }

      refuse.style.left = `${best.x}px`;
      refuse.style.top = `${best.y}px`;

      const message = $('#dodge-message');

      if (message) {
        message.textContent = dodgeCount > 2
          ? '허허, 이번 여행이 꽤 궁금한 모양이군.'
          : '아직 작별 인사를 하고 싶지 않은 모양이야.';
      }
    }

    stage.addEventListener('pointermove', event => {
      if (
        event.pointerType === 'touch' ||
        accepted ||
        !refuse ||
        scrollTop() / vh < 8.15
      ) {
        return;
      }

      const rect = refuse.getBoundingClientRect();

      if (
        event.clientX > rect.left - 48 &&
        event.clientX < rect.right + 48 &&
        event.clientY > rect.top - 35 &&
        event.clientY < rect.bottom + 35
      ) {
        dodge(event);
      }
    });

    refuse?.addEventListener('pointerdown', dodge);

    refuse?.addEventListener('click', event => {
      event.preventDefault();
      dodge(event);
    });

    /*
     * 고정된 장면 위에서도 휠 입력을 문서 스크롤로 전달합니다.
     * Ctrl/Command를 이용한 확대 동작은 가로채지 않습니다.
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
     * 모바일에서는 한 손가락의 세로 이동을 스크롤에 연결합니다.
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

      event.preventDefault();
      changeScroll(deltaY);
    }, { passive: false });

    stage.addEventListener('touchend', () => {
      touchPoint = null;
    });

    stage.addEventListener('touchcancel', () => {
      touchPoint = null;
    });

    /*
     * 키보드로도 다음 장면으로 진행할 수 있습니다.
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
