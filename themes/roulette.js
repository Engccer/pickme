// 룰렛 테마 — Bright Kitsch Arcade
//
// 디자인 방향: 파스텔 mint 무대 위 큰 prize wheel + 코랄 화살 포인터.
// 휠은 24-petal scallop rim + warm yellow outer ring + 12 pastel
// segment + cream divider + sun dot. 허브는 단순 sun disc 로 문자/로고
// 없음. 배경에 bunting 깃발 + starburst rays. SVG + HTML 오버레이.
//
// 절대 포함하지 않는 것 (사용자 명시):
//  - HUD 좌측의 P 마크 / "P" 글자
//  - 휠 중심부의 P 문자 / 다른 로고 문자
//  - 화면에 떠 있는 로또 공처럼 보이는 원형 장식 (mote/광원 점)
//  - 휠 segment 위 학생 이름 노출 — reveal 전 결과 노출 방지
//
// 안전 로직 (절대 깨면 안 됨):
//  - runRouletteAnimation(canvas, selectedStudents, addPickedStudent) 시그니처
//  - isDisposed / rafId / cancelAnimationFrame cleanup 패턴
//  - isComplete 가드
//  - pickingMessage() Math.min clamp
//  - 첫 프레임 render 후 메시지 업데이트 순서
//  - window.AppState.isPaused / shouldStop 처리
//  - addPickedStudent 호출 흐름 유지 (reveal 진입 직후 1회)
//  - 마지막 reveal 후 bgMusicInterval 즉시 stop + null
//  - 다른 테마와 RAF 격리 (closure 내 isDisposed/rafId 가드)
//  - pause/resume 시 trajectory.startT 와 phaseStartT 를 paused duration 만큼 shift
//  - 선발 알고리즘 변경 금지 — selectedStudents 결과 그대로 사용

