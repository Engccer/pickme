// 룰렛 테마 — Broadcast Studio v2 (refined v3)
//
// 디자인 방향: deep navy 무대 위 brass 트림의 큰 룰렛 휠이 주인공.
// SVG 휠 + HTML 오버레이 (Three.js 미사용). animationContainer 전체
// viewport 를 사용하며 작은 16:9 프레임으로 가두지 않는다.
//
// 안전 로직 (절대 깨면 안 됨):
//  - runRouletteAnimation(canvas, selectedStudents, addPickedStudent) 시그니처
//  - isDisposed / rafId / cancelAnimationFrame cleanup 패턴
//  - isComplete 가드 (완료 후 카운터 메시지가 '선발 완료' 덮는 것 방지)
//  - pickingMessage() Math.min clamp — 3/2 카운터 버그 재발 방지
//  - 첫 frame 후 메시지 업데이트 순서
//  - window.AppState.isPaused / shouldStop 처리
//  - addPickedStudent 호출 흐름 유지 (reveal 직후 1회)
//  - 마지막 reveal 후 bgMusicInterval 을 즉시 stop + null — app.js 후속 stop 충돌 방지
//  - resize 리스너 cleanup, 동적 roulette DOM cleanup
//  - 다른 테마와 RAF 격리 (closure 내부 isDisposed/rafId 가드)
//  - 휠 중심부에 P 글자 없음 (HUD 의 작은 브랜드 마크만 허용)
//  - pause/resume 시 trajectory.startT 와 phaseStartT 를 paused duration 만큼
//    shift 하여 resume 직후 즉시 완료되지 않게 보정

