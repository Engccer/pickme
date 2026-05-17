// 낚시 테마 — Ocean Kitsch v3 (Causality)
//
// 디자인 방향: 밝은 aqua/turquoise 무대 위 11종 해양동물이 유영하고,
// 잡힌 동물은 hook/bobber 와 같은 anchor 로 한 그룹처럼 끌려 올라온다.
// SVG + HTML 오버레이 + RAF 단일 spring physics (Three.js 미사용).
//
// 가장 중요한 인과 순서 (사용자 명시 — 절대 위반 금지):
//   swim → cast → bite → hooked → pull → settle → reveal → done
//   hook 이 먼저 올라가고 동물이 lerp 로 따라가는 v2 버그 회피.
//   동물 = hook(매 프레임 phys.current.hookX/hookY 직접 읽음, CSS
//   position transition 일절 없음).
//   이름 태그는 reveal phase 진입 + 220ms gate 이후에만 등장.
//
// 안전 로직 (절대 깨면 안 됨):
//  - runFishingAnimation(canvas, selectedStudents, addPickedStudent) 시그니처
//  - isDisposed / rafId / cancelAnimationFrame cleanup 패턴
//  - isComplete 가드 — '선발 완료' 덮어쓰기 방지
//  - pickingMessage() Math.min clamp — 3/2 카운터 버그 방지
//  - 첫 frame 후 메시지 업데이트 순서
//  - window.AppState.isPaused / shouldStop 처리
//  - addPickedStudent 호출 흐름 유지 (hooked 직후 1회)
//  - 마지막 reveal 직후 bgMusicInterval 즉시 stop + null — app.js 후속 stop 충돌 방지
//  - resize 리스너 cleanup, 동적 fishing DOM cleanup
//  - 다른 테마와 RAF 격리 (closure 내 isDisposed/rafId 가드)
//  - picked-students-live display:none 금지 — sr-only 패턴만
//  - pause/resume: phys.current.t 가 dt 누적이라 phase elapsed 가 자연 freeze.
//    추가 safety 로 pauseStartT 추적해 lastT 보정