async function runRouletteAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // ── 디자인 토큰 (Bright Kitsch Arcade)
        const AR = {
            bgTop:    '#EAF8F2',
            bgMid:    '#CDEFE3',
            bgLo:     '#A6E0D2',
            cream:    '#FFF5E0',
            paper:    '#FBF1D8',
            paperEdge:'#E9D4A1',
            ink:      '#2A2A3C',
            inkSoft:  'rgba(42,42,60,.62)',
            inkFaint: 'rgba(42,42,60,.32)',
            coral:    '#FF8E72',
            coralLo:  '#E14B4B',
            mint:     '#5FD0BD',
            mintLo:   '#2E8C95',
            lemon:    '#FFCC4F',
            sun:      '#F5C849',
            sky:      '#9FCEE9',
            lavender: '#C9B5E8',
            peach:    '#FFB39B',
            rose:     '#FF9BAA',
            wood:     '#D8A36B',
            woodLo:   '#9B6B3A',
            twine:    '#A47A44',
        };

        // 12 segment 파스텔 컬러 — 인접 segment 가 항상 대비되도록 배치
        // (cream 이 들어가도 stroke 가 있어서 가독성 유지)
        const SEG_COLORS = [
            { c: '#FF8E72', d: '#C95E45' },                 // coral
            { c: '#FFF5E0', d: '#C99320', isLight: true },  // cream
            { c: '#5FD0BD', d: '#2E8C95' },                 // mint
            { c: '#FFCC4F', d: '#C99320' },                 // lemon
            { c: '#9FCEE9', d: '#3578A8' },                 // sky
            { c: '#C9B5E8', d: '#7B66A8' },                 // lavender
            { c: '#FF8E72', d: '#C95E45' },
            { c: '#FFF5E0', d: '#C99320', isLight: true },
            { c: '#5FD0BD', d: '#2E8C95' },
            { c: '#FFCC4F', d: '#C99320' },
            { c: '#9FCEE9', d: '#3578A8' },
            { c: '#C9B5E8', d: '#7B66A8' },
        ];

        // ── 휠 기하학 (SVG 단위, viewport 비례 스케일됨)
        const WHEEL_R = 248;
        const HUB_R = 62;
        const NUM_R = 196;
        // SEGMENTS — 학생 수와 무관하게 12 고정 (시안 일관성).
        // winnerIdx 는 매 라운드 무작위, currentPickIndex 가 실제 결과 인덱스.
        const SEGMENTS = 12;
        const SEG_DEG = 360 / SEGMENTS;

        // ── timing (ms)
        const T = {
            idle: 220,
            spin: 1800,
            decel: 3200,
            stop: 600,
            reveal: 1700,
            gap: 450,
            finishHold: 1100,
        };
        const SPIN_SPEED = 520; // deg/sec

        // ── 상태
        let currentPickIndex = 0;
        let phase = 'idle';
        let phaseStartT = performance.now();
        let angle = 0;
        let trajectory = null;
        let winnerIdx = 0;
        let isComplete = false;
        let isDisposed = false;
        let rafId = null;
        let pauseStartT = null;
        let lastT = performance.now();
        let lastAngle = 0;
        // 사운드 tick — 휠 angle 의 segment 통과를 감지해 click 사운드 재생.
        // angle 자체는 read-only 로만 사용 (회전 결과 계산 미영향).
        let lastSegIdx = 0;
        let lastTickT = 0;
        let prevAngleForTick = 0;
        let bgMusicStopped = false;
        // 룰렛 spin bed — 회전 중 침묵 구간을 채우는 hum + soft pulse.
        // transitionTo('spin') 진입 시 시작, transitionTo('stop') 진입 시 즉시 fade-out.
        // cleanup() 안에서 safety stop (shouldStop / 강제 종료 대응).
        let spinBedHandle = null;
        const usedSegments = new Set();

        // ── DOM 셋업
        const container = canvas.parentElement; // #animationContainer
        const stage = document.createElement('div');
        stage.className = 'roulette-stage';
        stage.setAttribute('aria-hidden', 'true');

        // ── 학급 라벨
        const first = selectedStudents[0] || {};
        const sameGrade = selectedStudents.every(s => s && s.grade === first.grade);
        const sameClass = selectedStudents.every(s => s && s.class === first.class);
        let classLabel = '';
        if (first.grade && first.class && sameGrade && sameClass) {
            classLabel = `${first.grade}학년 ${first.class}반`;
        } else if (first.grade && sameGrade) {
            classLabel = `${first.grade}학년`;
        }
        const total = selectedStudents.length;
        const barSegments = Math.max(1, Math.min(total, 12));

        // ── 배경 (mint 그라데이션 + dots + warm spot + bunting + starburst)
        const svgNS = 'http://www.w3.org/2000/svg';
        const backdrop = document.createElementNS(svgNS, 'svg');
        backdrop.setAttribute('class', 'roulette-backdrop-svg');
        backdrop.setAttribute('viewBox', '0 0 1280 800');
        backdrop.setAttribute('preserveAspectRatio', 'xMidYMid slice');

        // bunting 색 순환
        const buntColors = [AR.coral, AR.lemon, AR.mint, AR.sky, AR.lavender, AR.peach];

        backdrop.innerHTML = `
            <defs>
                <linearGradient id="ro-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="${AR.bgTop}"/>
                    <stop offset="45%" stop-color="${AR.bgMid}"/>
                    <stop offset="100%" stop-color="${AR.bgLo}"/>
                </linearGradient>
                <pattern id="ro-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                    <circle cx="16" cy="16" r="1.6" fill="rgba(46,140,149,0.22)"/>
                </pattern>
                <radialGradient id="ro-warm" cx="0.5" cy="0.4" r="0.6">
                    <stop offset="0%"  stop-color="rgba(255,233,168,.55)"/>
                    <stop offset="35%" stop-color="rgba(255,233,168,.18)"/>
                    <stop offset="100%" stop-color="rgba(255,233,168,0)"/>
                </radialGradient>
            </defs>
            <rect width="1280" height="800" fill="url(#ro-bg)"/>
            <rect width="1280" height="800" fill="url(#ro-dots)" opacity="0.55"/>

            <!-- starburst rays (subtle, 휠 뒤) -->
            <g opacity="0.28" transform="translate(640 432)">
                ${Array.from({ length: 24 }).map((_, i) => {
                    const a = (i * 15) * Math.PI / 180;
                    const x2 = 700 * Math.cos(a);
                    const y2 = 700 * Math.sin(a);
                    return `<path d="M 0 0 L ${(x2 * 0.45).toFixed(2)} ${(y2 * 0.45).toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} L ${(x2 * 0.45 + 4).toFixed(2)} ${(y2 * 0.45 + 4).toFixed(2)} Z" fill="#FFE9A8" opacity="${i % 2 ? 0.5 : 0.3}"/>`;
                }).join('')}
            </g>

            <!-- warm spotlight -->
            <ellipse cx="640" cy="400" rx="440" ry="320" fill="url(#ro-warm)"/>

            <!-- bunting (16 깃발, sway 없음 — 정적) -->
            <g>
                <path d="M 40 100 Q 320 136 640 124 Q 960 112 1240 96" stroke="#9B6B3A" stroke-width="1.6" fill="none" opacity="0.6"/>
                ${Array.from({ length: 16 }).map((_, i) => {
                    const c = buntColors[i % buntColors.length];
                    const x = 80 + i * 76;
                    const tt = (x - 40) / 1200;
                    const y = 100 + Math.sin(tt * Math.PI) * 28;
                    return `<g transform="translate(${x} ${y})">
                        <path d="M 0 0 L 22 0 L 11 36 Z" fill="${c}" stroke="rgba(155,107,58,.32)" stroke-width="0.8"/>
                        <path d="M 2 2 L 9 2 L 6 14 Z" fill="rgba(255,255,255,.32)"/>
                    </g>`;
                }).join('')}
            </g>

            <!-- 카운터 라인 -->
            <rect x="80" y="694" width="1120" height="6" rx="3" fill="#D8A36B" opacity="0.35"/>
            <rect x="80" y="696" width="1120" height="2" rx="1" fill="rgba(255,255,255,.55)"/>
        `;
        stage.appendChild(backdrop);

        // ── HUD — "P" 마크 없음, 한글 "룰렛" 칩만
        let hudBarHtml = '';
        for (let i = 0; i < barSegments; i++) hudBarHtml += '<span class="roulette-hud-bar-cell"></span>';
        const hud = document.createElement('div');
        hud.className = 'roulette-hud';
        hud.innerHTML = `
            <div class="roulette-hud-left">
                <span class="roulette-hud-chip" aria-hidden="true">룰렛</span>
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

        // ── 휠 SVG (segments + dividers + sun dots + 익명 번호 + sun disc 허브 + 포인터)
        // ※ 학생 이름은 휠에 절대 표시하지 않음 — 익명 번호 01..N 만 표시.

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

        // 24-petal scallop rim
        let scallopHtml = '';
        for (let i = 0; i < 24; i++) {
            const a = (i * 15) * Math.PI / 180;
            const cx = ((WHEEL_R + 14) * Math.cos(a - Math.PI / 2)).toFixed(2);
            const cy = ((WHEEL_R + 14) * Math.sin(a - Math.PI / 2)).toFixed(2);
            scallopHtml += `<circle cx="${cx}" cy="${cy}" r="13" fill="${AR.cream}" stroke="#E9D4A1" stroke-width="1"/>`;
        }

        // segments + dividers + sun dots + 번호 (정적 — winner highlight 는 별도 layer 로 처리)
        let segmentsHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const startA = i * SEG_DEG;
            const endA = (i + 1) * SEG_DEG;
            const col = SEG_COLORS[i % SEG_COLORS.length];
            segmentsHtml += `<path class="ro-seg" data-idx="${i}" d="${segPath(WHEEL_R - 6, HUB_R + 4, startA, endA)}" fill="${col.c}" stroke="#FFFAEC" stroke-width="2.2"/>`;
            if (col.isLight) {
                segmentsHtml += `<path d="${segPath(WHEEL_R - 6, HUB_R + 4, startA, endA)}" fill="none" stroke="rgba(155,107,58,.16)" stroke-width="1"/>`;
            }
        }
        // winner 강조 overlay (초기 비표시)
        const winnerTintHtml = `<path class="ro-winner-tint" d="" fill="${AR.lemon}" opacity="0"/>`;

        let dividersHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const a = (i * SEG_DEG - 90) * Math.PI / 180;
            const x1 = ((HUB_R + 4) * Math.cos(a)).toFixed(2);
            const y1 = ((HUB_R + 4) * Math.sin(a)).toFixed(2);
            const x2 = ((WHEEL_R - 6) * Math.cos(a)).toFixed(2);
            const y2 = ((WHEEL_R - 6) * Math.sin(a)).toFixed(2);
            dividersHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#FFFAEC" stroke-width="2.2"/>`;
        }

        let sunDotsHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const a = (i * SEG_DEG - 90) * Math.PI / 180;
            const x = ((WHEEL_R - 10) * Math.cos(a)).toFixed(2);
            const y = ((WHEEL_R - 10) * Math.sin(a)).toFixed(2);
            sunDotsHtml += `<circle cx="${x}" cy="${y}" r="3" fill="${AR.sun}" stroke="#9B6B3A" stroke-width="0.6"/>`;
        }

        // 익명 번호 01..N (학생 이름 없음)
        let numbersHtml = '';
        for (let i = 0; i < SEGMENTS; i++) {
            const centerA = (i + 0.5) * SEG_DEG;
            const a = (centerA - 90) * Math.PI / 180;
            const x = (NUM_R * Math.cos(a)).toFixed(2);
            const y = (NUM_R * Math.sin(a)).toFixed(2);
            numbersHtml += `<g transform="translate(${x} ${y}) rotate(${centerA.toFixed(2)})">
                <circle r="14" fill="#FFFAEC" stroke="#E9D4A1" stroke-width="1.2"/>
                <text class="ro-num" data-idx="${i}" text-anchor="middle" dy="0.36em"
                    font-family="Manrope, system-ui, sans-serif"
                    font-size="13" font-weight="800" fill="${AR.coralLo}"
                    style="letter-spacing: 0.4px">${String(i + 1).padStart(2, '0')}</text>
            </g>`;
        }

        // 허브 — sun disc, 문자 없음
        const hubHtml = `
            <circle r="${HUB_R + 2}" fill="#9B6B3A" opacity="0.18"/>
            <circle r="${HUB_R}" fill="url(#ro-hub-sun)" stroke="#C99320" stroke-width="1.4"/>
            <circle r="${HUB_R - 12}" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity="0.7"/>
            <circle r="${HUB_R - 12}" fill="none" stroke="#E9D4A1" stroke-width="1" opacity="0.6"/>
            ${Array.from({ length: 12 }).map((_, i) => {
                const a = (i * 30) * Math.PI / 180;
                const x1 = ((HUB_R - 6) * Math.cos(a)).toFixed(2);
                const y1 = ((HUB_R - 6) * Math.sin(a)).toFixed(2);
                const x2 = ((HUB_R - 22) * Math.cos(a)).toFixed(2);
                const y2 = ((HUB_R - 22) * Math.sin(a)).toFixed(2);
                return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#C99320" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>`;
            }).join('')}
            <circle r="6" fill="#FFFAEC" stroke="#9B6B3A" stroke-width="1.2"/>
            <circle r="2" fill="#9B6B3A"/>
            <ellipse cx="${(-HUB_R * 0.35).toFixed(2)}" cy="${(-HUB_R * 0.45).toFixed(2)}" rx="${(HUB_R * 0.32).toFixed(2)}" ry="${(HUB_R * 0.18).toFixed(2)}" fill="rgba(255,255,255,.7)"/>
        `;

        // 포인터 (coral arrow + yellow sun finial)
        const pointerHtml = `
            <g class="ro-pointer-group" transform="translate(0 ${-(WHEEL_R + 32)})">
                <circle cx="0" cy="-2" r="11" fill="#FFE9A8" stroke="#C99320" stroke-width="1.4"/>
                <circle cx="0" cy="-2" r="6" fill="#FFFAEC" stroke="#C99320" stroke-width="0.9"/>
                <circle cx="0" cy="-2" r="2.2" fill="#9B6B3A"/>
                ${[0, 60, 120, 180, 240, 300].map(deg => {
                    const a = (deg - 90) * Math.PI / 180;
                    const x1 = (11 * Math.cos(a)).toFixed(2);
                    const y1 = (-2 + 11 * Math.sin(a)).toFixed(2);
                    const x2 = (15 * Math.cos(a)).toFixed(2);
                    const y2 = (-2 + 15 * Math.sin(a)).toFixed(2);
                    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#C99320" stroke-width="1.4" stroke-linecap="round"/>`;
                }).join('')}
                <rect x="-4" y="10" width="8" height="14" fill="url(#ro-ptr)" rx="2" stroke="#C95E45" stroke-width="0.6"/>
                <path d="M -18 24 L 18 24 L 0 64 Z" fill="url(#ro-ptr)" stroke="#C95E45" stroke-width="1.2" stroke-linejoin="round"/>
                <path d="M -12 26 L -2 26 L -5 34 Z" fill="rgba(255,255,255,.55)"/>
                <circle cx="0" cy="63" r="2" fill="#C95E45"/>
            </g>
        `;

        // wood pedestal (휠 하단)
        const pedestalHtml = `
            <g class="ro-pedestal" transform="translate(0 ${WHEEL_R + 60})">
                <ellipse cx="0" cy="78" rx="220" ry="10" fill="rgba(60,40,20,.22)"/>
                <path d="M -50 0 L 50 0 L 40 36 L -40 36 Z" fill="url(#ro-wood)" stroke="#9B6B3A" stroke-width="1"/>
                <rect x="-44" y="6" width="88" height="3" rx="1.5" fill="rgba(255,255,255,.32)"/>
                <rect x="-150" y="38" width="300" height="34" rx="10" fill="url(#ro-wood)" stroke="#9B6B3A" stroke-width="1"/>
                <rect x="-144" y="42" width="288" height="4" rx="2" fill="rgba(255,255,255,.4)"/>
                ${[-120, -60, 0, 60, 120].map(x => `
                    <g><circle cx="${x}" cy="56" r="4" fill="#FFE9A8" stroke="#9B6B3A" stroke-width="0.8"/>
                    <circle cx="${x}" cy="56" r="1.4" fill="#9B6B3A"/></g>
                `).join('')}
                <path d="M -170 72 L 170 72 L 150 130 L -150 130 Z" fill="url(#ro-wood)" stroke="#9B6B3A" stroke-width="1"/>
                <rect x="-160" y="76" width="324" height="3" rx="1.5" fill="rgba(255,255,255,.32)"/>
                <rect x="-160" y="126" width="320" height="14" rx="5" fill="#9B6B3A"/>
                <rect x="-160" y="126" width="320" height="3" rx="1.5" fill="rgba(255,255,255,.18)"/>
            </g>
        `;

        const svgSize = (WHEEL_R + 36) * 2 + 100; // 넉넉히 잡아 포인터/허브 잘림 방지
        const wheelWrap = document.createElement('div');
        wheelWrap.className = 'roulette-wheel-wrap';
        wheelWrap.innerHTML = `
            <svg class="roulette-wheel-svg" viewBox="-${WHEEL_R + 50} -${WHEEL_R + 50} ${svgSize} ${svgSize + 180}" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <radialGradient id="ro-hub-sun" cx="0.4" cy="0.35" r="0.7">
                        <stop offset="0%"  stop-color="#FFFFFF"/>
                        <stop offset="55%" stop-color="#FFE9A8"/>
                        <stop offset="100%" stop-color="#F5C849"/>
                    </radialGradient>
                    <linearGradient id="ro-rim" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#F5C849"/>
                        <stop offset="100%" stop-color="#C99320"/>
                    </linearGradient>
                    <linearGradient id="ro-ptr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stop-color="#FFB39B"/>
                        <stop offset="55%" stop-color="#FF8E72"/>
                        <stop offset="100%" stop-color="#E14B4B"/>
                    </linearGradient>
                    <linearGradient id="ro-wood" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stop-color="#E0AC75"/>
                        <stop offset="55%" stop-color="#C18548"/>
                        <stop offset="100%" stop-color="#9B6B3A"/>
                    </linearGradient>
                </defs>

                <!-- floor shadow -->
                <ellipse cx="0" cy="${WHEEL_R + 22}" rx="${WHEEL_R * 0.92}" ry="14" fill="rgba(60,40,20,.22)"/>

                <!-- pedestal (휠 뒤) -->
                ${pedestalHtml}

                <!-- scallop rim -->
                ${scallopHtml}

                <!-- warm outer ring -->
                <circle r="${WHEEL_R + 8}" fill="url(#ro-rim)"/>
                <circle r="${WHEEL_R + 8}" fill="none" stroke="#9B6B3A" stroke-width="1.2" opacity="0.5"/>
                <path d="M 0 ${-(WHEEL_R + 8)} A ${WHEEL_R + 8} ${WHEEL_R + 8} 0 0 1 ${WHEEL_R + 8} 0" stroke="rgba(255,255,255,.55)" stroke-width="1.4" fill="none"/>

                <!-- inner cream disc -->
                <circle r="${WHEEL_R - 1}" fill="#FFFAEC"/>

                <!-- rotating group (segments + winner tint + dividers + sun dots + numbers + hub) -->
                <g class="ro-wheel-rotating" transform="rotate(0)">
                    ${segmentsHtml}
                    ${winnerTintHtml}
                    ${dividersHtml}
                    ${sunDotsHtml}
                    ${numbersHtml}
                    ${hubHtml}
                </g>

                <!-- 포인터 (고정, 회전 그룹 밖) -->
                ${pointerHtml}
            </svg>
        `;
        stage.appendChild(wheelWrap);

        // ── reveal — paper pennant + twine
        const revealWrap = document.createElement('div');
        revealWrap.className = 'roulette-reveal-wrap';
        revealWrap.setAttribute('aria-hidden', 'true');
        revealWrap.innerHTML = `
            <svg class="roulette-reveal-twine" viewBox="0 0 280 80" preserveAspectRatio="none">
                <path d="M 4 14 Q 90 50 270 60" stroke="${AR.twine}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-dasharray="3 2.4" opacity="0.9"/>
            </svg>
            <div class="roulette-reveal-card">
                <div class="roulette-reveal-grommet"></div>
                <div class="roulette-reveal-grommet-hole"></div>
                <div class="roulette-reveal-stripe"></div>
                <div class="roulette-reveal-body">
                    <div class="roulette-reveal-eyebrow">당첨 · ROUND <span class="roulette-reveal-round">01</span></div>
                    <div class="roulette-reveal-name"></div>
                    <div class="roulette-reveal-sub"></div>
                </div>
            </div>
        `;
        stage.appendChild(revealWrap);

        // ── 하단 rail
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

        // ── 선발 완료 배너
        const finishBanner = document.createElement('div');
        finishBanner.className = 'roulette-finish-banner';
        finishBanner.textContent = '선발 완료';
        stage.appendChild(finishBanner);

        // 마운트
        container.appendChild(stage);
        container.classList.add('roulette-active');

        // ── threeCanvas 가리기 (다른 테마 잔존 픽셀 방지)
        if (canvas && canvas.style) canvas.style.display = 'none';

        // ── DOM 참조
        const wheelRotatingGroup = wheelWrap.querySelector('.ro-wheel-rotating');
        const pointerGroup = wheelWrap.querySelector('.ro-pointer-group');
        const winnerTint = wheelWrap.querySelector('.ro-winner-tint');
        const numberNodes = Array.from(wheelWrap.querySelectorAll('.ro-num'));

        const hudNumEl = hud.querySelector('.roulette-hud-num');
        const hudBarCells = hud.querySelectorAll('.roulette-hud-bar-cell');

        const revealRoundEl = revealWrap.querySelector('.roulette-reveal-round');
        const revealNameEl = revealWrap.querySelector('.roulette-reveal-name');
        const revealSubEl = revealWrap.querySelector('.roulette-reveal-sub');
        const revealStripeEl = revealWrap.querySelector('.roulette-reveal-stripe');

        const railDot = railEl.querySelector('.roulette-rail-dot');
        const railStatusText = railEl.querySelector('.roulette-rail-status-text');
        const railChipsContainer = railEl.querySelector('.roulette-rail-chips');
        const railChipsEmpty = railEl.querySelector('.roulette-rail-chips-empty');

        const messageElement = document.querySelector('.animation-message');
        function updateMessage(message) {
            if (messageElement) messageElement.textContent = message;
        }
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

        function addChip(student, segIdx) {
            if (railChipsEmpty && railChipsEmpty.parentElement) {
                railChipsEmpty.remove();
            }
            const col = SEG_COLORS[segIdx % SEG_COLORS.length];
            const chip = document.createElement('span');
            chip.className = 'roulette-rail-chip';
            chip.innerHTML = `
                <span class="roulette-rail-chip-pip" style="background:${col.c}; border-color:${col.d};">${String(segIdx + 1).padStart(2, '0')}</span>
                <span class="roulette-rail-chip-name"></span>
            `;
            chip.querySelector('.roulette-rail-chip-name').textContent = student.name;
            railChipsContainer.appendChild(chip);
            const chips = railChipsContainer.querySelectorAll('.roulette-rail-chip');
            if (chips.length > 6) chips[0].remove();
        }

        function highlightWinner(idx) {
            if (winnerTint) {
                winnerTint.setAttribute('d', segPath(WHEEL_R - 6, HUB_R + 4, idx * SEG_DEG, (idx + 1) * SEG_DEG));
                winnerTint.setAttribute('opacity', '0.32');
            }
            numberNodes.forEach((n, i) => {
                if (i === idx) {
                    n.setAttribute('opacity', '1');
                } else {
                    n.setAttribute('opacity', '0.5');
                }
            });
        }
        function clearWinnerHighlight() {
            if (winnerTint) winnerTint.setAttribute('opacity', '0');
            numberNodes.forEach(n => n.setAttribute('opacity', '0.95'));
        }

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
                // 회전 시작 whoosh
                if (typeof soundManager !== 'undefined' && soundManager.playRouletteSpinStart) {
                    soundManager.playRouletteSpinStart();
                }
                // spin bed 시작 — gap → spin 빠른 전환 중복 누적 방지 가드
                if (typeof soundManager !== 'undefined' && soundManager.startRouletteSpinBed) {
                    if (spinBedHandle) {
                        soundManager.stopSound(spinBedHandle);
                        spinBedHandle = null;
                    }
                    spinBedHandle = soundManager.startRouletteSpinBed();
                }
            } else if (newPhase === 'decel') {
                const startA = angle;
                const endA = targetAngleForSegment(startA, winnerIdx);
                trajectory = {
                    kind: 'ease',
                    startA, endA,
                    startT: now,
                    duration: T.decel / 1000,
                };
                setRailPhase('decel');
            } else if (newPhase === 'stop') {
                trajectory = null;
                highlightWinner(winnerIdx);
                setRailPhase('stop');
                // spin bed 즉시 fade-out — reveal 전에 silent 되도록
                if (spinBedHandle) {
                    if (typeof soundManager !== 'undefined' && soundManager.stopSound) {
                        soundManager.stopSound(spinBedHandle);
                    }
                    spinBedHandle = null;
                }
                // 멈추는 순간 "탁"
                if (typeof soundManager !== 'undefined' && soundManager.playRouletteStop) {
                    soundManager.playRouletteStop();
                }
            } else if (newPhase === 'reveal') {
                const student = selectedStudents[currentPickIndex];
                const col = SEG_COLORS[winnerIdx % SEG_COLORS.length];
                revealRoundEl.textContent = String(Math.min(currentPickIndex + 1, total)).padStart(2, '0');
                revealNameEl.textContent = student.name;
                const role = (window.AppState && window.AppState.purpose) ? String(window.AppState.purpose).trim() : '';
                revealSubEl.textContent = role || '';
                revealStripeEl.style.background = col.c;

                revealWrap.classList.add('show');
                revealWrap.setAttribute('aria-hidden', 'false');
                wheelWrap.classList.add('dim');
                stage.classList.add('dim');

                if (addPickedStudent) addPickedStudent(student);
                addChip(student, winnerIdx);
                // 이름 reveal — 밝은 chord (룰렛 전용)
                if (typeof soundManager !== 'undefined' && soundManager.playRouletteReveal) {
                    soundManager.playRouletteReveal();
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
                isComplete = true;
                setRailPhase('finishing');
                finishBanner.classList.add('show');
                finishBanner.setAttribute('aria-hidden', 'false');
                updateMessage('선발 완료!');
            }
        }

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

        function updatePointer(dt) {
            if (!pointerGroup) return;
            const speedDeg = dt > 0 ? Math.abs((angle - lastAngle) / dt) : 0;
            lastAngle = angle;
            const segPhase = (((angle % SEG_DEG) + SEG_DEG) % SEG_DEG) / SEG_DEG;
            const energy = Math.min(speedDeg / 600, 1);
            const lean = segPhase < 0.18
                ? -(segPhase / 0.18) * 9
                : -((1 - segPhase) / 0.82) * 9;
            const tilt = lean * energy;
            pointerGroup.setAttribute('transform', `translate(0 ${-(WHEEL_R + 32)}) rotate(${tilt.toFixed(2)})`);
        }

        // ── 메인 RAF
        function animate(now) {
            if (isDisposed) return;

            // 일시 중지
            if (window.AppState && window.AppState.isPaused) {
                if (pauseStartT === null) pauseStartT = now;
                lastT = now;
                rafId = requestAnimationFrame(animate);
                return;
            }
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

            if (phase === 'idle') {
                angle += 8 * dt;
                if (elapsed > T.idle) transitionTo('spin', now);
            } else if (phase === 'spin') {
                applyTrajectoryAtTime(now);
                if (elapsed > T.spin) transitionTo('decel', now);
            } else if (phase === 'decel') {
                applyTrajectoryAtTime(now);
                if (elapsed > T.decel) {
                    if (trajectory) angle = trajectory.endA;
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
                if (elapsed > T.finishHold) {
                    cleanup();
                    resolve();
                    return;
                }
            }

            // ── 사운드 tick — segment 통과 시 click. spin/decel 에서만, 최소 18ms 간격.
            //    angle 은 read-only 로만 사용 (회전 결과 계산 미영향).
            if (phase === 'spin' || phase === 'decel') {
                const curSegIdx = Math.floor(angle / SEG_DEG);
                if (curSegIdx !== lastSegIdx && (now - lastTickT) >= 18) {
                    const vel = dt > 0 ? Math.abs((angle - prevAngleForTick) / dt) : 0;
                    const intensity = Math.min(1, vel / SPIN_SPEED);
                    if (typeof soundManager !== 'undefined' && soundManager.playRouletteTick) {
                        soundManager.playRouletteTick(intensity);
                    }
                    lastTickT = now;
                }
                lastSegIdx = curSegIdx;
            } else {
                // reveal/gap/finishing 동안에는 idx 만 동기화 (다음 spin 시작 시 갑작스런 몰아치기 방지)
                lastSegIdx = Math.floor(angle / SEG_DEG);
            }
            prevAngleForTick = angle;

            if (wheelRotatingGroup) {
                wheelRotatingGroup.setAttribute('transform', `rotate(${angle.toFixed(3)})`);
            }
            updatePointer(dt);
            if (!isComplete) updateHud();

            rafId = requestAnimationFrame(animate);
        }

        function onWindowResize() {
            // CSS 가 var() 기반으로 비례 스케일 — 별도 처리 불필요
        }
        window.addEventListener('resize', onWindowResize);

        function cleanup() {
            isDisposed = true;
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            // spin bed safety stop — shouldStop / 강제 종료 시 잔류 0
            if (spinBedHandle) {
                if (typeof soundManager !== 'undefined' && soundManager.stopSound) {
                    soundManager.stopSound(spinBedHandle);
                }
                spinBedHandle = null;
            }
            window.removeEventListener('resize', onWindowResize);

            container.classList.remove('roulette-active');
            if (stage && stage.parentElement) {
                stage.parentElement.removeChild(stage);
            }
            if (canvas && canvas.style) canvas.style.display = '';
        }

        // ── 시작
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
