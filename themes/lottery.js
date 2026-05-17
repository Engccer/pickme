// 로또 테마 — Bright Kitsch Arcade
//
// 디자인 방향: cream/coral/lemon/mint 의 밝은 파스텔 아케이드 부스.
// 둥근 acrylic 글로브 안에서 8 컬러 컬러볼이 섞이다가 winner 가
// 짧은 투명 슈트를 따라 펠트 트레이로 굴러 안착, 종이 태그가
// twine 으로 옆에 매달려 이름이 reveal 된다.
// SVG + HTML 오버레이 + RAF 단일 2D 물리 (Three.js 사용하지 않음).
//
// 안전 로직 (절대 깨면 안 됨):
//  - runLotteryAnimation(canvas, selectedStudents, addPickedStudent) 시그니처
//  - isDisposed / rafId / cancelAnimationFrame cleanup 패턴
//  - isComplete 가드 (cleanup 대기 중 카운터 메시지가 완료 표시 덮는 것 방지)
//  - pickingMessage() Math.min clamp — 3/2 카운터 버그 재발 방지
//  - 첫 프레임 render 후 메시지 업데이트 순서 (검은 화면에 글자만 뜨는 것 방지)
//  - window.AppState.isPaused / shouldStop 처리
//  - addPickedStudent 호출은 reveal 진입 직후 1회 (현재 launching→reveal 흐름과 동일 시멘틱)
//  - 마지막 reveal 후 bgMusicInterval 을 stop + null 설정 — app.js 후속 stop 충돌 방지
//  - resize 리스너 cleanup, 동적 lottery DOM cleanup
//  - 공은 완전한 구형처럼 보여야 하며 squash/stretch 금지 — DOM ball 의 transform 은
//    translate + rotate(z) 만 사용. winner emphasis 시점에 균등 scale 약간(1.0→1.06).