async function runFishingAnimation(canvas, selectedStudents, addPickedStudent) {
    return new Promise((resolve) => {
        // ── 디자인 토큰 (Ocean Kitsch palette)
        const SEA = {
            ink:      '#0F2F36',
            inkSoft:  'rgba(15, 47, 54, 0.62)',
            paper:    '#FBF1D8',
            twine:    '#A47A44',
            brassHi:  '#F2D384',
            brassMid: '#C99756',
            brassLo:  '#8A6432',
            coral:    '#FF8E72',
            mint:     '#5FD0BD',
            buoy:     '#E14B4B',
            waterMid: '#48B6B0',
        };

        // ── 8-phase timing (ms)
        const TV = {
            swim:    1800,
            cast:    1300,
            bite:     900,
            hooked:   500,
            pull:    1100,
            settle:   400,
            reveal:  1500,
            done:     500,    // 마지막 라운드가 아닐 때만 사용 (다음 라운드 진입 전 여유)
        };
        const TAG_DELAY = 220;       // reveal 진입 후 태그 등장까지 settle 여유
        const FINISH_HOLD = 1100;    // 마지막 라운드 '선발 완료' 배너 노출 시간

        // ── 11 slot positions (design 1280×800 기준 → viewport 비율로 매핑)
        // 동물 자체는 student 와 무관한 시각 요소 — winner index 가 매 라운드 무작위.
        const SLOTS = [
            { id: 'yellowfish',  type: 'YellowFish',     size: 130, x: 240,  y: 290, dir:  1, ph: 0.0, depth: 0.75 },
            { id: 'seahorse',    type: 'Seahorse',       size: 100, x: 470,  y: 450, dir: -1, ph: 1.3, depth: 0.55 },
            { id: 'clownfish',   type: 'Clownfish',      size: 130, x: 230,  y: 585, dir:  1, ph: 2.1, depth: 0.85 },
            { id: 'starfish',    type: 'Starfish',       size: 110, x: 540,  y: 656, dir:  1, ph: 0.7, depth: 0.95 },
            { id: 'jellyfish',   type: 'Jellyfish',      size: 110, x: 700,  y: 232, dir:  1, ph: 1.7, depth: 0.40 },
            { id: 'turtle',      type: 'Turtle',         size: 150, x: 880,  y: 500, dir: -1, ph: 0.4, depth: 0.70 },
            { id: 'minigreen',   type: 'SmallGreenFish', size:  95, x: 1060, y: 310, dir: -1, ph: 2.6, depth: 0.55 },
            { id: 'crab',        type: 'Crab',           size: 140, x: 1080, y: 660, dir:  1, ph: 1.1, depth: 0.95 },
            { id: 'octopus',     type: 'Octopus',        size: 130, x: 390,  y: 638, dir:  1, ph: 0.9, depth: 0.85 },
            { id: 'shark',       type: 'Shark',          size: 180, x: 1040, y: 430, dir: -1, ph: 1.8, depth: 0.60 },
            { id: 'pufferfish',  type: 'Pufferfish',     size: 100, x: 760,  y: 520, dir:  1, ph: 2.3, depth: 0.75 },
        ];
        const TOTAL_SLOTS = SLOTS.length;

        // chip rail 표시용 (학생 이름이 아니라 잡힌 동물 ICON/COLOR)
        const ICON = {
            YellowFish: '🐠', Clownfish: '🐟', Shark: '🦈', Seahorse: '🐴', Starfish: '⭐',
            Jellyfish: '🪼', Turtle: '🐢', SmallGreenFish: '🐟', Crab: '🦀', Octopus: '🐙', Pufferfish: '🐡',
        };
        const COLOR = {
            YellowFish: '#F2B33A', Clownfish: '#E87A1A', Shark: '#5D8FBD', Seahorse: '#E9907A', Starfish: '#F08A3A',
            Jellyfish: '#C49BE5', Turtle: '#5DA547', SmallGreenFish: '#9FCA68', Crab: '#D85530', Octopus: '#E48276', Pufferfish: '#F2C46A',
        };

        // ── CuteFace SVG helper (모든 동물 공통 — 점눈/볼터치/입 3종)
        function cuteFace(cx, cy, eyeDx, eyeDy, mouthY, mouthW, mouthH, mouth, blushDx = 9, blushDy = 3) {
            const eyeShine = (dx) => `<ellipse cx="${dx + 0.55}" cy="${eyeDy - 0.9}" rx="0.55" ry="0.75" fill="#FFFFFF" opacity="0.92"/>`;
            let mouthSvg = '';
            if (mouth === 'smile') {
                mouthSvg = `<path d="M ${-mouthW/2} ${mouthY} Q 0 ${mouthY + mouthH} ${mouthW/2} ${mouthY}" stroke="#1A1410" stroke-width="1.1" stroke-linecap="round" fill="none"/>`;
            } else if (mouth === 'o') {
                mouthSvg = `<ellipse cx="0" cy="${mouthY + mouthH / 2}" rx="${mouthW / 3.2}" ry="${mouthH * 0.95}" fill="#1A1410"/>`;
            } else if (mouth === 'happy') {
                mouthSvg = `<path d="M ${-mouthW/2} ${mouthY} Q 0 ${mouthY + mouthH * 1.6} ${mouthW/2} ${mouthY}" stroke="#1A1410" stroke-width="1.15" stroke-linecap="round" fill="none"/>`;
            }
            return `<g transform="translate(${cx} ${cy})">
                <g opacity="0.55">
                    <ellipse cx="${-blushDx}" cy="${blushDy}" rx="2.8" ry="1.7" fill="#FF8FA3"/>
                    <ellipse cx="${blushDx}" cy="${blushDy}" rx="2.8" ry="1.7" fill="#FF8FA3"/>
                </g>
                <ellipse cx="${-eyeDx}" cy="${eyeDy}" rx="1.7" ry="2.2" fill="#1A1410"/>
                <ellipse cx="${eyeDx}" cy="${eyeDy}" rx="1.7" ry="2.2" fill="#1A1410"/>
                ${eyeShine(-eyeDx)}
                ${eyeShine(eyeDx)}
                ${mouthSvg}
            </g>`;
        }

        // ── 11종 해양동물 SVG factories. 각 함수는 { vbW, vbH, content } 반환.
        // 모든 종은 동글동글한 비율 + 단순 실루엣 + CuteFace inset.
        const CREATURES = {
            YellowFish(mouth) {
                return { vbW: 140, vbH: 100, content: `
                    <path d="M 22 50 Q 6 30 4 38 Q 0 50 4 62 Q 8 72 22 52 Z" fill="#F2B33A"/>
                    <path d="M 70 18 Q 78 6 88 16 Q 80 26 64 28 Z" fill="#F2B33A"/>
                    <path d="M 64 78 Q 72 92 84 82 Q 78 74 64 72 Z" fill="#F2B33A"/>
                    <ellipse cx="74" cy="52" rx="52" ry="32" fill="#FCD33D"/>
                    <path d="M 50 22 Q 52 52 50 82 Q 56 86 60 82 Q 58 52 60 22 Q 56 18 50 22 Z" fill="#F4A23A" opacity="0.92"/>
                    <path d="M 76 18 Q 78 52 76 86 Q 84 90 88 86 Q 86 52 88 18 Q 84 14 76 18 Z" fill="#F4A23A" opacity="0.92"/>
                    <path d="M 102 24 Q 104 52 102 80 Q 108 82 112 78 Q 110 52 112 26 Q 108 22 102 24 Z" fill="#F4A23A" opacity="0.92"/>
                    <ellipse cx="78" cy="68" rx="34" ry="14" fill="#FFDF5C" opacity="0.45"/>
                    ${cuteFace(112, 46, 5, -1, 8, 7, 2.4, mouth)}
                ` };
            },
            Clownfish(mouth) {
                return { vbW: 150, vbH: 96, content: `
                    <path d="M 22 48 Q 4 26 2 36 Q -2 48 2 62 Q 6 72 22 50 Z" fill="#E87A1A"/>
                    <path d="M 64 18 Q 76 4 92 14 Q 80 26 60 28 Z" fill="#E87A1A"/>
                    <path d="M 70 76 Q 80 92 92 82 Q 82 72 70 72 Z" fill="#E87A1A"/>
                    <ellipse cx="78" cy="48" rx="56" ry="30" fill="#F08A2D"/>
                    <path d="M 110 24 Q 108 48 112 76 Q 124 76 132 70 Q 134 48 132 28 Q 124 22 110 24 Z" fill="#FFFFFF"/>
                    <path d="M 58 28 Q 56 48 60 72 Q 72 74 80 68 Q 82 48 80 30 Q 72 24 58 28 Z" fill="#FFFFFF"/>
                    <path d="M 108 24 L 112 26 M 110 70 L 114 72" stroke="#7E3A0C" stroke-width="1" opacity="0.5"/>
                    <ellipse cx="84" cy="62" rx="32" ry="12" fill="#FBC392" opacity="0.5"/>
                    ${cuteFace(118, 44, 4.5, -1, 8, 6.5, 2.2, mouth)}
                ` };
            },
            Shark(mouth) {
                // 친근한 둥근 머리 — 무서운 형태 절대 없음
                return { vbW: 170, vbH: 100, content: `
                    <path d="M 22 50 Q 4 28 2 38 Q -2 50 2 64 Q 6 76 22 52 Z" fill="#5D8FBD"/>
                    <path d="M 96 14 Q 110 4 118 18 L 108 30 Q 100 22 92 22 Z" fill="#5D8FBD"/>
                    <ellipse cx="92" cy="52" rx="68" ry="36" fill="#7AA9CE"/>
                    <ellipse cx="100" cy="68" rx="56" ry="18" fill="#E8F0F6"/>
                    <path d="M 138 56 Q 152 60 158 56 Q 152 70 140 68 Z" fill="#4F7EA8"/>
                    <path d="M 96 76 Q 108 86 118 80 Q 112 70 100 70 Z" fill="#5D8FBD"/>
                    ${cuteFace(126, 50, 5, -2, 8, 7, 2.4, mouth)}
                ` };
            },
            Seahorse(mouth) {
                return { vbW: 90, vbH: 140, content: `
                    <path d="M 48 20 Q 70 22 70 44 Q 68 64 50 70 Q 36 76 42 92 Q 50 110 38 124 Q 32 130 28 124 Q 36 110 30 96 Q 22 80 36 70 Q 50 60 50 46 Q 48 32 36 30 Q 28 24 30 18 Q 38 14 48 20 Z" fill="#E9907A"/>
                    <path d="M 36 18 Q 44 8 50 14 Q 50 24 40 26 Z" fill="#E9907A"/>
                    <path d="M 60 36 Q 70 36 72 44 Q 72 50 62 52 Z" fill="#E97A60"/>
                    <path d="M 50 70 L 60 64 L 62 76 Z" fill="#E97A60" opacity="0.7"/>
                    ${cuteFace(40, 24, 3, -1, 4, 5, 1.8, mouth, 5, 2)}
                ` };
            },
            Starfish(mouth) {
                return { vbW: 120, vbH: 120, content: `
                    <path d="M 60 12 L 76 50 L 114 56 L 84 80 L 92 116 L 60 96 L 28 116 L 36 80 L 6 56 L 44 50 Z" fill="#F08A3A"/>
                    <path d="M 60 22 L 72 50 L 102 54 L 80 74 L 86 102 L 60 88 L 34 102 L 40 74 L 18 54 L 48 50 Z" fill="#FAA45E" opacity="0.65"/>
                    <circle cx="40" cy="56" r="2" fill="#E07530"/>
                    <circle cx="80" cy="56" r="2" fill="#E07530"/>
                    <circle cx="60" cy="78" r="2" fill="#E07530"/>
                    <circle cx="50" cy="92" r="1.6" fill="#E07530"/>
                    <circle cx="70" cy="92" r="1.6" fill="#E07530"/>
                    ${cuteFace(60, 64, 6, -1, 8, 7, 2.4, mouth)}
                ` };
            },
            Jellyfish(mouth) {
                return { vbW: 100, vbH: 130, content: `
                    <path d="M 50 10 Q 92 12 92 56 L 92 64 Q 70 64 50 64 Q 30 64 8 64 L 8 56 Q 8 12 50 10 Z" fill="#C49BE5"/>
                    <ellipse cx="50" cy="34" rx="34" ry="20" fill="#D9B5EF" opacity="0.7"/>
                    <circle cx="36" cy="40" r="2.4" fill="#A57DC4" opacity="0.55"/>
                    <circle cx="58" cy="36" r="2.4" fill="#A57DC4" opacity="0.55"/>
                    <circle cx="74" cy="44" r="1.8" fill="#A57DC4" opacity="0.5"/>
                    <path d="M 18 64 Q 14 90 22 110 Q 18 122 14 110 Q 10 96 18 64 Z" fill="#C49BE5"/>
                    <path d="M 34 64 Q 30 96 36 116 Q 32 122 28 112 Q 26 92 34 64 Z" fill="#C49BE5"/>
                    <path d="M 50 64 Q 50 100 56 124 Q 50 126 44 116 Q 42 96 50 64 Z" fill="#C49BE5"/>
                    <path d="M 66 64 Q 70 96 64 118 Q 70 124 72 112 Q 74 92 66 64 Z" fill="#C49BE5"/>
                    <path d="M 82 64 Q 86 92 78 110 Q 84 122 88 110 Q 92 92 82 64 Z" fill="#C49BE5"/>
                    ${cuteFace(50, 42, 6, -1, 6, 6, 2, mouth)}
                ` };
            },
            Turtle(mouth) {
                return { vbW: 140, vbH: 110, content: `
                    <ellipse cx="90" cy="60" rx="46" ry="32" fill="#5DA547"/>
                    <ellipse cx="90" cy="56" rx="40" ry="26" fill="#79BD58"/>
                    <path d="M 90 36 L 100 50 L 96 60 L 84 60 L 80 50 Z" fill="#3F7B30" opacity="0.5"/>
                    <path d="M 66 50 L 76 58 L 70 64 L 60 60 Z M 110 50 L 120 60 L 116 66 L 106 58 Z M 76 76 L 86 70 L 88 80 L 78 84 Z M 100 76 L 110 84 L 100 88 L 96 78 Z" fill="#3F7B30" opacity="0.4"/>
                    <ellipse cx="42" cy="60" rx="14" ry="11" fill="#A0D17A"/>
                    <path d="M 60 36 L 66 30 L 64 40 Z M 60 84 L 66 90 L 64 80 Z M 120 36 L 114 30 L 116 40 Z M 120 84 L 114 90 L 116 80 Z" fill="#A0D17A"/>
                    ${cuteFace(42, 58, 3, -1, 4, 5, 1.8, mouth, 5, 2)}
                ` };
            },
            SmallGreenFish(mouth) {
                return { vbW: 110, vbH: 80, content: `
                    <path d="M 14 40 Q 4 24 2 32 Q 0 40 2 50 Q 6 60 14 42 Z" fill="#9FCA68"/>
                    <ellipse cx="58" cy="40" rx="40" ry="22" fill="#B5DD7E"/>
                    <ellipse cx="60" cy="48" rx="26" ry="10" fill="#D2EBAE" opacity="0.55"/>
                    <path d="M 56 18 Q 64 8 74 16 Q 66 24 52 24 Z" fill="#9FCA68"/>
                    ${cuteFace(86, 36, 4, -1, 6, 6, 2, mouth)}
                ` };
            },
            Crab(mouth) {
                return { vbW: 140, vbH: 100, content: `
                    <ellipse cx="70" cy="60" rx="44" ry="28" fill="#D85530"/>
                    <ellipse cx="70" cy="56" rx="38" ry="22" fill="#E87045"/>
                    <path d="M 26 56 Q 12 48 6 36 Q 16 38 22 50 Z" fill="#D85530"/>
                    <circle cx="6" cy="36" r="6" fill="#D85530"/>
                    <path d="M 114 56 Q 128 48 134 36 Q 124 38 118 50 Z" fill="#D85530"/>
                    <circle cx="134" cy="36" r="6" fill="#D85530"/>
                    <path d="M 38 86 L 30 96 M 52 90 L 48 100 M 88 90 L 92 100 M 102 86 L 110 96" stroke="#D85530" stroke-width="4" stroke-linecap="round"/>
                    ${cuteFace(70, 54, 7, -3, 6, 7, 2.4, mouth)}
                ` };
            },
            Octopus(mouth) {
                return { vbW: 130, vbH: 130, content: `
                    <ellipse cx="65" cy="56" rx="46" ry="38" fill="#E48276"/>
                    <ellipse cx="65" cy="48" rx="40" ry="28" fill="#F09A8E" opacity="0.7"/>
                    <path d="M 30 86 Q 18 100 22 116 Q 14 122 12 110 Q 14 96 28 80 Z" fill="#E48276"/>
                    <path d="M 46 92 Q 38 110 44 122 Q 36 126 32 116 Q 30 100 44 86 Z" fill="#E48276"/>
                    <path d="M 60 96 Q 56 116 64 126 Q 56 128 52 116 Q 52 102 56 92 Z" fill="#E48276"/>
                    <path d="M 76 96 Q 80 116 72 126 Q 80 128 84 116 Q 84 102 80 92 Z" fill="#E48276"/>
                    <path d="M 92 92 Q 100 110 94 122 Q 102 126 106 116 Q 106 100 94 86 Z" fill="#E48276"/>
                    <path d="M 108 86 Q 120 100 116 116 Q 124 122 126 110 Q 124 96 110 80 Z" fill="#E48276"/>
                    <circle cx="36" cy="106" r="2" fill="#C26358" opacity="0.7"/>
                    <circle cx="52" cy="110" r="2" fill="#C26358" opacity="0.7"/>
                    <circle cx="76" cy="110" r="2" fill="#C26358" opacity="0.7"/>
                    <circle cx="98" cy="106" r="2" fill="#C26358" opacity="0.7"/>
                    ${cuteFace(65, 52, 8, -2, 6, 8, 2.6, mouth)}
                ` };
            },
            Pufferfish(mouth) {
                return { vbW: 100, vbH: 100, content: `
                    <circle cx="50" cy="52" r="38" fill="#F2C46A"/>
                    <circle cx="50" cy="48" r="32" fill="#F8D687" opacity="0.7"/>
                    <path d="M 50 10 L 52 18 L 48 18 Z M 78 18 L 84 22 L 78 26 Z M 90 50 L 96 52 L 90 54 Z M 78 82 L 84 80 L 78 76 Z M 50 94 L 48 86 L 52 86 Z M 22 82 L 16 80 L 22 76 Z M 10 50 L 4 52 L 10 54 Z M 22 18 L 16 22 L 22 26 Z" fill="#D9A445"/>
                    <ellipse cx="50" cy="68" rx="26" ry="10" fill="#FDDFA0" opacity="0.6"/>
                    <path d="M 12 52 Q 0 60 4 70 Q 12 64 16 60 Z" fill="#F2C46A"/>
                    <path d="M 88 52 Q 100 60 96 70 Q 88 64 84 60 Z" fill="#F2C46A"/>
                    ${cuteFace(50, 50, 6, -2, 8, 6, 2.2, mouth)}
                ` };
            },
        };

        function buildCreatureSvg(type, size, flipX, mouth) {
            const def = CREATURES[type](mouth);
            const aspect = def.vbH / def.vbW;
            const w = size;
            const h = size * aspect;
            const flip = flipX ? ' style="transform: scaleX(-1);"' : '';
            return `<svg width="${w}" height="${h}" viewBox="0 0 ${def.vbW} ${def.vbH}"${flip}>${def.content}</svg>`;
        }

        // ── 상태
        let phase = 'swim';
        let phaseStartT = 0;
        let currentPickIndex = 0;
        // creature 매핑은 학생 선발 결과와 분리된 시각 요소.
        // 라운드마다 다른 슬롯을 쓰도록 usedSlotIds Set 으로 추적 — pool 소진 시에만
        // (선발 인원 > 11) reset 하고, 그때도 직전 winner 만 제외해 즉시 반복 방지.
        // 1라운드 winnerIdx 도 반드시 pickWinner() 거쳐서 결정 — usedSlotIds 에 등록 필수.
        // pickWinner 는 함수 선언(hoisted) 이므로 변수 선언부에서 미리 호출 가능.
        let winnerIdx = -1;
        const usedSlotIds = new Set();
        // pickWinner 는 함수 선언이라 hoisted — 여기서 호출해서 1라운드 슬롯 등록.
        winnerIdx = pickWinner();
        let isComplete = false;     // 카운터 메시지가 '선발 완료' 덮는 것 방지
        let isDisposed = false;     // 다른 테마 canvas 오염 방지
        let rafId = null;
        let pauseStartT = null;
        let lastT = performance.now();
        let bgMusicStopped = false;
        let finishTimerId = null;
        let history = [];

        // 단일 ref — 매 프레임 갱신, winner 동물이 직접 읽어 caughtGroup 동기
        const phys = {
            t: 0,                  // pseudo-time, dt 누적 (pause 시 freeze)
            hookX: 0, hookXVel: 0,
            hookY: 0, hookYVel: 0,
            targetX: 0, targetY: 0,
        };

        // ── DOM 셋업
        const container = canvas.parentElement; // #animationContainer
        const stage = document.createElement('div');
        stage.className = 'fishing-stage';
        stage.setAttribute('aria-hidden', 'true');

        // 배경 — current lines, sunlight rays, sand (각 SVG 풀-viewport)
        stage.innerHTML = `
            <svg class="fishing-bg-svg fishing-surface-svg" aria-hidden="true">
                <g class="fi-surface-g">
                    <path class="fi-surface-1" fill="#9CDBC9" opacity="0.55"/>
                    <path class="fi-surface-2" fill="#7BCAB7" opacity="0.45"/>
                    <path class="fi-surface-3" fill="#5CB9A8" opacity="0.32"/>
                </g>
            </svg>
            <svg class="fishing-current-svg" aria-hidden="true">
                <g class="fi-curr-1"></g>
                <g class="fi-curr-2"></g>
                <g class="fi-curr-3"></g>
            </svg>
            <svg class="fishing-sunlight-svg" aria-hidden="true">
                <defs>
                    <linearGradient id="fi-ray" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.5"/>
                        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <g class="fi-rays-g"></g>
            </svg>
            <svg class="fishing-sand-svg" preserveAspectRatio="none" viewBox="0 0 1280 170" aria-hidden="true">
                <path d="M 0 90 Q 120 70 260 78 Q 420 88 540 70 Q 680 56 820 70 Q 980 84 1140 66 Q 1240 56 1280 70 V 170 H 0 Z" fill="#E2C77D"/>
                <path d="M 0 96 Q 120 78 260 86 Q 420 96 540 78 Q 680 64 820 78 Q 980 92 1140 76 Q 1240 64 1280 80 V 170 H 0 Z" fill="#F5E3B0"/>
                <g class="fi-seaweed-g"></g>
                <g transform="translate(280 84)">
                    <path d="M 0 18 Q -10 0 0 -8 Q 10 -16 18 -4 Q 28 -14 36 0 Q 46 12 36 22 Z" fill="#FF9A7B"/>
                    <circle cx="6" cy="6" r="3" fill="#FFC7B3"/>
                    <circle cx="22" cy="2" r="2.5" fill="#FFC7B3"/>
                    <circle cx="30" cy="12" r="2.5" fill="#FFC7B3"/>
                </g>
                <g transform="translate(800 88)">
                    <path d="M 0 16 Q -8 -2 4 -8 Q 14 -10 20 0 Q 30 -6 36 6 Q 42 18 30 22 Z" fill="#F4C58E"/>
                    <circle cx="10" cy="4" r="2.5" fill="#FFE0B5"/>
                    <circle cx="22" cy="8" r="2.5" fill="#FFE0B5"/>
                </g>
                <g transform="translate(620 86)">
                    <ellipse cx="0" cy="14" rx="14" ry="6" fill="#C9B5E8"/>
                    <path d="M -10 14 Q -12 4 -8 0 M -4 14 Q -6 -2 0 -4 M 4 14 Q 6 -2 0 -4 M 10 14 Q 12 2 8 0" stroke="#C9B5E8" stroke-width="2.4" fill="none" stroke-linecap="round"/>
                </g>
            </svg>
        `;

        // 버블 8개 (CSS keyframe)
        for (let i = 0; i < 8; i++) {
            const x = (i * 173) % 100;
            const sz = 6 + (i % 3) * 4;
            const dur = 8 + (i % 4) * 1.4;
            const delay = (i * 0.7).toFixed(1);
            const bub = document.createElement('span');
            bub.className = 'fishing-bubble';
            bub.style.left = `${x}vw`;
            bub.style.width = `${sz}px`;
            bub.style.height = `${sz}px`;
            bub.style.animationDuration = `${dur}s`;
            bub.style.animationDelay = `${delay}s`;
            stage.appendChild(bub);
        }

        // Creature 컨테이너
        const creatureContainer = document.createElement('div');
        creatureContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        stage.appendChild(creatureContainer);

        // Hook + bezier 줄 + 찌 SVG (풀-viewport)
        const hookSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        hookSvg.classList.add('fishing-hook-svg');
        hookSvg.innerHTML = `
            <defs>
                <linearGradient id="fi-brass" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${SEA.brassHi}"/>
                    <stop offset="50%" stop-color="${SEA.brassMid}"/>
                    <stop offset="100%" stop-color="${SEA.brassLo}"/>
                </linearGradient>
            </defs>
            <path class="fi-line-shadow" stroke="rgba(15,47,54,.18)" stroke-width="2.8" fill="none" stroke-linecap="round"/>
            <path class="fi-line-main" stroke="#FAF3DC" stroke-width="1.8" fill="none" stroke-linecap="round" style="filter: drop-shadow(0 0 2px rgba(255,255,255,.6));"/>
            <g class="fi-bobber">
                <ellipse cx="0" cy="-1" rx="9" ry="13" fill="${SEA.buoy}"/>
                <path d="M -9 0 Q -9 12 9 12 Q 9 0 9 0 Z" fill="#FFFFFF"/>
                <circle cx="0" cy="0" r="9" fill="none" stroke="#1F2D2F" stroke-width="1.2"/>
                <path d="M -9 0 L 9 0" stroke="#1F2D2F" stroke-width="1.2"/>
                <ellipse cx="-3" cy="-6" rx="2.4" ry="1.4" fill="#FFFFFF" opacity="0.7"/>
            </g>
            <g class="fi-hook">
                <circle cx="0" cy="-4" r="3.2" fill="url(#fi-brass)" stroke="${SEA.brassLo}" stroke-width="0.6"/>
                <path d="M 0 -2 L 0 22" stroke="url(#fi-brass)" stroke-width="3.6" stroke-linecap="round"/>
                <path d="M 0 22 Q 0 38 -8 38 Q -16 38 -16 30" stroke="url(#fi-brass)" stroke-width="3.6" fill="none" stroke-linecap="round"/>
                <path d="M -16 30 L -12 26" stroke="${SEA.brassLo}" stroke-width="2.4" stroke-linecap="round"/>
                <path d="M -1 0 L -1 18" stroke="#FFF6DD" stroke-width="0.8" stroke-linecap="round" opacity="0.6"/>
            </g>
        `;
        stage.appendChild(hookSvg);

        // Twine SVG (reveal 직전에 동물 → 태그 grommet 곡선)
        const twineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        twineSvg.classList.add('fishing-twine-svg');
        twineSvg.innerHTML = `<path class="fi-twine-path"/>`;
        stage.appendChild(twineSvg);

        // Reveal panel — paper tag
        const revealPanel = document.createElement('div');
        revealPanel.className = 'fishing-reveal-panel';
        revealPanel.setAttribute('aria-hidden', 'true');
        revealPanel.innerHTML = `
            <div class="fishing-reveal-card">
                <span class="fishing-reveal-grommet"></span>
                <div class="fishing-reveal-eyebrow">선발 · ROUND <span class="fi-reveal-round">01</span></div>
                <div class="fishing-reveal-name"></div>
                <div class="fishing-reveal-sub">오늘의 발표자</div>
            </div>
        `;
        stage.appendChild(revealPanel);

        // HUD (상단)
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
        let hudBarHtml = '';
        for (let i = 0; i < barSegments; i++) {
            hudBarHtml += '<span class="fishing-hud-bar-cell"></span>';
        }
        const hud = document.createElement('div');
        hud.className = 'fishing-hud';
        hud.innerHTML = `
            <div class="fishing-hud-left">
                <span class="fishing-hud-mark" aria-hidden="true">P</span>
                ${classLabel ? `<span class="fishing-hud-class">${classLabel}</span>` : ''}
                <span class="fishing-hud-sub">· 낚시 선발</span>
            </div>
            <div class="fishing-hud-right">
                <span class="fishing-hud-label">ROUND</span>
                <span class="fishing-hud-counter">
                    <strong class="fishing-hud-num">01</strong>
                    <span class="fishing-hud-divider"> / </span>
                    <span class="fishing-hud-total">${String(total).padStart(2, '0')}</span>
                </span>
                <div class="fishing-hud-bar" aria-hidden="true">${hudBarHtml}</div>
            </div>
        `;
        stage.appendChild(hud);

        // 하단 rail
        const railEl = document.createElement('div');
        railEl.className = 'fishing-rail';
        railEl.innerHTML = `
            <div class="fishing-rail-status">
                <span class="fishing-rail-dot pulse" style="--fi-dot: ${SEA.mint};"></span>
                <span class="fishing-rail-status-text">대기 · 해양동물 유영 중</span>
            </div>
            <div class="fishing-rail-chips">
                <span class="fishing-rail-chips-label">앞선 선발</span>
                <span class="fishing-rail-chips-empty">아직 없음</span>
            </div>
            <div class="fishing-rail-hint">
                <span class="fishing-rail-hint-text">자동 진행</span>
            </div>
        `;
        stage.appendChild(railEl);

        // Finish banner
        const finishBanner = document.createElement('div');
        finishBanner.className = 'fishing-finish-banner';
        finishBanner.textContent = '선발 완료';
        stage.appendChild(finishBanner);

        // 마운트
        container.appendChild(stage);
        container.classList.add('fishing-active');

        // ── DOM 참조
        const surfaceG = stage.querySelector('.fi-surface-g');
        const surface1 = stage.querySelector('.fi-surface-1');
        const surface2 = stage.querySelector('.fi-surface-2');
        const surface3 = stage.querySelector('.fi-surface-3');
        const curr1 = stage.querySelector('.fi-curr-1');
        const curr2 = stage.querySelector('.fi-curr-2');
        const curr3 = stage.querySelector('.fi-curr-3');
        const raysG = stage.querySelector('.fi-rays-g');
        const seaweedG = stage.querySelector('.fi-seaweed-g');
        const lineShadow = hookSvg.querySelector('.fi-line-shadow');
        const lineMain = hookSvg.querySelector('.fi-line-main');
        const bobberG = hookSvg.querySelector('.fi-bobber');
        const hookG = hookSvg.querySelector('.fi-hook');
        const twinePath = twineSvg.querySelector('.fi-twine-path');
        const revealRoundEl = revealPanel.querySelector('.fi-reveal-round');
        const revealNameEl = revealPanel.querySelector('.fishing-reveal-name');
        const revealSubEl = revealPanel.querySelector('.fishing-reveal-sub');
        const hudNumEl = hud.querySelector('.fishing-hud-num');
        const hudBarCells = hud.querySelectorAll('.fishing-hud-bar-cell');
        const railDot = railEl.querySelector('.fishing-rail-dot');
        const railStatusText = railEl.querySelector('.fishing-rail-status-text');
        const railChipsContainer = railEl.querySelector('.fishing-rail-chips');
        const railChipsEmpty = railEl.querySelector('.fishing-rail-chips-empty');

        const messageElement = document.querySelector('.animation-message');
        function updateMessage(message) {
            if (messageElement) messageElement.textContent = message;
        }
        function pickingMessage() {
            const display = Math.min(currentPickIndex + 1, selectedStudents.length);
            return `${display}/${selectedStudents.length} 선발 중...`;
        }

        // ── 좌표 매핑 (design 1280×800 → 현재 viewport)
        let vw = window.innerWidth;
        let vh = window.innerHeight;
        // 동물 크기는 비례 (왜곡 방지) — 위치는 viewport 비율 stretch
        function scaleFactor() { return Math.min(vw / 1280, vh / 800); }
        function mapX(designX) { return designX / 1280 * vw; }
        function mapY(designY) { return designY / 800 * vh; }

        // ── creature DOM 생성 + 위치 갱신
        const creatureEls = []; // { el, slot, mouth, biteRingEl }
        for (let i = 0; i < TOTAL_SLOTS; i++) {
            const slot = SLOTS[i];
            const el = document.createElement('div');
            el.className = 'fishing-creature';
            el.dataset.idx = String(i);
            el.dataset.mouth = 'smile';
            el.innerHTML = buildCreatureSvg(slot.type, slot.size * scaleFactor(), slot.dir < 0, 'smile')
                + `<span class="fishing-bite-ring" style="width: ${slot.size * scaleFactor() * 1.55}px; height: ${slot.size * scaleFactor() * 1.05}px;"></span>`;
            creatureContainer.appendChild(el);
            // Per-creature motion params — 두 sin/cos 혼합 + slow drift + breathing 으로
            // 단일 sin 왕복처럼 보이지 않게. depth 큰 동물(앞)이 조금 더 빠르고 진폭 큼.
            creatureEls.push({
                el, slot, mouth: 'smile', biteRingEl: el.querySelector('.fishing-bite-ring'),
                motion: {
                    speedA:     0.5 + slot.depth * 0.5 + (i % 3) * 0.08,
                    speedB:     0.3 + ((i * 0.13) % 0.4),
                    bobSpeed:   0.4 + slot.depth * 0.4 + ((i * 0.07) % 0.3),
                    driftSpeed: 0.18 + slot.depth * 0.12 + (i % 2) * 0.05,
                    phA: slot.ph,
                    phB: slot.ph + 1.2 + (i * 0.31),
                    phC: slot.ph + 0.4 + (i * 0.27),
                    phD: slot.ph + 2.1 + (i * 0.43),
                    phE: slot.ph + 0.7 + (i * 0.51),
                },
            });
        }

        function setCreatureMouth(idx, mouth) {
            const rec = creatureEls[idx];
            if (rec.mouth === mouth) return;
            rec.mouth = mouth;
            const slot = rec.slot;
            const size = slot.size * scaleFactor();
            // Re-render only the inner SVG (bite ring 유지)
            const svgHtml = buildCreatureSvg(slot.type, size, slot.dir < 0, mouth);
            const existing = rec.el.querySelector('svg');
            if (existing) existing.outerHTML = svgHtml;
            rec.el.dataset.mouth = mouth;
            // Re-query bite ring (innerHTML 재할당 시 ref 보존)
            rec.biteRingEl = rec.el.querySelector('.fishing-bite-ring');
        }

        // ── HUD / phase 표시
        function updateHud(round) {
            const display = Math.min(round, total);
            hudNumEl.textContent = String(display).padStart(2, '0');
            const completed = Math.min(currentPickIndex, total);
            if (total <= 12) {
                hudBarCells.forEach((cell, i) => cell.classList.toggle('filled', i < completed));
            } else {
                const filled = Math.round((completed / total) * 12);
                hudBarCells.forEach((cell, i) => cell.classList.toggle('filled', i < filled));
            }
        }

        const PHASE_TEXT = {
            swim:   '대기 · 해양동물 유영 중',
            cast:   '캐스팅 · 훅 하강 중',
            bite:   '입질 · 접근',
            hooked: '낚임 · 줄 팽팽',
            pull:   '끌어올리는 중',
            settle: '안착',
            reveal: '발표',
            done:   '선발 완료',
        };
        const PHASE_DOT = {
            swim:   SEA.mint,
            cast:   SEA.brassMid,
            bite:   SEA.coral,
            hooked: SEA.coral,
            pull:   SEA.brassMid,
            settle: SEA.brassLo,
            reveal: SEA.buoy,
            done:   SEA.buoy,
        };
        function setRailPhase(phaseName) {
            railStatusText.textContent = PHASE_TEXT[phaseName] || '';
            railDot.style.setProperty('--fi-dot', PHASE_DOT[phaseName] || '#9FB6BB');
            railDot.classList.toggle('pulse', phaseName !== 'done');
        }

        function addChip(student, slot) {
            if (railChipsEmpty && railChipsEmpty.parentElement) railChipsEmpty.remove();
            const chip = document.createElement('span');
            chip.className = 'fishing-rail-chip';
            const icon = ICON[slot.type] || '🐟';
            const color = COLOR[slot.type] || SEA.mint;
            chip.innerHTML = `<span class="fishing-rail-chip-icon" style="background:${color};"></span><span class="fishing-rail-chip-name"></span>`;
            chip.querySelector('.fishing-rail-chip-icon').textContent = icon;
            chip.querySelector('.fishing-rail-chip-name').textContent = student.name;
            railChipsContainer.appendChild(chip);
            const chips = railChipsContainer.querySelectorAll('.fishing-rail-chip');
            if (chips.length > 5) chips[0].remove();
        }

        // ── 배경 SVG 렌더 (resize 시 viewBox 갱신, 매 frame transform)
        function paintBackdrop() {
            // SVG 들에 viewport 사이즈 viewBox 설정 (한번만)
            const setVB = (svg, vb) => svg.setAttribute('viewBox', vb);
            setVB(stage.querySelector('.fishing-surface-svg'), `0 0 ${vw} ${vh}`);
            setVB(stage.querySelector('.fishing-current-svg'), `0 0 ${vw} ${vh}`);
            setVB(stage.querySelector('.fishing-sunlight-svg'), `0 0 ${vw} ${vh}`);
            setVB(hookSvg, `0 0 ${vw} ${vh}`);
            setVB(twineSvg, `0 0 ${vw} ${vh}`);

            // Surface waves (수면 근처) — 3 stacked Q-paths
            const surfaceY = vh * 0.10;
            const buildWave = (yOff) => {
                let d = `M 0 ${surfaceY + yOff}`;
                const step = vw / 12;
                for (let k = 0; k <= 12; k++) {
                    const x = k * step;
                    const wy = surfaceY + yOff + (k % 2 === 0 ? -6 : 6);
                    d += ` L ${x.toFixed(1)} ${wy.toFixed(1)}`;
                }
                d += ` L ${vw} ${surfaceY + 40} L 0 ${surfaceY + 40} Z`;
                return d;
            };
            surface1.setAttribute('d', buildWave(0));
            surface2.setAttribute('d', buildWave(6));
            surface3.setAttribute('d', buildWave(14));

            // Current line layers — 3 parallax
            const buildCurrent = (ys, ampOffset, opacity) => {
                let html = '';
                ys.forEach((y, i) => {
                    const cy = mapY(y);
                    const op = opacity + (i % 2) * 0.04;
                    html += `<path d="M -120 ${cy.toFixed(1)} Q ${(vw * 0.25).toFixed(1)} ${(cy - 8 + ampOffset).toFixed(1)} ${(vw * 0.5).toFixed(1)} ${cy.toFixed(1)} T ${vw + 200} ${cy.toFixed(1)}" stroke="#FFFFFF" stroke-opacity="${op}" stroke-width="${1 + (i % 2) * 0.6}" fill="none" stroke-linecap="round"/>`;
                });
                return html;
            };
            curr1.innerHTML = buildCurrent([160, 230, 310, 420, 540], -2, 0.16);
            curr2.innerHTML = buildCurrent([190, 280, 370, 460, 560], 6, 0.22);
            curr3.innerHTML = buildCurrent([260, 360, 470, 600], 0, 0.18);

            // Sunlight rays — 4 cones
            const rays = [
                { x1: 0.17, x2: 0.25, x3: 0.37, x4: 0.28, opacity: 0.38 },
                { x1: 0.39, x2: 0.42, x3: 0.47, x4: 0.42, opacity: 0.32 },
                { x1: 0.64, x2: 0.69, x3: 0.77, x4: 0.70, opacity: 0.34 },
                { x1: 0.83, x2: 0.87, x3: 0.92, x4: 0.87, opacity: 0.28 },
            ];
            const rayTop = mapY(120);
            const rayBot = mapY(720);
            let raysHtml = '';
            rays.forEach(r => {
                raysHtml += `<polygon points="${(r.x1 * vw).toFixed(1)},${rayTop.toFixed(1)} ${(r.x2 * vw).toFixed(1)},${rayTop.toFixed(1)} ${(r.x3 * vw).toFixed(1)},${rayBot.toFixed(1)} ${(r.x4 * vw).toFixed(1)},${rayBot.toFixed(1)}" fill="url(#fi-ray)" opacity="${r.opacity}"/>`;
            });
            raysG.innerHTML = raysHtml;

            // Seaweed (sand-svg 안 — viewBox 1280×170 그대로 사용)
            let seaweedHtml = '';
            [150, 410, 720, 1000, 1180].forEach((x, i) => {
                seaweedHtml += `<g class="fi-seaweed" data-idx="${i}" data-base-x="${x}" stroke="${SEA.mint}" stroke-width="3" stroke-linecap="round" fill="none">
                    <path class="fi-sw-a" data-x="${x}" data-dy="100" opacity="0.85"/>
                    <path class="fi-sw-b" data-x="${x + 6}" data-dy="102" opacity="0.75"/>
                    <path class="fi-sw-c" data-x="${x - 8}" data-dy="104" opacity="0.7"/>
                </g>`;
            });
            seaweedG.innerHTML = seaweedHtml;
        }

        // ── 매 frame 갱신: 배경 sway + creature 위치 + hook line bezier
        function paintFrame() {
            const t = phys.t;

            // Surface sway
            if (surfaceG) surfaceG.setAttribute('transform', `translate(${(Math.sin(t / 2400) * 14).toFixed(1)} 0)`);

            // Current parallax (transform translateX)
            if (curr1) curr1.setAttribute('transform', `translate(${(((t * 0.012) % 200) - 100).toFixed(1)} 0)`);
            if (curr2) curr2.setAttribute('transform', `translate(${((-(t * 0.025) % 240) + 120).toFixed(1)} 0)`);
            if (curr3) curr3.setAttribute('transform', `translate(${(((t * 0.045) % 280) - 140).toFixed(1)} 0)`);

            // Sunlight cones drift
            const sunlightSvg = stage.querySelector('.fishing-sunlight-svg');
            if (sunlightSvg && raysG) raysG.setAttribute('transform', `translate(${(Math.sin(t / 4200) * 16).toFixed(1)} 0)`);

            // Seaweed sway
            const seaweeds = seaweedG ? seaweedG.querySelectorAll('.fi-seaweed') : [];
            seaweeds.forEach((g, i) => {
                const sway = Math.sin(t / 1100 + i * 0.7) * 5;
                const x = parseFloat(g.dataset.baseX);
                const a = g.querySelector('.fi-sw-a');
                const b = g.querySelector('.fi-sw-b');
                const c = g.querySelector('.fi-sw-c');
                if (a) a.setAttribute('d', `M ${x} 100 Q ${(x - 4 + sway * 0.5).toFixed(1)} 80 ${(x - 2 + sway).toFixed(1)} 56`);
                if (b) b.setAttribute('d', `M ${x + 6} 102 Q ${(x + 10 + sway * 0.4).toFixed(1)} 84 ${(x + 12 + sway * 0.9).toFixed(1)} 64`);
                if (c) c.setAttribute('d', `M ${x - 8} 104 Q ${(x - 12 + sway * 0.6).toFixed(1)} 88 ${(x - 14 + sway * 1.1).toFixed(1)} 70`);
            });

            // ── Creature positions
            const phaseT = phys.t - phaseStartT;
            const hookXpx = phys.hookX;
            const hookYpx = phys.hookY;
            const tSec = t * 0.001;  // 초 단위 — motion 속도 파라미터 기준
            const sf = scaleFactor();
            // reveal/done 동안 non-selected 동물 motion 65% 감속 (사용자 허용)
            const ambientScale = (phase === 'reveal' || phase === 'done') ? 0.65 : 1;
            for (let i = 0; i < creatureEls.length; i++) {
                const rec = creatureEls[i];
                const slot = rec.slot;
                const m = rec.motion;
                const isWinner = i === winnerIdx;

                // 진폭 — depth 비례 parallax (앞쪽 크게, 뒤쪽 작게)
                const swayAmpBase  = (14 + slot.depth * 18) * sf;  // 약 21~31px (× sf)
                const bobAmpBase   = ( 7 + slot.depth *  8) * sf;  // 약 10~15px
                const slowDriftAmp = ( 4 + slot.depth *  5) * sf;  // 약 6~9px
                const rotAmpDeg    =  4 + slot.depth *  3;          // 약 5~7deg

                // 두 sin 7:3 혼합 — 다른 주기·위상 → 직선 왕복 X
                const swayX = (
                    Math.sin(tSec * m.speedA + m.phA) * 0.7 +
                    Math.sin(tSec * m.speedB * 0.62 + m.phB) * 0.3
                ) * swayAmpBase;
                const bobY = (
                    Math.cos(tSec * m.bobSpeed + m.phC) * 0.7 +
                    Math.sin(tSec * m.bobSpeed * 0.55 + m.phD) * 0.3
                ) * bobAmpBase;
                // 더 느린 lateral drift — 한 자리 흔들기 외 가벼운 떠다님
                const slowDrift = Math.sin(tSec * m.driftSpeed + m.phE) * slowDriftAmp;
                const baseRot = Math.sin(tSec * m.speedA * 0.8 + m.phB + 0.4) * rotAmpDeg;
                // breathing scale 0.96~1.04 (약하게)
                const breath = 1 + Math.sin(tSec * m.bobSpeed * 1.4 + m.phC) * 0.04;

                // non-selected 동물 motion 은 ambientScale (reveal/done 시 65%) 적용,
                // selected 도 swim/cast/bite 까지는 같은 자유 유영 그대로.
                const ms = isWinner ? 1 : ambientScale;
                const ambSwayX = (swayX + slowDrift) * ms;
                const ambBobY  = bobY * ms;
                const ambRot   = baseRot * ms;
                const ambScale = isWinner ? breath : (1 + (breath - 1) * ms);

                let x = mapX(slot.x) + ambSwayX;
                let y = mapY(slot.y) + ambBobY;
                let rot = ambRot;
                let scale = ambScale;
                let opacity = 1;
                let mouth = 'smile';
                let biteActive = false;

                if (isWinner) {
                    if (phase === 'bite') {
                        // JS easeOutCubic 으로 hook tip 좌표로 수렴.
                        // 보간식 개선: e=1 시 정확히 hook tip 도달 (이전 식은 +swayX 잔존 → hooked 진입 시 미세 점프).
                        const k = Math.min(1, phaseT / TV.bite);
                        const e = 1 - Math.pow(1 - k, 3);
                        const tipX = hookXpx;
                        const tipY = hookYpx + 8 * sf;
                        x = mapX(slot.x) + ambSwayX * (1 - e) + (tipX - mapX(slot.x)) * e;
                        y = mapY(slot.y) + ambBobY  * (1 - e) + (tipY - mapY(slot.y)) * e;
                        rot = ambRot * (1 - e) + (-4) * e;
                        scale = 1 + (breath - 1) * (1 - e) + 0.04 * e; // 자연 breath → 살짝 활성 scale
                        mouth = 'o';
                        biteActive = true;
                    } else if (phase === 'hooked' || phase === 'pull' || phase === 'settle' || phase === 'reveal' || phase === 'done') {
                        // hooked 이후: hook 과 같은 anchor 매 프레임 직접 읽음 (caughtGroup).
                        // idle motion 일체 섞지 않음 — hook 에서 떨어져 보이지 않게.
                        x = hookXpx;
                        y = hookYpx + 8 * sf;
                        const dangle =
                            phase === 'pull'   ? Math.sin(t / 240) * 3 :
                            phase === 'hooked' ? Math.sin(t / 160) * 4 :
                            phase === 'settle' ? Math.sin(t / 320) * 1 :
                                                  Math.sin(t / 480) * 1.5;
                        rot = -4 + dangle;
                        mouth = (phase === 'reveal' || phase === 'done') ? 'happy' : 'o';
                        if (phase === 'reveal' || phase === 'done') {
                            const k = Math.min(1, phaseT / 320);
                            scale = 1.0 + (1 - Math.pow(1 - k, 3)) * 0.08;
                        } else {
                            scale = 1.04;
                        }
                        biteActive = phase === 'hooked';
                    }
                } else {
                    if (phase === 'reveal' || phase === 'done') opacity = 0.5;
                    else if (phase === 'bite' || phase === 'hooked' || phase === 'pull' || phase === 'settle') opacity = 0.82;
                }

                rec.el.style.left = `${x.toFixed(1)}px`;
                rec.el.style.top = `${y.toFixed(1)}px`;
                rec.el.style.transform = `translate(-50%, -50%) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
                rec.el.style.opacity = String(opacity);
                rec.el.style.zIndex = String(isWinner ? 30 : (10 + Math.round(slot.depth * 8)));
                rec.el.classList.toggle('bite-active', biteActive);
                if (rec.mouth !== mouth) setCreatureMouth(i, mouth);
            }

            // ── Hook line (Bezier) — root 좌상단 viewport 중앙
            const rootX = vw / 2 + Math.sin(t / 2400) * 3;
            const rootY = 0;

            // Tension: pull 단계 줄 팽팽 → sway 진폭 축소
            const tensionRaw =
                phase === 'pull'   ? 1 :
                phase === 'hooked' ? 0.7 :
                phase === 'settle' ? 0.4 : 0;
            const swayScale = 1 - tensionRaw * 0.75;
            const swayA = Math.sin(t / 1500 + 0.2) * 14 * swayScale;
            const swayB = Math.sin(t / 1100 + 1.4) * 22 * swayScale;
            const lag = phys.hookXVel * -0.04;
            const c1y = Math.max(28, hookYpx * 0.33);
            const c2y = Math.max(60, hookYpx * 0.66);
            const ctrl1X = rootX + swayA * 0.5 + lag * 0.6;
            const ctrl2X = hookXpx + swayB + lag;

            const pathD = `M ${rootX.toFixed(1)} ${rootY} C ${ctrl1X.toFixed(1)} ${c1y.toFixed(1)}, ${ctrl2X.toFixed(1)} ${c2y.toFixed(1)}, ${hookXpx.toFixed(1)} ${hookYpx.toFixed(1)}`;
            lineShadow.setAttribute('d', pathD);
            lineMain.setAttribute('d', pathD);
            lineMain.setAttribute('stroke-width', String(1.7 + tensionRaw * 0.6));

            // Bobber — 경로 13% 지점
            const bobberT = 0.13;
            const bx = bezPoint(rootX, ctrl1X, ctrl2X, hookXpx, bobberT);
            const by = bezPoint(rootY, c1y, c2y, hookYpx, bobberT);
            const bobberRot = Math.sin(t / 1300 + 0.4) * 7 * (1 - tensionRaw * 0.5);
            bobberG.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${bobberRot.toFixed(2)})`);

            // Hook — 경로 tangent + 자체 sway
            const tx = bezTangent(rootX, ctrl1X, ctrl2X, hookXpx, 1);
            const ty = bezTangent(rootY, c1y, c2y, hookYpx, 1);
            const lineHookAngle = Math.atan2(ty, tx) * 180 / Math.PI - 90;
            const hookSelfRot = Math.sin(t / 800) * 5 * swayScale;
            hookG.setAttribute('transform', `translate(${hookXpx.toFixed(1)} ${hookYpx.toFixed(1)}) rotate(${(lineHookAngle + hookSelfRot).toFixed(2)})`);

            // ── Twine (reveal 시점에 동물 → 태그 grommet 곡선)
            if (phase === 'reveal' || phase === 'done') {
                const tagL = mapX(70) * 0; // tag offset 계산은 아래 positionReveal
                const anchorX = hookXpx;
                const anchorY = hookYpx + 16 * scaleFactor();
                // Tag grommet 위치 — positionRevealPanel 가 set 함
                const grommetX = parseFloat(revealPanel.dataset.grommetX || '0');
                const grommetY = parseFloat(revealPanel.dataset.grommetY || '0');
                const midX = (anchorX + grommetX) / 2 + 28;
                const midY = (anchorY + grommetY) / 2 - 18;
                twinePath.setAttribute('d', `M ${anchorX.toFixed(1)} ${anchorY.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${grommetX.toFixed(1)} ${grommetY.toFixed(1)}`);
            }
        }

        // Bezier helpers
        function bezPoint(p0, p1, p2, p3, t) { const u = 1 - t; return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3; }
        function bezTangent(p0, p1, p2, p3, t) { const u = 1 - t; return 3*u*u*(p1-p0) + 6*u*t*(p2-p1) + 3*t*t*(p3-p2); }

        // ── reveal 패널 위치 — hook 옆에 paper tag 로 배치.
        // 기본은 hook 오른쪽. 우측 공간 부족 시 hook 왼쪽으로 flip (.is-flipped),
        // 양쪽 다 부족하면 viewport 안쪽으로 clamp. grommet 좌표는 flip 상태에 맞춰
        // 패널의 hook 쪽 모서리(왼쪽 / flip 시 오른쪽) 로 갱신 — twine 곡선과 일치.
        function positionRevealPanel() {
            const sf = scaleFactor();
            const offsetX = 70 * sf;
            const offsetY = 6 * sf;
            const SAFE = 24;                                       // 좌우 safe margin (>=24)
            const panelW = Math.min(360, vw - 32);                 // CSS: min(360px, calc(100vw - 32px))
            const panelH = 130;                                    // min-height 116 + 패딩 추정
            const HUD_GAP = 76;                                    // HUD bottom(64) + 12 여백
            const RAIL_GAP = 80;                                   // rail top + 8 여백

            // 1) 가로 — 기본 hook 오른쪽, 우측 부족 시 flip, 양쪽 부족 시 clamp
            let left = phys.hookX + offsetX;
            let flipped = false;
            if (left + panelW > vw - SAFE) {
                const leftAlt = phys.hookX - offsetX - panelW;
                if (leftAlt >= SAFE) {
                    left = leftAlt;
                    flipped = true;
                } else {
                    left = Math.max(SAFE, vw - panelW - SAFE);
                }
            } else if (left < SAFE) {
                left = SAFE;
            }

            // 2) 세로 — HUD / pause / rail 회피
            let top = phys.hookY + offsetY;
            const minTop = HUD_GAP;
            let maxTop = vh - panelH - RAIL_GAP;
            if (maxTop < minTop) maxTop = minTop;                  // 매우 낮은 viewport — HUD 아래 가독성 우선
            top = Math.min(maxTop, Math.max(minTop, top));

            revealPanel.style.left = `${left.toFixed(1)}px`;
            revealPanel.style.top = `${top.toFixed(1)}px`;
            revealPanel.classList.toggle('is-flipped', flipped);

            // grommet 좌표 — 정상은 panel 왼쪽 모서리(card left:-4, ~5/27), flip 시 오른쪽 모서리
            const grommetX = flipped ? (left + panelW - 5) : (left + 5);
            const grommetY = top + 27;
            revealPanel.dataset.grommetX = String(grommetX);
            revealPanel.dataset.grommetY = String(grommetY);
        }

        // ── target 좌표 계산 (phase 별, design 좌표 → viewport px)
        function recomputeTarget() {
            const slot = SLOTS[winnerIdx];
            const dY = mapY(slot.y - 8);
            const dX = mapX(slot.x);
            let tx, ty;
            if (phase === 'swim') { tx = vw / 2;       ty = mapY(-60); }
            else if (phase === 'cast')   { tx = dX; ty = dY - 24 * scaleFactor(); }
            else if (phase === 'bite')   { tx = dX; ty = dY - 4 * scaleFactor(); }
            else if (phase === 'hooked') { tx = dX; ty = dY + 14 * scaleFactor(); }
            else if (phase === 'pull')   { tx = dX; ty = mapY(240); }
            else if (phase === 'settle') { tx = dX; ty = mapY(240); }
            else if (phase === 'reveal') { tx = dX; ty = mapY(246); }
            else if (phase === 'done')   { tx = dX; ty = mapY(246); }
            else { tx = vw / 2; ty = mapY(-60); }
            phys.targetX = tx;
            phys.targetY = ty;
        }

        // ── winner 선택 — 라운드마다 서로 다른 slot 보장
        // 선발 인원 ≤ 11(TOTAL_SLOTS): 절대 같은 동물 중복 없음.
        // 선발 인원 > 11: pool 소진 시 reset, 그때만 직전 winner 만 제외하고 재사용.
        // 학생 선발 알고리즘과 무관 — 이 함수는 '시각용 슬롯 인덱스'만 결정.
        function pickWinner() {
            if (TOTAL_SLOTS <= 1) return 0;
            // pool 소진 → 직전 winner 만 제외하고 reset (즉시 반복 방지)
            if (usedSlotIds.size >= TOTAL_SLOTS) {
                const last = winnerIdx;
                usedSlotIds.clear();
                if (last >= 0) usedSlotIds.add(last);
            }
            const candidates = [];
            for (let i = 0; i < TOTAL_SLOTS; i++) {
                if (!usedSlotIds.has(i)) candidates.push(i);
            }
            const next = candidates[Math.floor(Math.random() * candidates.length)];
            usedSlotIds.add(next);
            return next;
        }

        // ── phase 전환
        function transitionTo(newPhase) {
            phase = newPhase;
            phaseStartT = phys.t;
            recomputeTarget();
            setRailPhase(newPhase);

            if (newPhase === 'swim') {
                winnerIdx = pickWinner();
                // reveal/twine hide
                revealPanel.classList.remove('show');
                revealPanel.setAttribute('aria-hidden', 'true');
                twineSvg.classList.remove('show');
                tagShown = false;
                updateMessage(pickingMessage());
            } else if (newPhase === 'cast') {
                updateMessage(pickingMessage());
                // 찌가 물에 내려가는 짧은 water plop
                if (typeof soundManager !== 'undefined' && soundManager.playFishingCast) {
                    soundManager.playFishingCast();
                }
            } else if (newPhase === 'bite') {
                setCreatureMouth(winnerIdx, 'o');
            } else if (newPhase === 'hooked') {
                // 줄이 짧게 팽팽 — tug down
                phys.hookYVel += 90 * scaleFactor();
                // 잡힘 사운드 + addPickedStudent 호출 (기존 흐름)
                const student = selectedStudents[currentPickIndex];
                if (addPickedStudent) addPickedStudent(student);
                // 잡힌 순간 — sharp tug (chime 은 reveal 에서 별도)
                if (typeof soundManager !== 'undefined' && soundManager.playFishingHooked) {
                    soundManager.playFishingHooked();
                }
                updateMessage(`${student.name} 학생을 선발했습니다!`);
            } else if (newPhase === 'pull') {
                // 위로 끌어올림 — yank up
                phys.hookYVel -= 70 * scaleFactor();
                // 끌어올리는 동안 부드러운 rising tone (옅게)
                if (typeof soundManager !== 'undefined' && soundManager.playFishingPull) {
                    soundManager.playFishingPull();
                }
            } else if (newPhase === 'settle') {
                // spring damping 강화 (paintSpring 안에서)
            } else if (newPhase === 'reveal') {
                // 텍스트 채움. tag.show 는 phaseT > TAG_DELAY 시점에 add.
                const student = selectedStudents[currentPickIndex];
                const slot = SLOTS[winnerIdx];
                revealRoundEl.textContent = String(Math.min(currentPickIndex + 1, total)).padStart(2, '0');
                revealNameEl.textContent = student.name;
                const role = (window.AppState && window.AppState.purpose) ? String(window.AppState.purpose).trim() : '';
                revealSubEl.textContent = role || '오늘의 발표자';
                positionRevealPanel();
                addChip(student, slot);
                currentPickIndex++;
                updateHud(Math.min(currentPickIndex, total));
            } else if (newPhase === 'done') {
                // 마지막 라운드면 즉시 finishing 처리, 아니면 짧은 hold 후 다음 swim
                if (currentPickIndex >= selectedStudents.length) {
                    enterFinishing();
                }
            }
        }

        let tagShown = false;
        let finishingEntered = false;
        function enterFinishing() {
            if (finishingEntered) return;
            finishingEntered = true;
            isComplete = true;
            // bg music 즉시 정리 — app.js 후속 stop 충돌 방지
            if (!bgMusicStopped && window.AppState && window.AppState.bgMusicInterval) {
                if (typeof soundManager !== 'undefined' && soundManager.stopSound) {
                    soundManager.stopSound(window.AppState.bgMusicInterval);
                }
                window.AppState.bgMusicInterval = null;
                bgMusicStopped = true;
            }
            // tag 숨기고 banner 노출
            revealPanel.classList.remove('show');
            revealPanel.setAttribute('aria-hidden', 'true');
            twineSvg.classList.remove('show');
            finishBanner.classList.add('show');
            finishBanner.setAttribute('aria-hidden', 'false');
            updateMessage('선발 완료!');
            setRailPhase('done');

            finishTimerId = setTimeout(() => {
                finishTimerId = null;
                if (isDisposed) return;
                cleanup();
                resolve();
            }, FINISH_HOLD);
        }

        // ── Spring physics (x/y 각각, phase 별 강성 튜닝)
        function applySpring(dt) {
            const sf = scaleFactor();
            // x spring
            const kX = 100 * sf;
            const cX = 14;
            const fX = -kX * (phys.hookX - phys.targetX) - cX * phys.hookXVel;
            phys.hookXVel += fX * dt;
            phys.hookX += phys.hookXVel * dt;
            // y spring — phase 별 튜닝
            let kY, cY;
            if (phase === 'cast')        { kY =  90 * sf; cY =  9; }
            else if (phase === 'hooked') { kY = 180 * sf; cY =  8; }
            else if (phase === 'pull')   { kY = 110 * sf; cY = 13; }
            else if (phase === 'settle' || phase === 'reveal' || phase === 'done') { kY = 100 * sf; cY = 22; }
            else                          { kY = 130 * sf; cY = 13; }
            const fY = -kY * (phys.hookY - phys.targetY) - cY * phys.hookYVel;
            phys.hookYVel += fY * dt;
            phys.hookY += phys.hookYVel * dt;
        }

        // ── 메인 RAF 루프
        function animate(now) {
            if (isDisposed) return;

            // 일시 중지 — phys.t 누적 중단 (lastT 만 유지). 모든 phase elapsed
            // 가 phys.t 기반이라 pause 동안 자연 freeze, resume 직후 정확히 이어짐.
            if (window.AppState && window.AppState.isPaused) {
                if (pauseStartT === null) pauseStartT = now;
                lastT = now;
                rafId = requestAnimationFrame(animate);
                return;
            }
            // 방금 resume — lastT 만 보정 (phys.t 는 dt 누적이라 추가 shift 불필요)
            if (pauseStartT !== null) {
                pauseStartT = null;
                lastT = now;
            }

            if (window.AppState && window.AppState.shouldStop) {
                cleanup();
                resolve();
                return;
            }

            const dt = Math.min(1 / 30, (now - lastT) / 1000);
            lastT = now;
            phys.t += dt * 1000; // pseudo-time (ms), pause 시 멈춤

            const phaseT = phys.t - phaseStartT;

            // Phase machine
            if (phase === 'swim'   && phaseT > TV.swim)   transitionTo('cast');
            else if (phase === 'cast'   && phaseT > TV.cast)   transitionTo('bite');
            else if (phase === 'bite'   && phaseT > TV.bite)   transitionTo('hooked');
            else if (phase === 'hooked' && phaseT > TV.hooked) transitionTo('pull');
            else if (phase === 'pull'   && phaseT > TV.pull)   transitionTo('settle');
            else if (phase === 'settle' && phaseT > TV.settle) transitionTo('reveal');
            else if (phase === 'reveal' && phaseT > TV.reveal) transitionTo('done');
            else if (phase === 'done'   && !finishingEntered && phaseT > TV.done) {
                // 마지막이 아닌 일반 라운드 — 다음 swim
                transitionTo('swim');
            }

            // tag.show 는 reveal 진입 + 220ms 후에만 트리거 (settle 여유)
            if (!tagShown && phase === 'reveal' && phaseT > TAG_DELAY) {
                tagShown = true;
                positionRevealPanel();
                revealPanel.classList.add('show');
                revealPanel.setAttribute('aria-hidden', 'false');
                twineSvg.classList.add('show');
                // 이름 태그가 보이는 순간 — 청아한 띠링
                if (typeof soundManager !== 'undefined' && soundManager.playFishingReveal) {
                    soundManager.playFishingReveal();
                }
            }

            // target 매 frame 재계산 (resize 대응 + winner 동물 유영 sway 반영)
            recomputeTarget();

            applySpring(dt);
            if (phase === 'reveal' || phase === 'done') positionRevealPanel();
            paintFrame();

            rafId = requestAnimationFrame(animate);
        }

        // ── 리사이즈
        function onWindowResize() {
            vw = window.innerWidth;
            vh = window.innerHeight;
            // creature SVG 사이즈 다시
            for (let i = 0; i < creatureEls.length; i++) {
                const rec = creatureEls[i];
                const slot = rec.slot;
                const size = slot.size * scaleFactor();
                const svgHtml = buildCreatureSvg(slot.type, size, slot.dir < 0, rec.mouth);
                const existing = rec.el.querySelector('svg');
                if (existing) existing.outerHTML = svgHtml;
                const bring = rec.el.querySelector('.fishing-bite-ring');
                if (bring) {
                    bring.style.width = `${size * 1.55}px`;
                    bring.style.height = `${size * 1.05}px`;
                }
                rec.biteRingEl = rec.el.querySelector('.fishing-bite-ring');
            }
            paintBackdrop();
            recomputeTarget();
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
            if (finishTimerId !== null) {
                clearTimeout(finishTimerId);
                finishTimerId = null;
            }
            window.removeEventListener('resize', onWindowResize);
            container.classList.remove('fishing-active');
            if (stage && stage.parentElement) {
                stage.parentElement.removeChild(stage);
            }
        }

        // ── 시작 — 첫 frame 후 메시지 (검은 화면 글자만 뜨는 문제 방지)
        paintBackdrop();
        // 초기 hook 위치 — 화면 위쪽
        phys.hookX = vw / 2;
        phys.hookY = mapY(-60);
        recomputeTarget();
        paintFrame();

        rafId = requestAnimationFrame(() => {
            if (isDisposed) return;
            updateMessage('낚시 준비 중...');
            updateHud(1);
            setRailPhase('swim');
            lastT = performance.now();
            phaseStartT = 0;
            animate(performance.now());
        });
    });
}
