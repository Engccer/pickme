// 로또 테마 — Broadcast Studio v2
//
// 디자인 방향: 깊은 navy 무대 + 브래스 트림의 유리 튜브, 6컬러 단색
// 컬러볼 14개가 통 안을 부드럽게 유영하다가 한 개씩 좌상단 외부로
// 떠올라 박물관 라벨형 reveal 패널과 짝지어진다.
//
// 안전 로직 (절대 깨면 안 됨):
//  - runLotteryAnimation(canvas, selectedStudents, addPickedStudent) 시그니처
//  - isDisposed / rafId / cancelAnimationFrame cleanup 패턴
//  - isComplete 가드 (cleanup 대기 중 카운터 메시지가 완료 표시 덮는 것 방지)
//  - pickingMessage() Math.min clamp — 3/2 카운터 버그 재발 방지
//  - 첫 프레임 render 후 메시지 업데이트 순서 (검은 화면에 글자만 뜨는 것 방지)
//  - window.AppState.isPaused / shouldStop 처리
//  - addPickedStudent 호출은 종전 흐름 유지 (학생 공이 자리 잡은 직후 1회)
//  - 마지막 reveal 후 bgMusicInterval 을 stop + null 설정 — app.js 후속 stop 충돌 방지
//  - resize 리스너 cleanup, 동적 lottery DOM cleanup
//  - 공은 완전한 구형 유지 — scale 은 setScalar 만 사용, squash/stretch 금지