async function runLotteryAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // ── 디자인 토큰 (Bright Kitsch Arcade)
        const AR = {
            cream:    '#FFF6E2',
            paper:    '#FBF1D8',
            paperEdge:'#E9D4A1',
            ink:      '#2A2A3C',
            inkSoft:  'rgba(42,42,60,.62)',
            inkFaint: 'rgba(42,42,60,.32)',
            coral:    '#FF8E72',
            coralLo:  '#E14B4B',
            mint:     '#5FD0BD',
            sun:      '#F5C849',
            lemon:    '#FFCC4F',
            wood:     '#D8A36B',
            woodLo:   '#9B6B3A',
            twine:    '#A47A44',
        };

        // 8 컬러 컬러볼 — 단색 + radial gradient 로 매끈한 sphere 표현
        // (찌그러짐/반반 공/검은 공 금지. 표면 텍스처 일체 없음.)
        const BALL_PALETTE = [
            { c: '#FF8E72', l: '#FFD3C2', d: '#C95E45' }, // coral
            { c: '#FFCC4F', l: '#FFE9A8', d: '#C99320' }, // lemon
            { c: '#5FD0BD', l: '#B6EDE2', d: '#2E8C95' }, // mint
            { c: '#9FCEE9', l: '#C0DDF0', d: '#3578A8' }, // sky
            { c: '#C9B5E8', l: '#E5DAF4', d: '#7B66A8' }, // lavender
            { c: '#FFB39B', l: '#FFD9CC', d: '#C97A60' }, // peach
            { c: '#FF9BAA', l: '#FFCBD2', d: '#C95F70' }, // rose
            { c: '#A7DD7A', l: '#D7EDB8', d: '#5F9D3F' }, // pistachio
        ];

        // ── 글로브 / 공 기하학 (SVG 1280×800 좌표계 기준 — viewport 비례 스케일됨)
        const GLOBE_R = 150;          // 글로브 내부 반지름
        const BALL_R = 22;            // 공 반지름
        const TOTAL_BALLS = 12;
        const GLOBE_CX = 640;         // 글로브 중심 X
        const GLOBE_CY = 392;         // 글로브 중심 Y (상단 지붕 영역 확보)

        // 짧은 슈트 — globe spout 출구 → tray 안착점
        const CHUTE = {
            start: { x: 0,   y: 158 }, // globe 내부 좌표 (centered at GLOBE_CX, GLOBE_CY)
            c1:    { x: 14,  y: 192 },
            c2:    { x: -6,  y: 218 },
            end:   { x: 0,   y: 232 },
        };

        // 물리 파라미터 (2D radial chamber)
        const MIX_SPEED = 320;
        const IDLE_SPEED = 70;
        const DRIFT = 4.6;
        const CONVERGE = 1.7;
        const WALL_REST = 0.65;
        const BALL_REST = 0.86;
        const DAMP = 0.997;
        const MAX_V = 540;

        // ── timing (ms) — 첫 mix 만 길게, 이후 라운드는 짧게
        const T = {
            mixFirst: 2400,
            mix: 1300,
            eject: 800,
            settle: 380,
            reveal: 1600,
            gap: 480,
            finishHold: 1100,
        };

        // ── 상태
        let currentPickIndex = 0;
        let phase = 'mix';
        let phaseStartT = performance.now();
        let mixDur = T.mixFirst;
        let winnerIdx = -1;             // 현 라운드 winner ball index (balls[] 내부 색 index 와 무관)
        let isComplete = false;
        let isDisposed = false;
        let rafId = null;
        let pauseStartT = null;
        let lastT = performance.now();
        let bgMusicStopped = false;
        let completeTimerId = null;

        // ── threeCanvas 가리기 — SVG/HTML 만 사용
        if (canvas && canvas.style) canvas.style.display = 'none';

        // ── 컨테이너 셋업
        const container = canvas.parentElement; // #animationContainer
        const stage = document.createElement('div');
        stage.className = 'lottery-stage';
        stage.setAttribute('aria-hidden', 'true');

        // ── 학급 라벨 (HUD 에 사용)
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

        // ── 부스/배경 SVG (정적 — 한 번만 생성)
        // 모든 SVG 는 viewBox 0 0 1280 800, preserveAspectRatio="xMidYMid slice"
        // 으로 viewport 에 채워진다. 장치(globe/cat/chute/tray)도 같은 좌표계에서
        // 비례 스케일되어 viewport height 의 ~60% 를 점유한다.
        const bgSvgNS = 'http://www.w3.org/2000/svg';
        const boothSvg = document.createElementNS(bgSvgNS, 'svg');
        boothSvg.setAttribute('class', 'lottery-booth-svg');
        boothSvg.setAttribute('viewBox', '0 0 1280 800');
        boothSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

        boothSvg.innerHTML = `
            <defs>
                <radialGradient id="lo-stage" cx="0.5" cy="0.4" r="0.85">
                    <stop offset="0%"  stop-color="#FFFCEF"/>
                    <stop offset="62%" stop-color="#FBE9BD"/>
                    <stop offset="100%" stop-color="#E7C684"/>
                </radialGradient>
                <pattern id="lo-dots" x="0" y="0" width="34" height="34" patternUnits="userSpaceOnUse">
                    <circle cx="17" cy="17" r="1.8" fill="rgba(155,107,58,0.16)"/>
                </pattern>
                <linearGradient id="lo-wood" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="#E0AC75"/>
                    <stop offset="60%" stop-color="#C18548"/>
                    <stop offset="100%" stop-color="#9B6B3A"/>
                </linearGradient>
                <linearGradient id="lo-awn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="#FF8E72"/>
                    <stop offset="100%" stop-color="#E66E55"/>
                </linearGradient>
                <linearGradient id="lo-rim" x1="0.3" y1="0" x2="0.7" y2="1">
                    <stop offset="0%"  stop-color="#FFEAA0"/>
                    <stop offset="45%" stop-color="#F5C849"/>
                    <stop offset="100%" stop-color="#9B6B3A"/>
                </linearGradient>
                <radialGradient id="lo-glass" cx="0.35" cy="0.3" r="0.85">
                    <stop offset="0%"  stop-color="rgba(255,255,255,0.92)"/>
                    <stop offset="55%" stop-color="rgba(255,250,236,0.55)"/>
                    <stop offset="100%" stop-color="rgba(166,224,210,0.35)"/>
                </radialGradient>
                <radialGradient id="lo-glass-shade" cx="0.5" cy="0.88" r="0.55">
                    <stop offset="0%"  stop-color="rgba(46,140,149,0.25)"/>
                    <stop offset="100%" stop-color="rgba(46,140,149,0)"/>
                </radialGradient>
                <linearGradient id="lo-bow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="#FFB39B"/>
                    <stop offset="100%" stop-color="#E14B4B"/>
                </linearGradient>
                <radialGradient id="lo-trophy-ball" cx="0.35" cy="0.3" r="0.75">
                    <stop offset="0%"  stop-color="#FFD3C2"/>
                    <stop offset="48%" stop-color="#FF8E72"/>
                    <stop offset="100%" stop-color="#C95E45"/>
                </radialGradient>
            </defs>

            <!-- 무대 배경 -->
            <rect width="1280" height="800" fill="url(#lo-stage)"/>
            <rect width="1280" height="800" fill="url(#lo-dots)" opacity="0.55"/>
            <ellipse cx="640" cy="400" rx="420" ry="260" fill="#FFE9A8" opacity="0.6"/>

            <!-- 박공 지붕 (한글 "로또" 제거, "LOTTO" 영문만, awning scallop circles 제거, 술 제거) -->
            <g>
                <!-- finial star -->
                <g transform="translate(640 70)">
                    <line x1="0" y1="0" x2="0" y2="-22" stroke="#9B6B3A" stroke-width="2.5"/>
                    <path d="M 0 -32 L 2 -23 L 12 -23 L 4 -18 L 7 -9 L 0 -14 L -7 -9 L -4 -18 L -12 -23 L -2 -23 Z"
                        fill="#F5C849" stroke="#9B6B3A" stroke-width="1.4" stroke-linejoin="round"/>
                    <circle cx="0" cy="0" r="3" fill="#F5C849" stroke="#9B6B3A" stroke-width="0.8"/>
                </g>

                <!-- 박공 삼각형 (coral) -->
                <path d="M 640 72 L 280 160 L 1000 160 Z"
                    fill="url(#lo-awn)" stroke="#C95E45" stroke-width="3" stroke-linejoin="round"/>
                <!-- 박공 하이라이트 라인 -->
                <path d="M 640 88 L 320 158" stroke="rgba(255,255,255,.36)" stroke-width="2.2" fill="none"/>
                <path d="M 640 88 L 960 158" stroke="rgba(255,255,255,.36)" stroke-width="2.2" fill="none"/>

                <!-- LOTTO 영문 간판 (cream 패널 + Manrope 800w) -->
                <g transform="translate(640 132)">
                    <rect x="-122" y="-22" width="244" height="44" rx="10"
                        fill="#FFFAEC" stroke="#C95E45" stroke-width="2.2"/>
                    <text x="0" y="2" text-anchor="middle" dy="0.34em"
                        font-family="Manrope, system-ui, sans-serif"
                        font-size="28" font-weight="800"
                        fill="#C95E45" letter-spacing="6">LOTTO</text>
                </g>

                <!-- 지붕 beam (wood) -->
                <rect x="250" y="160" width="740" height="14" fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="1"/>
                <rect x="254" y="162" width="732" height="3" rx="1" fill="rgba(255,255,255,.42)"/>

                <!-- 측면 기둥 -->
                <rect x="242" y="156" width="12" height="76" fill="#C18548" rx="3"/>
                <rect x="986" y="156" width="12" height="76" fill="#C18548" rx="3"/>
                <circle cx="248" cy="158" r="6" fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="0.6"/>
                <circle cx="992" cy="158" r="6" fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="0.6"/>
            </g>

            <!-- 둥근 글로브 챔버 (중앙 ${GLOBE_CX}, ${GLOBE_CY}) -->
            <g transform="translate(${GLOBE_CX} ${GLOBE_CY})">
                <!-- 그림자 -->
                <ellipse cx="0" cy="178" rx="156" ry="13" fill="rgba(60,40,20,.32)"/>

                <!-- 3 wood 발 -->
                ${[[-92, 150], [0, 158], [92, 150]].map(([cx, cy]) => `
                    <g transform="translate(${cx} ${cy})">
                        <ellipse cx="0" cy="7" rx="20" ry="11" fill="rgba(60,40,20,.32)"/>
                        <ellipse cx="0" cy="0" rx="22" ry="13" fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="1"/>
                        <ellipse cx="0" cy="-3" rx="18" ry="4" fill="rgba(255,255,255,.22)"/>
                        <circle cx="0" cy="1" r="3" fill="#FFE9A8" stroke="#9B6B3A" stroke-width="0.6"/>
                    </g>
                `).join('')}

                <!-- 외부 brass ring -->
                <circle r="158" fill="url(#lo-rim)"/>
                <circle r="158" fill="none" stroke="#9B6B3A" stroke-width="1.2"/>
                <path d="M -158 0 A 158 158 0 0 1 0 -158" stroke="rgba(255,255,255,.7)" stroke-width="3" fill="none"/>
                <path d="M 158 0 A 158 158 0 0 1 0 158" stroke="rgba(0,0,0,.25)" stroke-width="2" fill="none"/>
                <circle r="150" fill="none" stroke="#9B6B3A" stroke-width="1" opacity="0.4"/>

                <!-- 유리 acrylic body -->
                <circle r="${GLOBE_R}" fill="url(#lo-glass)" stroke="rgba(155,107,58,.45)" stroke-width="1.4"/>
                <circle r="${GLOBE_R}" fill="url(#lo-glass-shade)"/>

                <!-- specular highlight (1개만, 시안 3개 → 1개로 축소) -->
                <ellipse cx="-60" cy="-72" rx="48" ry="32" fill="rgba(255,255,255,.55)"/>
                <ellipse cx="-74" cy="-92" rx="14" ry="8" fill="rgba(255,255,255,.92)"/>

                <!-- 적도 marquee 전구 (정적 — keyframes 없이 단순 배치) -->
                ${Array.from({ length: 9 }).map((_, i) => {
                    const deg = 205 + i * (130 / 8);
                    const a = deg * Math.PI / 180;
                    const x = 158 * Math.cos(a);
                    const y = 158 * Math.sin(a);
                    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">
                        <circle r="6.5" fill="#FFE9A8" stroke="#C99320" stroke-width="0.6"/>
                        <circle r="3.6" fill="#FFFFFF"/>
                    </g>`;
                }).join('')}

                <!-- ※ 글로브 하단 LOTTO 뱃지는 제거 (간판에 LOTTO 가 있으므로 중복 금지) -->

                <!-- 코랄 리본 ornament (상단) -->
                <g transform="translate(0 -160)">
                    <path d="M -4 4 L -16 18 L -10 20 Z" fill="#E14B4B"/>
                    <path d="M 4 4 L 16 18 L 10 20 Z" fill="#E14B4B"/>
                    <path d="M -3 -1 Q -22 -12 -26 -2 Q -22 8 -3 -1 Z" fill="url(#lo-bow)" stroke="#C95E45" stroke-width="1"/>
                    <path d="M 3 -1 Q 22 -12 26 -2 Q 22 8 3 -1 Z" fill="url(#lo-bow)" stroke="#C95E45" stroke-width="1"/>
                    <path d="M -20 -5 Q -12 -5 -7 -2" stroke="rgba(255,255,255,.55)" stroke-width="1.2" fill="none"/>
                    <path d="M 20 -5 Q 12 -5 7 -2" stroke="rgba(255,255,255,.55)" stroke-width="1.2" fill="none"/>
                    <ellipse cx="0" cy="-1" rx="7" ry="9" fill="#FF8E72" stroke="#C95E45" stroke-width="1"/>
                </g>

                <!-- 내부 drain hole (공이 통과해 내려가는 입구) -->
                <ellipse cx="0" cy="${GLOBE_R - 14}" rx="28" ry="8" fill="rgba(40,28,16,.55)"/>
                <ellipse cx="0" cy="${GLOBE_R - 15}" rx="26" ry="6" fill="#0d0805"/>
                <ellipse cx="0" cy="${GLOBE_R - 18}" rx="24" ry="1.6" fill="rgba(255,255,255,.4)"/>

                <!-- spout (wood 깔때기) -->
                <g>
                    <path d="M -22 144 L 22 144 L 16 174 L -16 174 Z"
                        fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="1"/>
                    <path d="M -16 146 L 16 146 L 12 172 L -12 172 Z" fill="#1c130a"/>
                    <line x1="-22" y1="144" x2="22" y2="144" stroke="rgba(255,255,255,.4)" stroke-width="1.2"/>
                    <circle cx="-20" cy="156" r="2.2" fill="#FFE9A8" stroke="#9B6B3A" stroke-width="0.5"/>
                    <circle cx="20" cy="156" r="2.2" fill="#FFE9A8" stroke="#9B6B3A" stroke-width="0.5"/>
                    <rect x="-18" y="172" width="36" height="3" rx="1.5" fill="#9B6B3A"/>
                </g>
            </g>

            <!-- 짧은 투명 슈트 (글로브 spout → tray) -->
            <g transform="translate(${GLOBE_CX} ${GLOBE_CY})">
                <rect x="-24" y="180" width="6" height="56" rx="2" fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="0.6"/>
                <rect x="18" y="180" width="6" height="56" rx="2" fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="0.6"/>
                <rect x="-18" y="180" width="36" height="56" rx="4"
                    fill="rgba(255,255,255,0.42)" stroke="rgba(155,107,58,.42)" stroke-width="1"/>
                <rect x="-14" y="184" width="3" height="48" rx="1.5" fill="rgba(255,255,255,.6)"/>
                <rect x="12" y="186" width="1.4" height="44" rx="0.7" fill="rgba(255,255,255,.3)"/>
            </g>

            <!-- 펠트 트레이 -->
            <g transform="translate(540 ${GLOBE_CY + 196})">
                <ellipse cx="100" cy="78" rx="120" ry="9" fill="rgba(60,40,20,.28)"/>
                <rect x="0" y="20" width="200" height="60" rx="14" fill="url(#lo-wood)" stroke="#9B6B3A" stroke-width="1.2"/>
                <rect x="6" y="24" width="188" height="6" rx="3" fill="rgba(255,255,255,.32)"/>
                <rect x="14" y="32" width="172" height="40" rx="10" fill="#FF8E72" stroke="#C95E45" stroke-width="1"/>
                <rect x="22" y="40" width="156" height="24" rx="6" fill="none"
                    stroke="rgba(255,255,255,.5)" stroke-width="0.8" stroke-dasharray="3 3"/>
                <path d="M -6 38 Q -14 52 -6 66" stroke="#9B6B3A" stroke-width="3" fill="none" stroke-linecap="round"/>
                <path d="M 206 38 Q 214 52 206 66" stroke="#9B6B3A" stroke-width="3" fill="none" stroke-linecap="round"/>
                <!-- ※ PICK ME 라벨 제거 (영문 라벨 남발 회피) -->
            </g>

            <!-- 카운터/바닥 라인 -->
            <rect x="100" y="694" width="1080" height="6" rx="3" fill="#D8A36B" opacity="0.4"/>
            <rect x="100" y="696" width="1080" height="2" rx="1" fill="rgba(255,255,255,.55)"/>
        `;

        // ── 고양이 마스코트 이미지 (assets/lotto-cat-mascot.png)
        // 로또 기계 왼쪽에 배치되는 정적 장식. transparent PNG.
        // 이미지 로드 실패 시 표시하지 않고 흐름은 유지된다.
        // alt="" + aria-hidden 으로 decorative 처리.
        const catImg = document.createElement('img');
        catImg.className = 'lottery-cat-img';
        catImg.src = 'assets/lotto-cat-mascot.png';
        catImg.alt = '';
        catImg.setAttribute('aria-hidden', 'true');
        catImg.draggable = false;
        catImg.style.opacity = '0';
        catImg.addEventListener('load', () => {
            if (isDisposed) return;
            catImg.style.opacity = '';
        });
        catImg.addEventListener('error', () => {
            if (catImg.parentElement) catImg.parentElement.removeChild(catImg);
        });

        stage.appendChild(boothSvg);
        stage.appendChild(catImg);

        // ── 공 컨테이너 (글로브 중심 좌표에 0×0 앵커)
        // 각 공의 transform 은 globe-center 기준 상대 좌표. SVG viewBox 와 같은
        // 1280×800 좌표계의 절대 위치로 변환하기 위해 wrapper 가 viewport 비례 스케일.
        const ballWrap = document.createElement('div');
        ballWrap.className = 'lottery-ball-wrap';
        // ballWrap 의 transform 은 CSS 가 viewport 기준으로 계산 — JS 는 공의 transform 만 갱신
        stage.appendChild(ballWrap);

        // ── 공 DOM
        const balls = [];
        const ballEls = [];
        for (let i = 0; i < TOTAL_BALLS; i++) {
            const palette = BALL_PALETTE[i % BALL_PALETTE.length];
            const number = String(i + 1).padStart(2, '0');

            // 초기 위치 — 원 안 무작위 (sqrt 분포로 균일)
            const maxR = GLOBE_R - BALL_R - 4;
            const r = Math.sqrt(Math.random()) * maxR;
            const ang = Math.random() * Math.PI * 2;
            balls.push({
                x: r * Math.cos(ang),
                y: r * Math.sin(ang),
                vx: 0, vy: 0,
                targetAngle: Math.random() * Math.PI * 2,
                isWinner: false,
                launchT: 0,
                launchFrom: null,
                palette,
                number,
            });

            const el = document.createElement('div');
            el.className = 'lottery-ball';
            // sphere = radial gradient + 내부 disc + specular highlight
            el.innerHTML = `
                <div class="lottery-ball-sphere" style="background:radial-gradient(circle at 32% 26%, ${palette.l} 0%, ${palette.c} 48%, ${palette.d} 100%); box-shadow: inset 0 -8px 14px rgba(0,0,0,.28), inset 6px 8px 10px rgba(255,255,255,.55), 0 6px 12px rgba(60,40,20,.22);"></div>
                <div class="lottery-ball-disc" style="color:${palette.d};">${number}</div>
                <div class="lottery-ball-glint"></div>
            `;
            ballEls.push(el);
            ballWrap.appendChild(el);
        }

        // separation pass — 초기 겹침 해소
        for (let iter = 0; iter < 14; iter++) {
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    const a = balls[i], b = balls[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const d = Math.hypot(dx, dy);
                    const min = 2 * BALL_R + 4;
                    if (d < min && d > 0.001) {
                        const nx = dx / d, ny = dy / d;
                        const push = (min - d) * 0.5;
                        a.x -= nx * push; a.y -= ny * push;
                        b.x += nx * push; b.y += ny * push;
                    }
                }
            }
        }

        // ── 상단 HUD
        let hudBarHtml = '';
        for (let i = 0; i < barSegments; i++) hudBarHtml += '<span class="lottery-hud-bar-cell"></span>';
        const hud = document.createElement('div');
        hud.className = 'lottery-hud';
        // ※ "P" 마크 캡슐 제거 — 시안의 한글 "로또" 칩으로 교체
        hud.innerHTML = `
            <div class="lottery-hud-left">
                <span class="lottery-hud-chip" aria-hidden="true">로또</span>
                ${classLabel ? `<span class="lottery-hud-class">${classLabel}</span>` : ''}
                <span class="lottery-hud-sub">로또 선발</span>
            </div>
            <div class="lottery-hud-right">
                <span class="lottery-hud-label">ROUND</span>
                <span class="lottery-hud-counter">
                    <strong class="lottery-hud-num">01</strong>
                    <span class="lottery-hud-divider"> / </span>
                    <span class="lottery-hud-total">${String(total).padStart(2, '0')}</span>
                </span>
                <div class="lottery-hud-bar" aria-hidden="true">${hudBarHtml}</div>
            </div>
        `;
        stage.appendChild(hud);

        // ── reveal 패널 (종이 태그 + twine)
        const revealWrap = document.createElement('div');
        revealWrap.className = 'lottery-reveal-wrap';
        revealWrap.setAttribute('aria-hidden', 'true');
        revealWrap.innerHTML = `
            <svg class="lottery-reveal-twine" viewBox="0 0 240 80" preserveAspectRatio="none">
                <path d="M 2 10 Q 80 50 220 60" stroke="${AR.twine}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-dasharray="3 2.4" opacity="0.9"/>
            </svg>
            <div class="lottery-reveal-card">
                <div class="lottery-reveal-grommet"></div>
                <div class="lottery-reveal-grommet-hole"></div>
                <div class="lottery-reveal-stripe"></div>
                <div class="lottery-reveal-body">
                    <div class="lottery-reveal-eyebrow">당첨 · ROUND <span class="lottery-reveal-round">01</span></div>
                    <div class="lottery-reveal-name"></div>
                    <div class="lottery-reveal-sub"></div>
                </div>
            </div>
        `;
        stage.appendChild(revealWrap);

        // ── 하단 rail
        const rail = document.createElement('div');
        rail.className = 'lottery-rail';
        rail.innerHTML = `
            <div class="lottery-rail-status">
                <span class="lottery-rail-dot" data-phase="mix"></span>
                <span class="lottery-rail-status-text">추첨 중</span>
            </div>
            <div class="lottery-rail-chips">
                <span class="lottery-rail-chips-label">앞선 선발</span>
                <span class="lottery-rail-chips-empty">아직 없음</span>
            </div>
            <div class="lottery-rail-hint">
                <span class="lottery-rail-hint-text">자동 진행</span>
            </div>
        `;
        stage.appendChild(rail);

        // ── 선발 완료 배너
        const finishBanner = document.createElement('div');
        finishBanner.className = 'lottery-finish-banner';
        finishBanner.textContent = '선발 완료';
        stage.appendChild(finishBanner);

        // 마운트
        container.appendChild(stage);
        container.classList.add('lottery-active');

        // ── DOM 참조
        const hudNumEl = hud.querySelector('.lottery-hud-num');
        const hudBarCells = hud.querySelectorAll('.lottery-hud-bar-cell');
        const revealRoundEl = revealWrap.querySelector('.lottery-reveal-round');
        const revealNameEl = revealWrap.querySelector('.lottery-reveal-name');
        const revealSubEl = revealWrap.querySelector('.lottery-reveal-sub');
        const revealStripeEl = revealWrap.querySelector('.lottery-reveal-stripe');
        const railDot = rail.querySelector('.lottery-rail-dot');
        const railStatusText = rail.querySelector('.lottery-rail-status-text');
        const railChipsContainer = rail.querySelector('.lottery-rail-chips');
        const railChipsEmpty = rail.querySelector('.lottery-rail-chips-empty');

        // 기존 .animation-message — 시각적으로 숨김 (CSS) 이지만
        // pickingMessage() 호출은 그대로 유지 (Math.min clamp 흐름 보존)
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
            mix: '추첨 중',
            eject: '배출 중',
            settle: '안착',
            reveal: '발표',
            gap: '대기 중',
            finishing: '선발 완료',
        };
        function setRailPhase(phaseName) {
            railDot.setAttribute('data-phase', phaseName);
            railStatusText.textContent = PHASE_TEXT[phaseName] || '';
        }

        function addChip(student, palette) {
            if (railChipsEmpty && railChipsEmpty.parentElement) {
                railChipsEmpty.remove();
            }
            const chip = document.createElement('span');
            chip.className = 'lottery-rail-chip';
            const bg = `radial-gradient(circle at 35% 30%, ${palette.l} 0%, ${palette.c} 60%, ${palette.d} 100%)`;
            chip.innerHTML = `<span class="lottery-rail-chip-ball" style="background:${bg};"></span><span class="lottery-rail-chip-name"></span>`;
            chip.querySelector('.lottery-rail-chip-name').textContent = student.name;
            railChipsContainer.appendChild(chip);
            const chips = railChipsContainer.querySelectorAll('.lottery-rail-chip');
            if (chips.length > 6) chips[0].remove();
        }

        // ── 좌표 변환 — 글로브 중심 (640, 392) 의 viewport 픽셀 좌표를 구해
        // ballWrap 의 transform 으로 사용. 매 frame 호출 (resize/스케일 대응).
        function updateBallWrapTransform() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            // preserveAspectRatio="xMidYMid slice" 와 동일한 매핑 계산
            const scale = Math.max(vw / 1280, vh / 800);
            const offsetX = (vw - 1280 * scale) / 2;
            const offsetY = (vh - 800 * scale) / 2;
            const cx = offsetX + GLOBE_CX * scale;
            const cy = offsetY + GLOBE_CY * scale;
            ballWrap.style.left = `${cx}px`;
            ballWrap.style.top = `${cy}px`;
            ballWrap.style.setProperty('--lo-scale', scale);
        }

        // ── 트레이볼 안착 좌표 (viewport 픽셀) — reveal tag 앵커
        function getTrayBallScreenPos() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const scale = Math.max(vw / 1280, vh / 800);
            const offsetX = (vw - 1280 * scale) / 2;
            const offsetY = (vh - 800 * scale) / 2;
            const wx = GLOBE_CX + CHUTE.end.x;
            const wy = GLOBE_CY + CHUTE.end.y;
            return { x: offsetX + wx * scale, y: offsetY + wy * scale, scale };
        }

        function positionRevealPanel() {
            const tray = getTrayBallScreenPos();
            // 데스크탑: 트레이 우측 상단, 모바일: 트레이 위 중앙
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                revealWrap.style.left = '50%';
                revealWrap.style.top = `${tray.y - 220}px`;
                revealWrap.style.transform = 'translateX(-50%)';
            } else {
                revealWrap.style.left = `${tray.x + 140 * tray.scale}px`;
                revealWrap.style.top = `${tray.y - 80 * tray.scale}px`;
                revealWrap.style.transform = 'none';
            }
        }

        // ── 물리
        function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
        function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

        function cubicBezier(p0, p1, p2, p3, t) {
            const u = 1 - t;
            return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
        }
        function chutePos(t) {
            return {
                x: cubicBezier(CHUTE.start.x, CHUTE.c1.x, CHUTE.c2.x, CHUTE.end.x, t),
                y: cubicBezier(CHUTE.start.y, CHUTE.c1.y, CHUTE.c2.y, CHUTE.end.y, t),
            };
        }

        function stepPhysics(dt) {
            const innerR = GLOBE_R - BALL_R;
            const targetSpeed = phase === 'mix' ? MIX_SPEED : IDLE_SPEED;
            const driftRate = phase === 'mix' ? DRIFT : DRIFT * 0.32;

            for (let i = 0; i < balls.length; i++) {
                const b = balls[i];
                if (b.isWinner) continue;

                b.targetAngle += ((Math.random() + Math.random() - 1)) * driftRate * dt;
                const shimmer = 0.7 + 0.5 * (Math.sin(performance.now() / 700 + i * 1.7) + 1) / 2;
                const sp = targetSpeed * shimmer;
                const tvx = Math.cos(b.targetAngle) * sp;
                const tvy = Math.sin(b.targetAngle) * sp;
                b.vx += (tvx - b.vx) * CONVERGE * dt;
                b.vy += (tvy - b.vy) * CONVERGE * dt;
                b.vx *= DAMP; b.vy *= DAMP;
                const speed = Math.hypot(b.vx, b.vy);
                if (speed > MAX_V) { const k = MAX_V / speed; b.vx *= k; b.vy *= k; }
                b.x += b.vx * dt; b.y += b.vy * dt;

                // 원형 wall bounce
                const d = Math.hypot(b.x, b.y);
                if (d > innerR) {
                    const nx = b.x / d, ny = b.y / d;
                    b.x = nx * innerR; b.y = ny * innerR;
                    const vn = b.vx * nx + b.vy * ny;
                    if (vn > 0) {
                        b.vx -= (1 + WALL_REST) * vn * nx;
                        b.vy -= (1 + WALL_REST) * vn * ny;
                    }
                    b.targetAngle = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * Math.PI * 0.6;
                }
            }

            // 공-공 충돌
            for (let iter = 0; iter < 2; iter++) {
                for (let i = 0; i < balls.length; i++) {
                    const a = balls[i];
                    if (a.isWinner) continue;
                    for (let j = i + 1; j < balls.length; j++) {
                        const b = balls[j];
                        if (b.isWinner) continue;
                        const dx = b.x - a.x, dy = b.y - a.y;
                        const d2 = dx * dx + dy * dy;
                        const min = 2 * BALL_R;
                        if (d2 < min * min && d2 > 0.0001) {
                            const dist = Math.sqrt(d2);
                            const nx = dx / dist, ny = dy / dist;
                            const overlap = min - dist;
                            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
                            b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
                            const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
                            const vn = dvx * nx + dvy * ny;
                            if (vn < 0) {
                                const J = vn * BALL_REST;
                                a.vx += J * nx; a.vy += J * ny;
                                b.vx -= J * nx; b.vy -= J * ny;
                            }
                        }
                    }
                }
            }
        }

        function applyBallTransforms() {
            // 일반 공
            for (let i = 0; i < balls.length; i++) {
                if (balls[i].isWinner) continue;
                const b = balls[i];
                const el = ballEls[i];
                if (!el) continue;
                // rotation 은 속도 기반으로 약간 부여 (yaw 만)
                const yaw = (b.x * 1.6 + b.y * 1.6) % 360;
                el.style.transform = `translate(-50%, -50%) translate(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px) rotate(${yaw.toFixed(1)}deg)`;
                el.style.zIndex = '';
            }
        }

        function pickWinner() {
            const candidates = balls.map((b, i) => ({ b, i })).filter(x => !x.b.isWinner);
            if (candidates.length === 0) return -1;
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            pick.b.isWinner = true;
            pick.b.launchT = 0;
            pick.b.launchFrom = { x: pick.b.x, y: pick.b.y };
            return pick.i;
        }

        // winner ball 의 chute 위치 적용
        function stepWinnerLaunch(now, durMs) {
            const b = balls[winnerIdx];
            const el = ballEls[winnerIdx];
            if (!b || !el) return false;

            const elapsed = (now - phaseStartT) / 1000;
            const dur = durMs / 1000;
            const k = Math.min(1, elapsed / dur);

            if (phase === 'eject') {
                const tt = easeInOutQuad(k);
                // launch start (글로브 내부) → CHUTE 시작점은 spout 출구
                // 부드러운 연결을 위해 첫 30%는 launchFrom → CHUTE.start, 나머지는 CHUTE 곡선
                let px, py;
                if (tt < 0.30) {
                    const k2 = tt / 0.30;
                    px = b.launchFrom.x + (CHUTE.start.x - b.launchFrom.x) * k2;
                    py = b.launchFrom.y + (CHUTE.start.y - b.launchFrom.y) * k2;
                } else {
                    const k2 = (tt - 0.30) / 0.70;
                    const cp = chutePos(k2);
                    px = cp.x; py = cp.y;
                }
                // rotation 0 → 720° (즈ㅈ → 똑바로 안착, chat3 피드백 반영)
                const rot = tt * 720;
                const scale = 1 + 0.05 * Math.sin(k * Math.PI);
                el.style.transform = `translate(-50%, -50%) translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
                el.style.zIndex = '50';
                return k >= 1;
            } else if (phase === 'settle') {
                const cp = chutePos(1);
                const bounce = Math.sin(k * Math.PI) * 5 * (1 - k * 0.5);
                const py = cp.y - bounce;
                const scale = 1 + 0.06 * (1 - k);
                el.style.transform = `translate(-50%, -50%) translate(${cp.x.toFixed(2)}px, ${py.toFixed(2)}px) rotate(720deg) scale(${scale.toFixed(3)})`;
                el.style.zIndex = '50';
                return k >= 1;
            } else if (phase === 'reveal') {
                const cp = chutePos(1);
                const breathe = 1.04 + 0.02 * Math.sin(elapsed * 3.5);
                el.style.transform = `translate(-50%, -50%) translate(${cp.x.toFixed(2)}px, ${cp.y.toFixed(2)}px) rotate(720deg) scale(${breathe.toFixed(3)})`;
                el.style.zIndex = '50';
            }
            return false;
        }

        // ── 메인 RAF 루프
        function animate(now) {
            if (isDisposed) return;

            // 일시 중지
            if (window.AppState && window.AppState.isPaused) {
                if (pauseStartT === null) pauseStartT = now;
                lastT = now;
                rafId = requestAnimationFrame(animate);
                return;
            }
            // resume — paused duration 만큼 timestamp shift
            if (pauseStartT !== null) {
                const pausedDur = now - pauseStartT;
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

            stepPhysics(dt);
            applyBallTransforms();

            // phase machine
            if (phase === 'mix') {
                if (now - phaseStartT > mixDur) {
                    winnerIdx = pickWinner();
                    if (winnerIdx >= 0) {
                        phase = 'eject';
                        phaseStartT = now;
                        setRailPhase('eject');
                        updateMessage(pickingMessage());
                    }
                }
            } else if (phase === 'eject') {
                const done = stepWinnerLaunch(now, T.eject);
                if (done) {
                    phase = 'settle';
                    phaseStartT = now;
                    setRailPhase('settle');
                }
            } else if (phase === 'settle') {
                const done = stepWinnerLaunch(now, T.settle);
                if (done) {
                    // reveal 진입 — 종이 태그 + addPickedStudent 호출
                    const student = selectedStudents[currentPickIndex];
                    const palette = balls[winnerIdx].palette;

                    revealRoundEl.textContent = String(Math.min(currentPickIndex + 1, total)).padStart(2, '0');
                    revealNameEl.textContent = student.name;
                    const role = (window.AppState && window.AppState.purpose) ? String(window.AppState.purpose).trim() : '';
                    revealSubEl.textContent = role || '';
                    revealStripeEl.style.background = palette.c;

                    positionRevealPanel();
                    revealWrap.classList.add('show');
                    revealWrap.setAttribute('aria-hidden', 'false');

                    if (addPickedStudent) addPickedStudent(student);
                    addChip(student, palette);
                    if (typeof soundManager !== 'undefined' && soundManager.playLotteryPick) {
                        soundManager.playLotteryPick();
                    }

                    setRailPhase('reveal');
                    updateMessage(`${student.name} 학생을 선발했습니다!`);

                    currentPickIndex++;
                    phase = 'reveal';
                    phaseStartT = now;
                }
            } else if (phase === 'reveal') {
                stepWinnerLaunch(now, T.reveal); // breathe 효과만
                if (now - phaseStartT > T.reveal) {
                    if (currentPickIndex >= selectedStudents.length) {
                        // 마지막 — finishing 진입
                        if (!bgMusicStopped && window.AppState && window.AppState.bgMusicInterval) {
                            if (typeof soundManager !== 'undefined' && soundManager.stopSound) {
                                soundManager.stopSound(window.AppState.bgMusicInterval);
                            }
                            window.AppState.bgMusicInterval = null;
                            bgMusicStopped = true;
                        }
                        revealWrap.classList.remove('show');
                        revealWrap.setAttribute('aria-hidden', 'true');
                        isComplete = true;
                        phase = 'finishing';
                        phaseStartT = now;
                        updateMessage('선발 완료!');
                        setRailPhase('finishing');
                        finishBanner.classList.add('show');
                        finishBanner.setAttribute('aria-hidden', 'false');

                        completeTimerId = setTimeout(() => {
                            completeTimerId = null;
                            if (isDisposed) return;
                            cleanup();
                            resolve();
                        }, T.finishHold);
                    } else {
                        // 다음 라운드 — winner 공 제거 후 mix 재개
                        revealWrap.classList.remove('show');
                        revealWrap.setAttribute('aria-hidden', 'true');

                        const winnerEl = ballEls[winnerIdx];
                        if (winnerEl && winnerEl.parentElement) {
                            winnerEl.parentElement.removeChild(winnerEl);
                        }
                        balls.splice(winnerIdx, 1);
                        ballEls.splice(winnerIdx, 1);
                        winnerIdx = -1;

                        phase = 'gap';
                        phaseStartT = now;
                        setRailPhase('gap');
                        updateMessage(pickingMessage());
                    }
                }
            } else if (phase === 'gap') {
                if (now - phaseStartT > T.gap) {
                    phase = 'mix';
                    phaseStartT = now;
                    mixDur = T.mix;
                    setRailPhase('mix');
                }
            } else if (phase === 'finishing') {
                // 타이머가 cleanup/resolve 처리
            }

            if (!isComplete) updateHud();

            rafId = requestAnimationFrame(animate);
        }

        // ── 리사이즈
        function onWindowResize() {
            updateBallWrapTransform();
            positionRevealPanel();
        }
        window.addEventListener('resize', onWindowResize);

        // ── 정리
        function cleanup() {
            isDisposed = true;
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            if (completeTimerId !== null) {
                clearTimeout(completeTimerId);
                completeTimerId = null;
            }
            window.removeEventListener('resize', onWindowResize);

            container.classList.remove('lottery-active');
            if (stage && stage.parentElement) {
                stage.parentElement.removeChild(stage);
            }
            // threeCanvas 복원
            if (canvas && canvas.style) canvas.style.display = '';
        }

        // ── 시작 — 첫 프레임 render 후 메시지/HUD 업데이트
        updateBallWrapTransform();
        positionRevealPanel();
        applyBallTransforms();

        rafId = requestAnimationFrame(() => {
            if (isDisposed) return;
            updateMessage('공을 섞는 중...');
            updateHud();
            setRailPhase('mix');
            phaseStartT = performance.now();
            lastT = performance.now();
            animate(performance.now());
        });
    });
}