async function runRouletteAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // ── 디자인 토큰 (refined v3 — brass 채도/대비 향상)
        const BRASS_HI = '#F2D384';
        const BRASS_MID = '#D9B26F';
        const BRASS_LO = '#8A6E3B';
        const BRASS_SHADOW = '#33260F';
        const SEG_EVEN = '#0E1525';
        const SEG_ODD = '#1D2645';

        // ── 휠 기하학 (디자인 SVG 단위, 휠 wrap pixel 크기로 비례 스케일됨)
        const WHEEL_R = 240;
        const HUB_R = 78;
        const NUM_R = 200;

        // ── 세그먼트 — 학생 수에 비례하되 8~30 클램프, 익명 숫자만 표시
        const total = selectedStudents.length;
        const SEGMENTS = Math.max(8, Math.min(total, 30));
        const SEG_DEG = 360 / SEGMENTS;

        // ── timing (ms)
        const T = {
            idle: 250,       // 첫 프레임 직후 짧은 warm-up
            spin: 1800,      // 등속 회전
            decel: 3300,     // ease-out 감속하며 winner segment 에 안착
            stop: 600,       // winner 강조 (포인터 확인)
            reveal: 1800,    // reveal 패널 노출 (anim 0.55s + 읽기 시간)
            gap: 450,        // 다음 라운드 진입 전 짧은 휴식
            finishing: 1100, // 마지막 라운드 후 '선발 완료' 배너 노출 시간
        };
        const SPIN_SPEED = 540; // deg/sec

        // ── 상태
        let currentPickIndex = 0;
        let phase = 'idle';
        let phaseStartT = performance.now();
        let angle = 0;
        let trajectory = null;     // { kind, startA, endA|velocity, startT, duration }
        let winnerIdx = 0;
        let isComplete = false;
        let isDisposed = false;
        let rafId = null;
        let pauseStartT = null;
        let lastT = performance.now();
        let lastAngle = 0;
        let bgMusicStopped = false;
        const usedSegments = new Set();  // 시각 다양성 — 가능한 한 매 라운드 다른 세그먼트

        // ── DOM 셋업
        const container = canvas.parentElement; // #animationContainer
        const stage = document.createElement('div');
        stage.className = 'roulette-stage';
        stage.setAttribute('aria-hidden', 'true');

        // 분위기 (vignette + key cone + 보조 cone + floor pool + 모트 14개)
        const atmosphere = document.createElement('div');
        atmosphere.className = 'roulette-atmosphere';
        let atmosphereHtml = '<div class="roulette-vignette"></div>'
            + '<div class="roulette-key-cone"></div>'
            + '<div class="roulette-inner-cone"></div>'
            + '<div class="roulette-floor-pool"></div>';
        for (let i = 0; i < 14; i++) {
            const x = (i * 41) % 100;
            const y = 32 + ((i * 23) % 56);
            const dur = 9 + (i % 5) * 2;
            const sz = 1.5 + (i % 3);
            const mx = ((i % 3) - 1) * 14;
            atmosphereHtml += `<span class="roulette-mote" style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;animation-duration:${dur}s;animation-delay:${(i * 0.55).toFixed(1)}s;--mx:${mx}px;"></span>`;
        }
        atmosphere.innerHTML = atmosphereHtml;
        stage.appendChild(atmosphere);

        // 상단 HUD — 학급명 + ROUND 카운터 + 12칸 진행 바
        const first = selectedStudents[0] || {};
        const sameGrade = selectedStudents.every(s => s && s.grade === first.grade);
        const sameClass = selectedStudents.every(s => s && s.class === first.class);
        let classLabel = '';
        if (first.grade && first.class && sameGrade && sameClass) {
            classLabel = `${first.grade}학년 ${first.class}반`;
        } else if (first.grade && sameGrade) {
            classLabel = `${first.grade}학년`;
        }
        const barSegments = Math.max(1, Math.min(total, 12));
        let hudBarHtml = '';
        for (let i = 0; i < barSegments; i++) {
            hudBarHtml += '<span class="roulette-hud-bar-cell"></span>';
        }
        const hud = document.createElement('div');
        hud.className = 'roulette-hud';
        hud.innerHTML = `
            <div class="roulette-hud-left">
                <span class="roulette-hud-mark" aria-hidden="true">P</span>
                ${classLabel ? `<span class="roulette-hud-class">${classLabel}</span>` : ''}
                <span class="roulette-hud-sub">룰렛 선발</span>
            </div>
            <div class="roulette-hud-right">
                <span class="roulette-hud-label">ROUND</span>
                <span class="roulette-hud-counter">
                    <strong class="roulette-hud-num">01</strong>
                    <span class="roulette-hud-divider"> / </span>
                    <span class="roulette-hud-total">${String(total).padStart(2, '0')}</span>
                </span>
                <div class="roulette-hud-bar" aria-hidden="true">${hudBarHtml}</div>
            </div>
        `;
        stage.appendChild(hud);

        // ── 휠 SVG (segments + dividers + ticks + numbers + 추상 brass 허브 + 포인터)
        //
        // SVG 좌표계: viewBox -280 -280 560 560 (center = 0,0). 휠 wrap pixel
        // 크기에 비례 스케일된다. 휠 중심부에는 P 글자 없음 — polished brass
        // dome + N/E/S/W 컴퍼스 틱 + 중앙 signet dot 만.

        function segPath(rOuter, rInner, startDeg, endDeg) {
            const a1 = (startDeg - 90) * Math.PI / 180;
            const a2 = (endDeg - 90) * Math.PI / 180;
            const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
            const cos2 = Math.cos(a2), sin2 = Math.sin(a2);
            const o1x = (rOuter * cos1).toFixed(2);
            const o1y = (rOuter * sin1).toFixed(2);
            const o2x = (rOuter * cos2).toFixed(2);
            const o2y = (rOuter * sin2).toFixed(2);
            const i1x = (rInner * cos1).toFixed(2);
            const i1y = (rInner * sin1).toFixed(2);
            const i2x = (rInner * cos2).toFixed(2);
            const i2y = (rInner * sin2).toFixed(2);
            return `M ${i1x} ${i1y} L ${o1x} ${o1y} A ${rOuter} ${rOuter} 0 0 1 ${o2x} ${o2y} L ${i2x} ${i2y} A ${rInner} ${rInner} 0 0 0 ${i1x} ${i1y} Z`;
        }

        // segments
        let segmentsHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const baseFill = i % 2 === 0 ? SEG_EVEN : SEG_ODD;
            segmentsHtml += `<path class="ro-seg" data-idx="${i}" d="${segPath(WHEEL_R - 4, HUB_R + 2, i * SEG_DEG, (i + 1) * SEG_DEG)}" fill="${baseFill}"></path>`;
        }

        // winner 강조용 brass 틴트 (초기 d 빈 값, 강조 시 setAttribute)
        const winnerTintHtml = `<path class="ro-winner-tint" d="" fill="${BRASS_MID}" opacity="0"></path>`;

        // 분할선
        let dividersHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const a = (i * SEG_DEG - 90) * Math.PI / 180;
            const x1 = ((HUB_R + 2) * Math.cos(a)).toFixed(2);
            const y1 = ((HUB_R + 2) * Math.sin(a)).toFixed(2);
            const x2 = ((WHEEL_R - 4) * Math.cos(a)).toFixed(2);
            const y2 = ((WHEEL_R - 4) * Math.sin(a)).toFixed(2);
            dividersHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BRASS_LO}" stroke-width="0.9" opacity="0.72"/>`;
        }

        // 외곽 tick
        let ticksHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const a = ((i + 0.5) * SEG_DEG - 90) * Math.PI / 180;
            const x1 = ((WHEEL_R - 10) * Math.cos(a)).toFixed(2);
            const y1 = ((WHEEL_R - 10) * Math.sin(a)).toFixed(2);
            const x2 = ((WHEEL_R - 3) * Math.cos(a)).toFixed(2);
            const y2 = ((WHEEL_R - 3) * Math.sin(a)).toFixed(2);
            ticksHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BRASS_HI}" stroke-width="0.8" opacity="0.55"/>`;
        }

        // 익명 숫자 01..N — 학생 이름은 절대 휠에 노출하지 않음
        let numbersHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const centerA = (i + 0.5) * SEG_DEG;
            const a = (centerA - 90) * Math.PI / 180;
            const x = (NUM_R * Math.cos(a)).toFixed(2);
            const y = (NUM_R * Math.sin(a)).toFixed(2);
            numbersHtml += `<text class="ro-num" data-idx="${i}" x="${x}" y="${y}" text-anchor="middle" dy="0.34em" font-family="Manrope, system-ui, sans-serif" font-size="14" font-weight="600" fill="${BRASS_HI}" opacity="0.92" transform="rotate(${centerA.toFixed(2)} ${x} ${y})" style="letter-spacing: 0.5px">${String(i + 1).padStart(2, '0')}</text>`;
        }

        // 추상 brass 허브 — P 글자 없음
        const hubCompassTicks = [0, 90, 180, 270].map(deg => {
            const a = (deg - 90) * Math.PI / 180;
            const x1 = ((HUB_R - 36) * Math.cos(a)).toFixed(2);
            const y1 = ((HUB_R - 36) * Math.sin(a)).toFixed(2);
            const x2 = ((HUB_R - 30) * Math.cos(a)).toFixed(2);
            const y2 = ((HUB_R - 30) * Math.sin(a)).toFixed(2);
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BRASS_SHADOW}" stroke-width="0.8" opacity="0.55"/>`;
        }).join('');

        const domeR = HUB_R - 32;
        const hubHtml = `
            <circle r="${HUB_R + 2}" fill="none" stroke="${BRASS_LO}" stroke-width="2" opacity="0.85"/>
            <circle r="${HUB_R}" fill="none" stroke="${BRASS_HI}" stroke-width="0.6" opacity="0.55"/>
            <circle r="${HUB_R - 2}" fill="url(#ro-hub-base)"/>
            <circle r="${HUB_R - 14}" fill="none" stroke="${BRASS_MID}" stroke-width="1" opacity="0.7"/>
            <circle r="${domeR}" fill="url(#ro-hub-dome)" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,.5));"/>
            ${hubCompassTicks}
            <circle r="${HUB_R - 36}" fill="none" stroke="${BRASS_SHADOW}" stroke-width="0.6" opacity="0.4"/>
            <ellipse cx="${(-domeR * 0.35).toFixed(2)}" cy="${(-domeR * 0.45).toFixed(2)}" rx="${(domeR * 0.42).toFixed(2)}" ry="${(domeR * 0.22).toFixed(2)}" fill="rgba(255,250,235,.65)" filter="blur(1.2)"/>
            <ellipse cx="${(-domeR * 0.45).toFixed(2)}" cy="${(-domeR * 0.55).toFixed(2)}" rx="${(domeR * 0.18).toFixed(2)}" ry="${(domeR * 0.08).toFixed(2)}" fill="rgba(255,255,255,.85)" filter="blur(0.5)"/>
            <circle r="5" fill="${BRASS_SHADOW}"/>
            <circle r="3" fill="url(#ro-hub-dome)"/>
            <circle r="1.2" cy="-1" fill="rgba(255,250,235,.85)"/>
        `;

        // winner 외곽 마커 (초기 hidden)
        const winnerMarkerHtml = `<g class="ro-winner-marker" style="display:none">
            <circle class="ro-winner-marker-outer" r="3.5" fill="${BRASS_HI}"/>
            <circle r="1.4" fill="#FFF" opacity="0.9"/>
        </g>`;

        // 포인터 (고정, tilt 만 변경)
        const pointerHtml = `
            <g class="ro-pointer-group" transform="translate(0 ${-(WHEEL_R + 22)})">
                <circle cx="0" cy="-2" r="8" fill="url(#ro-ptr-brass)" stroke="${BRASS_SHADOW}" stroke-width="0.5" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,.6))"/>
                <circle cx="-2" cy="-4" r="2.5" fill="rgba(255,255,255,.6)" filter="blur(0.5)"/>
                <rect x="-3" y="4" width="6" height="14" rx="1.5" fill="url(#ro-ptr-brass)" stroke="${BRASS_SHADOW}" stroke-width="0.4"/>
                <path d="M -14 18 L 14 18 L 0 50 Z" fill="url(#ro-ptr-brass)" stroke="${BRASS_SHADOW}" stroke-width="0.6" stroke-linejoin="round" style="filter: drop-shadow(0 3px 5px rgba(0,0,0,.55))"/>
                <path d="M -10 19 L -1 19 L -4 26 Z" fill="rgba(255,255,255,.45)" filter="blur(0.5)"/>
                <circle cx="0" cy="49" r="1.6" fill="${BRASS_SHADOW}"/>
            </g>
        `;

        const svgSize = (WHEEL_R + 40) * 2;
        const wheelWrap = document.createElement('div');
        wheelWrap.className = 'roulette-wheel-wrap';
        wheelWrap.innerHTML = `
            <svg class="roulette-wheel-svg" viewBox="-${WHEEL_R + 40} -${WHEEL_R + 40} ${svgSize} ${svgSize}">
                <defs>
                    <radialGradient id="ro-hub-base" cx="0.4" cy="0.35" r="0.7">
                        <stop offset="0%" stop-color="#1E2540"/>
                        <stop offset="60%" stop-color="#0B0F1F"/>
                        <stop offset="100%" stop-color="#04060F"/>
                    </radialGradient>
                    <radialGradient id="ro-hub-dome" cx="0.35" cy="0.3" r="0.75">
                        <stop offset="0%" stop-color="#FFEBB8"/>
                        <stop offset="22%" stop-color="${BRASS_HI}"/>
                        <stop offset="55%" stop-color="${BRASS_MID}"/>
                        <stop offset="85%" stop-color="${BRASS_LO}"/>
                        <stop offset="100%" stop-color="${BRASS_SHADOW}"/>
                    </radialGradient>
                    <linearGradient id="ro-brass-ring" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${BRASS_HI}"/>
                        <stop offset="40%" stop-color="${BRASS_MID}"/>
                        <stop offset="100%" stop-color="${BRASS_LO}"/>
                    </linearGradient>
                    <linearGradient id="ro-ptr-brass" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${BRASS_HI}"/>
                        <stop offset="50%" stop-color="${BRASS_MID}"/>
                        <stop offset="100%" stop-color="${BRASS_LO}"/>
                    </linearGradient>
                    <radialGradient id="ro-seg-shading" cx="0.5" cy="0.5" r="0.5">
                        <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
                        <stop offset="100%" stop-color="rgba(0,0,0,.6)"/>
                    </radialGradient>
                </defs>

                <ellipse cx="0" cy="${WHEEL_R + 18}" rx="${WHEEL_R * 0.95}" ry="14" fill="rgba(0,0,0,.7)" filter="blur(8)"/>

                <circle r="${WHEEL_R + 16}" fill="${BRASS_SHADOW}" opacity="0.5"/>
                <circle r="${WHEEL_R + 12}" fill="url(#ro-brass-ring)"/>
                <path d="M 0 ${-(WHEEL_R + 12)} A ${WHEEL_R + 12} ${WHEEL_R + 12} 0 0 1 ${WHEEL_R + 12} 0" stroke="rgba(255,255,255,.45)" stroke-width="1.5" fill="none" opacity="0.8"/>
                <path d="M 0 ${WHEEL_R + 12} A ${WHEEL_R + 12} ${WHEEL_R + 12} 0 0 1 ${-(WHEEL_R + 12)} 0" stroke="rgba(0,0,0,.6)" stroke-width="1.5" fill="none"/>

                <circle r="${WHEEL_R - 1}" fill="#06080F"/>

                <g class="ro-wheel-rotating" transform="rotate(0)">
                    ${segmentsHtml}
                    ${winnerTintHtml}
                    <circle r="${WHEEL_R - 4}" fill="url(#ro-seg-shading)" pointer-events="none"/>
                    ${dividersHtml}
                    ${ticksHtml}
                    ${numbersHtml}
                    ${winnerMarkerHtml}
                    ${hubHtml}
                </g>

                ${pointerHtml}
            </svg>
        `;
        stage.appendChild(wheelWrap);

        // reveal 패널 wrap (rail + finial + plate)
        const revealWrap = document.createElement('div');
        revealWrap.className = 'roulette-reveal-wrap';
        revealWrap.setAttribute('aria-hidden', 'true');
        revealWrap.innerHTML = `
            <div class="roulette-reveal-rail"></div>
            <div class="roulette-reveal-finial"></div>
            <div class="roulette-reveal-panel">
                <div class="roulette-reveal-card">
                    <div class="roulette-reveal-stripe"></div>
                    <div class="roulette-reveal-body">
                        <div class="roulette-reveal-eyebrow">선발 · ROUND <span class="roulette-reveal-round">01</span></div>
                        <div class="roulette-reveal-name"></div>
                        <div class="roulette-reveal-sub"></div>
                    </div>
                </div>
            </div>
        `;
        stage.appendChild(revealWrap);

        // 하단 rail (상태 + chips + 자동 진행 hint)
        const railEl = document.createElement('div');
        railEl.className = 'roulette-rail';
        railEl.innerHTML = `
            <div class="roulette-rail-status">
                <span class="roulette-rail-dot" data-phase="idle"></span>
                <span class="roulette-rail-status-text">대기 중</span>
            </div>
            <div class="roulette-rail-chips">
                <span class="roulette-rail-chips-label">앞선 선발</span>
                <span class="roulette-rail-chips-empty">아직 없음</span>
            </div>
            <div class="roulette-rail-hint">
                <span class="roulette-rail-hint-text">자동 진행</span>
            </div>
        `;
        stage.appendChild(railEl);

        // 선발 완료 배너
        const finishBanner = document.createElement('div');
        finishBanner.className = 'roulette-finish-banner';
        finishBanner.textContent = '선발 완료';
        stage.appendChild(finishBanner);

        // 마운트
        container.appendChild(stage);
        container.classList.add('roulette-active');

        // ── DOM 참조
        const wheelRotatingGroup = wheelWrap.querySelector('.ro-wheel-rotating');
        const pointerGroup = wheelWrap.querySelector('.ro-pointer-group');
        const winnerTint = wheelWrap.querySelector('.ro-winner-tint');
        const winnerMarker = wheelWrap.querySelector('.ro-winner-marker');
        const numberNodes = Array.from(wheelWrap.querySelectorAll('.ro-num'));

        const hudNumEl = hud.querySelector('.roulette-hud-num');
        const hudBarCells = hud.querySelectorAll('.roulette-hud-bar-cell');

        const revealRoundEl = revealWrap.querySelector('.roulette-reveal-round');
        const revealNameEl = revealWrap.querySelector('.roulette-reveal-name');
        const revealSubEl = revealWrap.querySelector('.roulette-reveal-sub');

        const railDot = railEl.querySelector('.roulette-rail-dot');
        const railStatusText = railEl.querySelector('.roulette-rail-status-text');
        const railChipsContainer = railEl.querySelector('.roulette-rail-chips');
        const railChipsEmpty = railEl.querySelector('.roulette-rail-chips-empty');

        // 기존 .animation-message — 시각적으로 숨김 (CSS) 이지만 pickingMessage()
        // 호출은 그대로 유지 (Math.min clamp 흐름 보존)
        const messageElement = document.querySelector('.animation-message');

        function updateMessage(message) {
            if (messageElement) messageElement.textContent = message;
        }

        // 진행 카운터 메시지 — 분자가 분모를 초과하지 않게 clamp
        function pickingMessage() {
            const display = Math.min(currentPickIndex + 1, selectedStudents.length);
            return `${display}/${selectedStudents.length} 선발 중...`;
        }

        function updateHud() {
            const display = Math.min(currentPickIndex + 1, total);
            hudNumEl.textContent = String(display).padStart(2, '0');
            const completed = Math.min(currentPickIndex, total);
            if (total <= 12) {
                hudBarCells.forEach((cell, i) => {
                    cell.classList.toggle('filled', i < completed);
                });
            } else {
                const ratio = completed / total;
                const filled = Math.round(ratio * 12);
                hudBarCells.forEach((cell, i) => {
                    cell.classList.toggle('filled', i < filled);
                });
            }
        }

        const PHASE_TEXT = {
            idle: '대기 중',
            spin: '룰렛 회전 중',
            decel: '룰렛 감속 중',
            stop: '포인터 확인',
            reveal: '발표',
            gap: '다음 추첨 준비',
            finishing: '선발 완료',
        };

        function setRailPhase(phaseName) {
            railDot.setAttribute('data-phase', phaseName);
            railStatusText.textContent = PHASE_TEXT[phaseName] || '';
        }

        function addChip(student) {
            if (railChipsEmpty && railChipsEmpty.parentElement) {
                railChipsEmpty.remove();
            }
            const chip = document.createElement('span');
            chip.className = 'roulette-rail-chip';
            chip.textContent = student.name;
            railChipsContainer.appendChild(chip);
            const chips = railChipsContainer.querySelectorAll('.roulette-rail-chip');
            if (chips.length > 6) chips[0].remove();
        }

        // ── winner 시각 강조 / 해제
        function highlightWinner(idx) {
            if (winnerTint) {
                winnerTint.setAttribute('d', segPath(WHEEL_R - 4, HUB_R + 2, idx * SEG_DEG, (idx + 1) * SEG_DEG));
                winnerTint.setAttribute('opacity', '0.16');
            }
            numberNodes.forEach((n, i) => {
                if (i === idx) {
                    n.setAttribute('fill', BRASS_HI);
                    n.setAttribute('opacity', '1');
                } else {
                    n.setAttribute('opacity', '0.45');
                }
            });
            if (winnerMarker) {
                const centerA = (idx + 0.5) * SEG_DEG;
                const a = (centerA - 90) * Math.PI / 180;
                const mx = ((WHEEL_R - 14) * Math.cos(a)).toFixed(2);
                const my = ((WHEEL_R - 14) * Math.sin(a)).toFixed(2);
                winnerMarker.setAttribute('transform', `translate(${mx} ${my}) rotate(${centerA.toFixed(2)})`);
                winnerMarker.style.display = 'block';
                const outer = winnerMarker.querySelector('.ro-winner-marker-outer');
                if (outer) outer.setAttribute('filter', `drop-shadow(0 0 6px ${BRASS_HI})`);
            }
        }

        function clearWinnerHighlight() {
            if (winnerTint) winnerTint.setAttribute('opacity', '0');
            numberNodes.forEach((n) => {
                n.setAttribute('fill', BRASS_HI);
                n.setAttribute('opacity', '0.92');
            });
            if (winnerMarker) winnerMarker.style.display = 'none';
        }

        // ── winner segment 선택 — 가능한 한 라운드마다 다른 세그먼트
        function pickWinner() {
            const available = [];
            for (let i = 0; i < SEGMENTS; i++) {
                if (!usedSegments.has(i)) available.push(i);
            }
            if (available.length === 0) {
                usedSegments.clear();
                for (let i = 0; i < SEGMENTS; i++) available.push(i);
            }
            const pick = available[Math.floor(Math.random() * available.length)];
            usedSegments.add(pick);
            return pick;
        }

        // 휠을 target segment 가 12시(포인터) 아래로 오도록 안착시키는 각도 계산
        // (3~4 바퀴 추가 회전 포함)
        function targetAngleForSegment(currentAngle, segIdx) {
            const required = ((-(segIdx + 0.5) * SEG_DEG) % 360 + 360) % 360;
            const minExtra = 360 * 3 + Math.random() * 360;
            let target = currentAngle + minExtra;
            const cur = ((target % 360) + 360) % 360;
            const delta = (required - cur + 360) % 360;
            target += delta;
            return target;
        }

        const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

        // ── phase 전환
        function transitionTo(newPhase, now) {
            phase = newPhase;
            phaseStartT = now;

            if (newPhase === 'spin') {
                winnerIdx = pickWinner();
                clearWinnerHighlight();
                revealWrap.classList.remove('show');
                revealWrap.setAttribute('aria-hidden', 'true');
                wheelWrap.classList.remove('dim');
                stage.classList.remove('dim');
                trajectory = {
                    kind: 'linear',
                    startA: angle,
                    startT: now,
                    velocity: SPIN_SPEED,
                    duration: T.spin / 1000,
                };
                setRailPhase('spin');
                updateMessage(pickingMessage());
            } else if (newPhase === 'decel') {
                const startA = angle;
                const endA = targetAngleForSegment(startA, winnerIdx);
                trajectory = {
                    kind: 'ease',
                    startA,
                    endA,
                    startT: now,
                    duration: T.decel / 1000,
                };
                setRailPhase('decel');
            } else if (newPhase === 'stop') {
                trajectory = null;
                highlightWinner(winnerIdx);
                setRailPhase('stop');
            } else if (newPhase === 'reveal') {
                const student = selectedStudents[currentPickIndex];
                revealRoundEl.textContent = String(Math.min(currentPickIndex + 1, total)).padStart(2, '0');
                revealNameEl.textContent = student.name;
                const role = (window.AppState && window.AppState.purpose) ? String(window.AppState.purpose).trim() : '';
                revealSubEl.textContent = role || '';
                revealWrap.classList.add('show');
                revealWrap.setAttribute('aria-hidden', 'false');
                wheelWrap.classList.add('dim');
                stage.classList.add('dim');

                // 기존 흐름: addPickedStudent → 사운드 큐
                if (addPickedStudent) addPickedStudent(student);
                addChip(student);
                if (typeof soundManager !== 'undefined' && soundManager.playLotteryPick) {
                    // 별도 룰렛 효과음이 없으므로 lottery pick 큐를 재사용 (sounds.js 수정 회피)
                    soundManager.playLotteryPick();
                }

                currentPickIndex++;
                setRailPhase('reveal');
                updateMessage(`${student.name} 학생을 선발했습니다!`);
            } else if (newPhase === 'gap') {
                revealWrap.classList.remove('show');
                revealWrap.setAttribute('aria-hidden', 'true');
                wheelWrap.classList.remove('dim');
                stage.classList.remove('dim');
                setRailPhase('gap');
                updateMessage(pickingMessage());
            } else if (newPhase === 'finishing') {
                // 마지막 reveal 종료 직후 배경음 정리 — app.js 후속 stop 충돌 방지
                if (!bgMusicStopped && window.AppState && window.AppState.bgMusicInterval) {
                    if (typeof soundManager !== 'undefined' && soundManager.stopSound) {
                        soundManager.stopSound(window.AppState.bgMusicInterval);
                    }
                    window.AppState.bgMusicInterval = null;
                    bgMusicStopped = true;
                }
                revealWrap.classList.remove('show');
                revealWrap.setAttribute('aria-hidden', 'true');
                wheelWrap.classList.remove('dim');
                stage.classList.remove('dim');
                isComplete = true;            // 카운터 메시지가 '선발 완료' 덮는 것 방지
                setRailPhase('finishing');
                finishBanner.classList.add('show');
                finishBanner.setAttribute('aria-hidden', 'false');
                updateMessage('선발 완료!');
            }
        }

        // ── trajectory 적용 — angle 갱신
        function applyTrajectoryAtTime(now) {
            if (!trajectory) return;
            const elapsed = (now - trajectory.startT) / 1000;
            if (trajectory.kind === 'linear') {
                const e = Math.min(elapsed, trajectory.duration);
                angle = trajectory.startA + trajectory.velocity * e;
            } else if (trajectory.kind === 'ease') {
                const k = Math.min(elapsed / trajectory.duration, 1);
                angle = trajectory.startA + (trajectory.endA - trajectory.startA) * easeOutQuart(k);
            }
        }

        // ── 포인터 tilt (회전 속도 + segPhase 기반 자연스러운 'tick tick')
        function updatePointer(dt) {
            if (!pointerGroup) return;
            const speedDeg = dt > 0 ? Math.abs((angle - lastAngle) / dt) : 0;
            lastAngle = angle;
            const segPhase = (((angle % SEG_DEG) + SEG_DEG) % SEG_DEG) / SEG_DEG;
            const energy = Math.min(speedDeg / 600, 1);
            const lean = segPhase < 0.18
                ? -(segPhase / 0.18) * 8
                : -((1 - segPhase) / 0.82) * 8;
            const tilt = lean * energy;
            pointerGroup.setAttribute('transform', `translate(0 ${-(WHEEL_R + 22)}) rotate(${tilt.toFixed(2)})`);
        }

        // ── 메인 RAF 루프
        function animate(now) {
            // RAF 잔존으로 다른 테마 canvas 오염 방지
            if (isDisposed) return;

            // 일시 중지 — phase/trajectory 시간을 freeze. pauseStartT 기록.
            if (window.AppState && window.AppState.isPaused) {
                if (pauseStartT === null) pauseStartT = now;
                lastT = now;
                rafId = requestAnimationFrame(animate);
                return;
            }

            // 방금 resume — paused duration 만큼 모든 timestamp shift,
            // 그래야 resume 직후 trajectory 가 fast-forward 되지 않음.
            if (pauseStartT !== null) {
                const pausedDur = now - pauseStartT;
                if (trajectory) trajectory.startT += pausedDur;
                phaseStartT += pausedDur;
                pauseStartT = null;
                lastT = now;
            }

            // 강제 중지
            if (window.AppState && window.AppState.shouldStop) {
                cleanup();
                resolve();
                return;
            }

            const dt = Math.min(1 / 30, (now - lastT) / 1000);
            lastT = now;
            const elapsed = now - phaseStartT;

            // phase machine
            if (phase === 'idle') {
                // 천천히 드리프트하다 spin 진입
                angle += 8 * dt;
                if (elapsed > T.idle) transitionTo('spin', now);
            } else if (phase === 'spin') {
                applyTrajectoryAtTime(now);
                if (elapsed > T.spin) transitionTo('decel', now);
            } else if (phase === 'decel') {
                applyTrajectoryAtTime(now);
                if (elapsed > T.decel) {
                    if (trajectory) angle = trajectory.endA; // 정확히 snap
                    trajectory = null;
                    transitionTo('stop', now);
                }
            } else if (phase === 'stop') {
                if (elapsed > T.stop) transitionTo('reveal', now);
            } else if (phase === 'reveal') {
                if (elapsed > T.reveal) {
                    if (currentPickIndex >= selectedStudents.length) {
                        transitionTo('finishing', now);
                    } else {
                        transitionTo('gap', now);
                    }
                }
            } else if (phase === 'gap') {
                if (elapsed > T.gap) transitionTo('spin', now);
            } else if (phase === 'finishing') {
                if (elapsed > T.finishing) {
                    cleanup();
                    resolve();
                    return;
                }
            }

            // 휠 회전 적용 (SVG transform 속성)
            if (wheelRotatingGroup) {
                wheelRotatingGroup.setAttribute('transform', `rotate(${angle.toFixed(3)})`);
            }

            updatePointer(dt);

            if (!isComplete) updateHud();

            rafId = requestAnimationFrame(animate);
        }

        // ── 리사이즈 — SVG/HTML 은 viewport 단위로 자동 응답
        function onWindowResize() {
            // 별도 처리 불필요 — CSS 가 var(--wheel-svg-size) 로 즉시 재계산
        }
        window.addEventListener('resize', onWindowResize);

        // ── 정리
        function cleanup() {
            isDisposed = true;
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            window.removeEventListener('resize', onWindowResize);

            container.classList.remove('roulette-active');
            if (stage && stage.parentElement) {
                stage.parentElement.removeChild(stage);
            }
        }

        // ── 시작
        // 첫 frame "render" 후 메시지 — DOM 마운트는 동기적으로 이미 그려졌으므로
        // 다음 rAF tick 에서 메시지/HUD 를 적용한 뒤 메인 루프 진입.
        rafId = requestAnimationFrame(() => {
            if (isDisposed) return;
            updateMessage('룰렛을 돌리는 중...');
            updateHud();
            setRailPhase('idle');
            phaseStartT = performance.now();
            lastT = performance.now();
            lastAngle = angle;
            animate(performance.now());
        });
    });
}