async function runLotteryAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // ── 디자인 토큰 ──────────────────────────────────────
        const BRASS_HI = 0xE8CA8A;
        const BRASS_MID = 0xC9A668;
        const BRASS_LO = 0x7A5E33;

        // Crimson · Amber · Cobalt · Emerald · Plum · Dijon — 단색 6종
        const BALL_PALETTE = [
            { core: 0xD03B4F, hex: '#D03B4F' },
            { core: 0xE89A2D, hex: '#E89A2D' },
            { core: 0x3A6FD8, hex: '#3A6FD8' },
            { core: 0x2D9970, hex: '#2D9970' },
            { core: 0x8358BD, hex: '#8358BD' },
            { core: 0xD9C26B, hex: '#D9C26B' },
        ];

        const TOTAL_BALLS = 14;
        const TUBE_R = 1.4;
        const TUBE_H = 4.2;
        const BALL_R = 0.18;

        // ── Three.js 셋업 ──────────────────────────────────
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x03050D);
        scene.fog = new THREE.Fog(0x03050D, 20, 36);

        const camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // ── 조명 — 신중하게, 네온 금지, 브래스톤 키 라이트 중심 ──
        // Ambient 는 낮추고 Hemisphere 가 위·아래 색 편향을 담당.
        // 플라스틱 clearcoat 의 dome highlight 가 직접광에서 잘 보이도록 키를 약간 올림.
        const ambient = new THREE.AmbientLight(0xffffff, 0.18);
        scene.add(ambient);

        // 위는 차가운 빛, 아래는 따뜻한 반사 — 단색 컬러볼이 자연스럽게 떠 보임
        const hemiLight = new THREE.HemisphereLight(0xb8c5dd, 0x3a2e1f, 0.28);
        hemiLight.position.set(0, 1, 0);
        scene.add(hemiLight);

        const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.15);
        keyLight.position.set(1.5, 8, 6);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 30;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xa0c0ff, 0.22);
        fillLight.position.set(-6, 2, 4);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffffff, 0.38);
        rimLight.position.set(2, 4, -6);
        scene.add(rimLight);

        // 바닥 라이트풀 효과를 위한 약한 따뜻한 포인트
        const warmFloor = new THREE.PointLight(0xfff0d0, 0.4, 8, 2.0);
        warmFloor.position.set(0, -TUBE_H / 2 - 0.4, 1.8);
        scene.add(warmFloor);

        // ── 튜브 (브래스 캡 + 유리 바디 + 브래스 베이스) ──
        const tubeGroup = new THREE.Group();

        // 유리 바디 — MeshStandardMaterial, transparent + 낮은 opacity
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xa8b8d8,
            transparent: true,
            opacity: 0.18,
            roughness: 0.08,
            metalness: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const glass = new THREE.Mesh(
            new THREE.CylinderGeometry(TUBE_R, TUBE_R, TUBE_H, 64, 1, true),
            glassMat
        );
        tubeGroup.add(glass);

        // 내부 안쪽 면 살짝 더 어둡게 — 깊이감
        const innerShadowMat = new THREE.MeshBasicMaterial({
            color: 0x000814,
            transparent: true,
            opacity: 0.12,
            side: THREE.BackSide,
            depthWrite: false,
        });
        const innerShadow = new THREE.Mesh(
            new THREE.CylinderGeometry(TUBE_R - 0.005, TUBE_R - 0.005, TUBE_H - 0.02, 64, 1, true),
            innerShadowMat
        );
        tubeGroup.add(innerShadow);

        // 브래스 머티리얼
        const brassMidMat = new THREE.MeshStandardMaterial({
            color: BRASS_MID, metalness: 0.88, roughness: 0.36,
        });
        const brassHiMat = new THREE.MeshStandardMaterial({
            color: BRASS_HI, metalness: 0.9, roughness: 0.3,
        });

        // 상단 브래스 림 (토러스)
        const topRing = new THREE.Mesh(
            new THREE.TorusGeometry(TUBE_R, 0.08, 16, 64),
            brassHiMat
        );
        topRing.rotation.x = Math.PI / 2;
        topRing.position.y = TUBE_H / 2;
        tubeGroup.add(topRing);

        // 상단 어두운 구멍 (입구 깊이감)
        const topHoleDisc = new THREE.Mesh(
            new THREE.CircleGeometry(TUBE_R - 0.08, 32),
            new THREE.MeshBasicMaterial({ color: 0x03050D })
        );
        topHoleDisc.rotation.x = -Math.PI / 2;
        topHoleDisc.position.y = TUBE_H / 2 + 0.005;
        tubeGroup.add(topHoleDisc);

        // 하단 브래스 베이스 (페디스털)
        const baseHeight = 0.5;
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(TUBE_R + 0.22, TUBE_R + 0.38, baseHeight, 64),
            brassMidMat
        );
        base.position.y = -TUBE_H / 2 - baseHeight / 2;
        base.receiveShadow = true;
        base.castShadow = true;
        tubeGroup.add(base);

        // 베이스 상단 hairline 링
        const baseHairline = new THREE.Mesh(
            new THREE.TorusGeometry(TUBE_R + 0.22, 0.012, 8, 64),
            brassHiMat
        );
        baseHairline.rotation.x = Math.PI / 2;
        baseHairline.position.y = -TUBE_H / 2 - 0.005;
        tubeGroup.add(baseHairline);

        // 중앙 브래스 plaque
        const plaque = new THREE.Mesh(
            new THREE.CircleGeometry(0.13, 32),
            brassHiMat
        );
        plaque.rotation.x = -Math.PI / 2;
        plaque.position.y = -TUBE_H / 2 + 0.002;
        tubeGroup.add(plaque);

        scene.add(tubeGroup);

        // 그림자 받는 바닥 (눈에 띄지 않게)
        const floorMat = new THREE.ShadowMaterial({ opacity: 0.4 });
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 12),
            floorMat
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -TUBE_H / 2 - baseHeight - 0.001;
        floor.receiveShadow = true;
        scene.add(floor);

        // ── 공들 — 단색, 완전 구형 (squash/stretch 절대 금지) ──
        // 표면 텍스처·번호·이름·반반 색·CanvasTexture 일체 사용하지 않는다.
        // 매끈한 플라스틱 로또볼: MeshPhysicalMaterial + clearcoat 로
        // 베이스 컬러 위 lacquer 층의 dome highlight 표현. emissive 는
        // baseline 0 (자체 발광 금지) — winner launch 시점에만 약하게 사용.
        const balls = [];
        const ballGeom = new THREE.SphereGeometry(BALL_R, 48, 32);

        for (let i = 0; i < TOTAL_BALLS; i++) {
            const palette = BALL_PALETTE[i % BALL_PALETTE.length];
            const mat = new THREE.MeshPhysicalMaterial({
                color: palette.core,
                roughness: 0.28,
                metalness: 0.0,
                clearcoat: 0.8,
                clearcoatRoughness: 0.12,
                reflectivity: 0.5,
            });
            const ball = new THREE.Mesh(ballGeom, mat);
            ball.castShadow = true;
            ball.userData = {
                index: i,
                palette,
                vx: 0, vy: 0, vz: 0,
                targetAngleH: Math.random() * Math.PI * 2,
                targetAngleV: (Math.random() - 0.5) * 0.6,
                isWinner: false,
                launchT: 0,
                launchFrom: null,
            };

            // 통 내부에 분산 배치
            const r = Math.random() * (TUBE_R - 0.3);
            const theta = Math.random() * Math.PI * 2;
            ball.position.set(
                Math.cos(theta) * r,
                (Math.random() - 0.5) * (TUBE_H - 0.6),
                Math.sin(theta) * r
            );

            tubeGroup.add(ball);
            balls.push(ball);
        }

        // separation pass — 초기 위치가 서로 겹치지 않도록 (chat1.md 명시)
        for (let iter = 0; iter < 10; iter++) {
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    const a = balls[i].position;
                    const b = balls[j].position;
                    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
                    const d = Math.hypot(dx, dy, dz);
                    const min = 2 * BALL_R + 0.02;
                    if (d < min && d > 0.001) {
                        const nx = dx / d, ny = dy / d, nz = dz / d;
                        const push = (min - d) * 0.5;
                        a.x -= nx * push; a.y -= ny * push; a.z -= nz * push;
                        b.x += nx * push; b.y += ny * push; b.z += nz * push;
                    }
                }
            }
        }

        // ── 상태 ────────────────────────────────────────────
        let currentPickIndex = 0;
        let phase = 'mixing';
        // chat1.md 의 최종 권장 시퀀스 — 첫 mix 2.8s, 이후는 1.4s 로 단축
        const MIX_DURATION_FIRST = 2800;
        const MIX_DURATION_NEXT = 1400;
        let currentMixDur = MIX_DURATION_FIRST;
        let mixStartT = performance.now();
        let phaseStartT = performance.now();
        let currentWinner = null;
        let isComplete = false;        // 카운터 메시지가 '선발 완료'를 덮어쓰는 것 방지
        let isDisposed = false;        // RAF 잔존으로 다른 테마 canvas 오염 방지
        let rafId = null;
        let lastT = performance.now();
        let bgMusicStopped = false;
        let completeTimerId = null;

        // 어항 부유 물리 — chat1.md "어항/무중력 부유 모델"
        // (이전 v2 가 중력+임펄스로 천장에 붙는 버그가 있었음)
        const MIX_SPEED = 2.4;
        const IDLE_SPEED = 1.0;
        const SETTLE_SPEED = 0.7;
        const DRIFT_RATE = 4.0;
        const CONVERGE = 2.5;
        const DAMPING = 0.998;
        const WALL_REST = 0.5;
        const BALL_REST = 0.85;
        const MAX_SPEED = 5.0;

        // ── 오버레이 DOM ───────────────────────────────────
        const container = canvas.parentElement;  // #animationContainer
        const stage = document.createElement('div');
        stage.className = 'lottery-stage';
        stage.setAttribute('aria-hidden', 'true');

        // 분위기 (vignette + floor pool + dust motes)
        const atmosphere = document.createElement('div');
        atmosphere.className = 'lottery-atmosphere';
        let atmosphereHtml = '<div class="lottery-vignette"></div><div class="lottery-floor-pool"></div>';
        for (let i = 0; i < 16; i++) {
            const x = (i * 41) % 100;
            const y = 30 + ((i * 23) % 60);
            const dur = 8 + (i % 5) * 2;
            const sz = 1.5 + (i % 3);
            const mx = (i % 3 - 1) * 14;
            atmosphereHtml += `<span class="lottery-mote" style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;animation-duration:${dur}s;animation-delay:${(i * 0.4).toFixed(1)}s;--mx:${mx}px;"></span>`;
        }
        atmosphere.innerHTML = atmosphereHtml;
        stage.appendChild(atmosphere);

        // HUD 상단
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

        const hud = document.createElement('div');
        hud.className = 'lottery-hud';
        let hudBarHtml = '';
        for (let i = 0; i < barSegments; i++) {
            hudBarHtml += '<span class="lottery-hud-bar-cell"></span>';
        }
        hud.innerHTML = `
            <div class="lottery-hud-left">
                <span class="lottery-hud-mark" aria-hidden="true">P</span>
                ${classLabel ? `<span class="lottery-hud-class">${classLabel}</span>` : ''}
                <span class="lottery-hud-sub">학생 추첨</span>
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

        // reveal 패널 (초기 hidden — 공이 선택된 뒤에만 show)
        const revealPanel = document.createElement('div');
        revealPanel.className = 'lottery-reveal-panel';
        revealPanel.setAttribute('aria-hidden', 'true');
        revealPanel.innerHTML = `
            <div class="lottery-reveal-shelf"></div>
            <div class="lottery-reveal-card">
                <div class="lottery-reveal-stripe"></div>
                <div class="lottery-reveal-body">
                    <div class="lottery-reveal-eyebrow">선발 · ROUND <span class="lottery-reveal-round">01</span></div>
                    <div class="lottery-reveal-name"></div>
                    <div class="lottery-reveal-sub"></div>
                </div>
            </div>
        `;
        stage.appendChild(revealPanel);

        // 하단 rail
        const rail = document.createElement('div');
        rail.className = 'lottery-rail';
        rail.innerHTML = `
            <div class="lottery-rail-status">
                <span class="lottery-rail-dot" data-phase="mixing"></span>
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

        // 선발 완료 배너
        const finishBanner = document.createElement('div');
        finishBanner.className = 'lottery-finish-banner';
        finishBanner.textContent = '선발 완료';
        stage.appendChild(finishBanner);

        container.appendChild(stage);
        container.classList.add('lottery-active');

        // ── DOM 참조 ────────────────────────────────────────
        const hudNumEl = hud.querySelector('.lottery-hud-num');
        const hudBarCells = hud.querySelectorAll('.lottery-hud-bar-cell');
        const revealRoundEl = revealPanel.querySelector('.lottery-reveal-round');
        const revealNameEl = revealPanel.querySelector('.lottery-reveal-name');
        const revealSubEl = revealPanel.querySelector('.lottery-reveal-sub');
        const revealStripeEl = revealPanel.querySelector('.lottery-reveal-stripe');
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
            // bar 가 12 이하면 1:1 매핑, 초과면 비율로 채움
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
            mixing: '추첨 중',
            launching: '확인 중',
            showing: '발표',
            gap: '대기 중',
            finishing: '선발 완료',
        };

        function setRailPhase(phaseName, hex) {
            railDot.setAttribute('data-phase', phaseName);
            if (hex) {
                railDot.style.setProperty('--phase-color', hex);
            } else {
                railDot.style.removeProperty('--phase-color');
            }
            railStatusText.textContent = PHASE_TEXT[phaseName] || '';
        }

        function rgbStr(hex, dl) {
            const r = (hex >> 16) & 0xff;
            const g = (hex >> 8) & 0xff;
            const b = hex & 0xff;
            const cl = (v) => Math.max(0, Math.min(255, v + dl));
            return `rgb(${cl(r)}, ${cl(g)}, ${cl(b)})`;
        }

        function addChip(student, palette) {
            if (railChipsEmpty && railChipsEmpty.parentElement) {
                railChipsEmpty.remove();
            }
            const chip = document.createElement('span');
            chip.className = 'lottery-rail-chip';
            const bg = `radial-gradient(circle at 35% 30%, ${rgbStr(palette.core, 90)} 0%, ${rgbStr(palette.core, 0)} 60%, ${rgbStr(palette.core, -60)} 100%)`;
            chip.innerHTML = `<span class="lottery-rail-chip-ball" style="background:${bg};"></span><span class="lottery-rail-chip-name"></span>`;
            chip.querySelector('.lottery-rail-chip-name').textContent = student.name;
            railChipsContainer.appendChild(chip);
            const chips = railChipsContainer.querySelectorAll('.lottery-rail-chip');
            if (chips.length > 6) chips[0].remove();
        }

        // ── 카메라 / 좌표 헬퍼 ─────────────────────────────
        function applyCameraSize() {
            const isMobile = window.innerWidth <= 768;
            camera.aspect = window.innerWidth / window.innerHeight;
            if (isMobile) {
                camera.position.set(0, 0.6, 11);
                camera.fov = 52;
            } else {
                camera.position.set(0, 0.5, 9);
                camera.fov = 45;
            }
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();
        }

        const _projVec = new THREE.Vector3();
        function worldToScreen(x, y, z) {
            _projVec.set(x, y, z);
            _projVec.project(camera);
            return {
                x: (_projVec.x * 0.5 + 0.5) * window.innerWidth,
                y: (-_projVec.y * 0.5 + 0.5) * window.innerHeight,
            };
        }

        // 당첨 공이 안착할 위치 — 튜브 좌상단 외부 (월드 좌표)
        function getWinnerHome() {
            const isMobile = window.innerWidth <= 768;
            return {
                x: isMobile ? -1.6 : -2.4,
                y: TUBE_H / 2 + 0.4,
                z: 0.6,
            };
        }

        function positionRevealPanel() {
            const home = getWinnerHome();
            const screen = worldToScreen(home.x, home.y, home.z);
            const isMobile = window.innerWidth <= 768;
            const offsetX = isMobile ? 60 : 110;
            const panelHeightApprox = isMobile ? 130 : 158;
            revealPanel.style.left = `${screen.x + offsetX}px`;
            revealPanel.style.top = `${screen.y - panelHeightApprox / 2}px`;
        }

        // ── 물리 ────────────────────────────────────────────
        function stepPhysics(dt) {
            const speed = (phase === 'mixing') ? MIX_SPEED
                : (phase === 'gap') ? IDLE_SPEED
                : SETTLE_SPEED;

            for (let i = 0; i < balls.length; i++) {
                const ball = balls[i];
                const ud = ball.userData;
                if (ud.isWinner) continue;

                // 목표 각도 천천히 드리프트 (Gaussian-ish noise)
                ud.targetAngleH += ((Math.random() + Math.random() - 1)) * DRIFT_RATE * dt;
                ud.targetAngleV += ((Math.random() + Math.random() - 1)) * DRIFT_RATE * 0.5 * dt;
                if (ud.targetAngleV > 1.0) ud.targetAngleV = 1.0;
                if (ud.targetAngleV < -1.0) ud.targetAngleV = -1.0;

                const cosV = Math.cos(ud.targetAngleV);
                const shimmer = 0.75 + 0.4 * (Math.sin(performance.now() / 700 + i * 1.7) + 1) / 2;
                const sp = speed * shimmer;
                const tvx = Math.cos(ud.targetAngleH) * cosV * sp;
                const tvz = Math.sin(ud.targetAngleH) * cosV * sp;
                const tvy = Math.sin(ud.targetAngleV) * sp;

                ud.vx += (tvx - ud.vx) * CONVERGE * dt;
                ud.vy += (tvy - ud.vy) * CONVERGE * dt;
                ud.vz += (tvz - ud.vz) * CONVERGE * dt;

                ud.vx *= DAMPING;
                ud.vy *= DAMPING;
                ud.vz *= DAMPING;

                const sNow = Math.hypot(ud.vx, ud.vy, ud.vz);
                if (sNow > MAX_SPEED) {
                    const k = MAX_SPEED / sNow;
                    ud.vx *= k; ud.vy *= k; ud.vz *= k;
                }

                ball.position.x += ud.vx * dt;
                ball.position.y += ud.vy * dt;
                ball.position.z += ud.vz * dt;

                // 원통 벽 충돌
                const rxz = Math.hypot(ball.position.x, ball.position.z);
                const wallR = TUBE_R - BALL_R - 0.02;
                if (rxz > wallR && rxz > 0.0001) {
                    const nx = ball.position.x / rxz;
                    const nz = ball.position.z / rxz;
                    ball.position.x = nx * wallR;
                    ball.position.z = nz * wallR;
                    const vdotn = ud.vx * nx + ud.vz * nz;
                    if (vdotn > 0) {
                        ud.vx -= 2 * vdotn * nx * WALL_REST;
                        ud.vz -= 2 * vdotn * nz * WALL_REST;
                    }
                    // 안쪽으로 향하는 새 target — 벽 긁힘 방지
                    ud.targetAngleH = Math.atan2(-nz, -nx) + (Math.random() - 0.5) * Math.PI * 0.5;
                }

                // 상/하 충돌
                const yMin = -TUBE_H / 2 + BALL_R + 0.03;
                const yMax = TUBE_H / 2 - BALL_R - 0.03;
                if (ball.position.y < yMin) {
                    ball.position.y = yMin;
                    if (ud.vy < 0) ud.vy = -ud.vy * WALL_REST;
                    ud.targetAngleV = Math.random() * 0.6 + 0.1;
                }
                if (ball.position.y > yMax) {
                    ball.position.y = yMax;
                    if (ud.vy > 0) ud.vy = -ud.vy * WALL_REST;
                    ud.targetAngleV = -(Math.random() * 0.6 + 0.1);
                }

                // 굴러가는 느낌의 회전 — 비례 회전이라 구는 그대로 구
                ball.rotation.x += ud.vz * dt * 1.8;
                ball.rotation.z -= ud.vx * dt * 1.8;
                ball.rotation.y += ud.vy * dt * 0.6;
            }

            // 공-공 충돌 (2 iter)
            for (let iter = 0; iter < 2; iter++) {
                for (let i = 0; i < balls.length; i++) {
                    const a = balls[i];
                    if (a.userData.isWinner) continue;
                    for (let j = i + 1; j < balls.length; j++) {
                        const b = balls[j];
                        if (b.userData.isWinner) continue;
                        const dx = b.position.x - a.position.x;
                        const dy = b.position.y - a.position.y;
                        const dz = b.position.z - a.position.z;
                        const d2 = dx * dx + dy * dy + dz * dz;
                        const min = 2 * BALL_R;
                        if (d2 < min * min && d2 > 0.0001) {
                            const dist = Math.sqrt(d2);
                            const nx = dx / dist, ny = dy / dist, nz = dz / dist;
                            const overlap = min - dist;
                            const half = overlap * 0.5;
                            a.position.x -= nx * half; a.position.y -= ny * half; a.position.z -= nz * half;
                            b.position.x += nx * half; b.position.y += ny * half; b.position.z += nz * half;
                            const dvx = b.userData.vx - a.userData.vx;
                            const dvy = b.userData.vy - a.userData.vy;
                            const dvz = b.userData.vz - a.userData.vz;
                            const vn = dvx * nx + dvy * ny + dvz * nz;
                            if (vn < 0) {
                                const J = vn * BALL_REST;
                                a.userData.vx += J * nx; a.userData.vy += J * ny; a.userData.vz += J * nz;
                                b.userData.vx -= J * nx; b.userData.vy -= J * ny; b.userData.vz -= J * nz;
                            }
                        }
                    }
                }
            }
        }

        // 당첨 공 선정 — 후보 중 무작위 1개, 시작 위치 캡처
        function pickWinner() {
            const candidates = balls.filter(b => !b.userData.isWinner);
            if (candidates.length === 0) return null;
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            winner.userData.isWinner = true;
            winner.userData.launchT = 0;
            winner.userData.launchFrom = {
                x: winner.position.x,
                y: winner.position.y,
                z: winner.position.z,
            };
            return winner;
        }

        // 당첨 공을 home 좌표로 ease-out 이동, 강조는 setScalar 만 사용
        function stepWinnerLaunch(dt) {
            if (!currentWinner) return false;
            const ud = currentWinner.userData;
            ud.launchT += dt;
            const LAUNCH_DUR = 0.95;
            const t = Math.min(ud.launchT / LAUNCH_DUR, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            const home = getWinnerHome();
            currentWinner.position.x = ud.launchFrom.x + (home.x - ud.launchFrom.x) * eased;
            currentWinner.position.y = ud.launchFrom.y + (home.y - ud.launchFrom.y) * eased;
            currentWinner.position.z = ud.launchFrom.z + (home.z - ud.launchFrom.z) * eased;
            // 균등 스케일 1.0 → 1.5 — squash/stretch 금지, setScalar 만
            currentWinner.scale.setScalar(1.0 + 0.5 * eased);
            currentWinner.rotation.y += dt * 1.2;
            // winner 강조용 emissive — material 은 ball 마다 독립 인스턴스라
            // 다른 공으로 누출되지 않음. 첫 frame 에 색 한 번 설정 후
            // intensity 는 0 → 0.18 로만 램프 (과한 자체 발광 방지).
            if (ud.launchT - dt <= 0) {
                currentWinner.material.emissive.setHex(ud.palette.core);
            }
            currentWinner.material.emissiveIntensity = 0.18 * eased;
            return t >= 1;
        }

        // ── 메인 루프 ───────────────────────────────────────
        function animate(now) {
            // RAF 잔존으로 다른 테마 canvas 오염 방지
            if (isDisposed) return;

            // 일시 중지 — 물리/페이즈 정지, RAF 만 유지 (기존 동작 보존)
            if (window.AppState && window.AppState.isPaused) {
                lastT = now;
                rafId = requestAnimationFrame(animate);
                return;
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

            if (phase === 'mixing') {
                if (now - mixStartT > currentMixDur) {
                    currentWinner = pickWinner();
                    if (currentWinner) {
                        phase = 'launching';
                        phaseStartT = now;
                        setRailPhase('launching', currentWinner.userData.palette.hex);
                        updateMessage(pickingMessage());
                    }
                }
            } else if (phase === 'launching') {
                positionRevealPanel();
                const done = stepWinnerLaunch(dt);
                if (done) {
                    const student = selectedStudents[currentPickIndex];
                    const palette = currentWinner.userData.palette;

                    // reveal 패널 텍스트 채우고 show — 이름은 이 시점에 처음 노출
                    revealRoundEl.textContent = String(Math.min(currentPickIndex + 1, total)).padStart(2, '0');
                    revealNameEl.textContent = student.name;
                    // 부제: AppState.purpose (역할) 가 있으면 사용, 없으면 비움
                    const role = (window.AppState && window.AppState.purpose) ? String(window.AppState.purpose).trim() : '';
                    revealSubEl.textContent = role || '';
                    revealStripeEl.style.background = palette.hex;
                    revealStripeEl.style.boxShadow = `0 0 22px ${palette.hex}aa`;

                    positionRevealPanel();
                    revealPanel.classList.add('show');
                    revealPanel.setAttribute('aria-hidden', 'false');

                    // 기존 흐름: addPickedStudent → playLotteryPick
                    if (addPickedStudent) addPickedStudent(student);
                    addChip(student, palette);
                    if (typeof soundManager !== 'undefined' && soundManager.playLotteryPick) {
                        soundManager.playLotteryPick();
                    }

                    // 튜브 살짝 후퇴 — 당첨 공에 집중
                    glassMat.opacity = 0.1;
                    innerShadowMat.opacity = 0.07;

                    setRailPhase('showing', palette.hex);
                    updateMessage(`${student.name} 학생을 선발했습니다!`);

                    currentPickIndex++;
                    phase = 'showing';
                    phaseStartT = now;
                }
            } else if (phase === 'showing') {
                const SHOW_DUR = 1700;
                if (now - phaseStartT > SHOW_DUR) {
                    if (currentPickIndex >= selectedStudents.length) {
                        // 마지막 reveal 종료 직후 배경음 정리 (app.js 후속 stop 충돌 방지)
                        if (!bgMusicStopped && window.AppState && window.AppState.bgMusicInterval) {
                            if (typeof soundManager !== 'undefined' && soundManager.stopSound) {
                                soundManager.stopSound(window.AppState.bgMusicInterval);
                            }
                            window.AppState.bgMusicInterval = null;
                            bgMusicStopped = true;
                        }

                        // reveal 패널 닫고 "선발 완료" 배너 1.1초 노출 후 resolve
                        revealPanel.classList.remove('show');
                        revealPanel.setAttribute('aria-hidden', 'true');
                        glassMat.opacity = 0.18;
                        innerShadowMat.opacity = 0.12;

                        isComplete = true;     // 카운터 메시지가 '선발 완료' 덮는 것 방지
                        phase = 'finishing';
                        phaseStartT = now;
                        updateMessage('선발 완료!');
                        setRailPhase('finishing');
                        finishBanner.classList.add('show');
                        finishBanner.setAttribute('aria-hidden', 'false');

                        const COMPLETE_HOLD = 1100;
                        completeTimerId = setTimeout(() => {
                            completeTimerId = null;
                            if (isDisposed) return;
                            cleanup();
                            resolve();
                        }, COMPLETE_HOLD);
                    } else {
                        // 다음 라운드 준비 — 당첨 공 제거, 튜브 회복, gap 진입
                        revealPanel.classList.remove('show');
                        revealPanel.setAttribute('aria-hidden', 'true');
                        glassMat.opacity = 0.18;
                        innerShadowMat.opacity = 0.12;

                        if (currentWinner) {
                            tubeGroup.remove(currentWinner);
                            if (currentWinner.material) currentWinner.material.dispose();
                            const idx = balls.indexOf(currentWinner);
                            if (idx >= 0) balls.splice(idx, 1);
                            currentWinner.scale.setScalar(1.0);
                            currentWinner = null;
                        }

                        phase = 'gap';
                        phaseStartT = now;
                        setRailPhase('gap');
                        updateMessage(pickingMessage());
                    }
                }
            } else if (phase === 'gap') {
                const GAP_DUR = 500;
                if (now - phaseStartT > GAP_DUR) {
                    phase = 'mixing';
                    mixStartT = now;
                    currentMixDur = MIX_DURATION_NEXT;
                    setRailPhase('mixing');
                }
            } else if (phase === 'finishing') {
                // 타이머가 cleanup/resolve 처리 — 여기서는 계속 렌더만
            }

            if (!isComplete) updateHud();

            renderer.render(scene, camera);
            rafId = requestAnimationFrame(animate);
        }

        // ── 리사이즈 ────────────────────────────────────────
        function onWindowResize() {
            renderer.setSize(window.innerWidth, window.innerHeight);
            applyCameraSize();
            positionRevealPanel();
        }
        window.addEventListener('resize', onWindowResize);

        // ── 정리 ────────────────────────────────────────────
        function cleanup() {
            // RAF 가드 — cleanup 후 큐에 남은 frame이 발동해도 즉시 return
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

            // 동적 오버레이 제거 + 컨테이너 상태 복원
            container.classList.remove('lottery-active');
            if (stage && stage.parentElement) {
                stage.parentElement.removeChild(stage);
            }

            // Three.js 리소스 정리
            scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            renderer.dispose();
        }

        // ── 시작 ────────────────────────────────────────────
        applyCameraSize();
        positionRevealPanel();

        // 첫 프레임을 먼저 그린 뒤 메시지/HUD 를 표시 — 검은 화면에
        // 글자만 먼저 뜨는 문제 방지
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(() => {
            if (isDisposed) return;
            updateMessage('공을 섞는 중...');
            updateHud();
            setRailPhase('mixing');
            lastT = performance.now();
            animate(performance.now());
        });
    });
}
