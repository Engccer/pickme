# Spark 2.0 통합 설계: 새 테마 "내 교실(My Classroom)"

> 이 문서는 World Labs의 Spark 2.0(3D Gaussian Splatting 렌더링 엔진)을 pickme에 네 번째 테마로 도입하기 위한 설계안이다. 구현 전 의사결정을 정리하는 것이 목적이며, 실제 코드 작성은 승인 후 별도 PR로 진행한다.

- 작성일: 2026-04-23
- 대상 라이선스: MIT (Spark), pickme 교육 라이선스
- 참조: https://github.com/sparkjsdev/spark , https://sparkjs.dev/

---

## 1. 배경과 동기

pickme는 현재 세 가지 Three.js 프리미티브 기반 테마(룰렛/로또/낚시)를 제공한다. 이들은 모두 코드로 생성한 3D 오브젝트를 사용한다.

Spark 2.0은 **실세계를 촬영한 공간 데이터(3DGS)**를 브라우저에서 실시간 스트리밍하는 엔진이다. pickme에 도입하면 기존 테마가 제공할 수 없는 가치 두 가지가 생긴다.

1. **공간의 맥락성** — "우리 반 교실", "운동장", "급식실" 같은 장소 자체가 테마의 배경이 된다. 선생님·학생이 자기 공간을 미리 촬영해 두면 매년 다른 반에서 고유한 경험을 연출할 수 있다.
2. **학생 참여형 콘텐츠 제작 경로** — 학생들이 스마트폰(Polycam/Scaniverse 등)으로 교실을 촬영해 선생님에게 제출하고, 이것이 뽑기 애니메이션의 배경이 되는 순환 구조. 수업 활동으로 확장 가능.

## 2. 현재 pickme 구조 요약

근거: `CLAUDE.md`, `index.html:307`, `themes/roulette.js`.

- **정적 SPA**: 빌드 파이프라인 없음. GitHub Pages(`engccer.github.io/pickme`)에 그대로 배포.
- **Three.js r128**: `index.html`에서 `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">`로 **전역 스크립트** 로드. `THREE` 전역 심볼에 의존.
- **테마 인터페이스**: `themes/*.js`의 각 파일이 단일 함수를 정의한다.
  ```
  async function runXxxAnimation(canvas, selectedStudents, addPickedStudent)
  ```
  - `canvas`: `#threeCanvas` DOM 요소
  - `selectedStudents`: 이번 라운드에서 뽑을 학생 배열
  - `addPickedStudent`: 한 명이 확정될 때마다 호출하는 콜백
- **제어 플래그**: `AppState.isPaused`, `AppState.shouldStop`를 각 애니메이션 루프에서 읽어 일시정지/중단 처리.
- **접근성**: `announceToScreenReader()`로 선발 사건을 aria-live 영역에 알림. 사용자(개발자)가 시각장애 교사이므로 **이 연동을 깨면 안 된다**.

## 3. 통합 시 핵심 제약

| # | 제약 | 영향 |
|---|------|------|
| C1 | Spark는 Three.js **r180+** 요구 | r128과 공존 불가 — API 시그니처가 다름 |
| C2 | Spark는 **ES 모듈 전용** (`import { SplatMesh } from "@sparkjsdev/spark"`) | pickme의 전역 스크립트 패턴과 충돌 |
| C3 | 같은 페이지에 Three.js 두 버전을 동시에 올리면 모듈 레지스트리가 꼬이거나 WebGL 컨텍스트가 경합 | 단일 페이지 내 혼용 금지 |
| C4 | 스플랫 자산은 수십~수백 MB | GitHub Pages(1GB soft)·단일파일(100MB) 제한, 대역폭 이슈 |
| C5 | 시각장애 교사가 만드는 프로젝트 | 스크린리더/키보드로 테마 사용 가능해야 함 |
| C6 | 일시정지(`isPaused`)·중단(`shouldStop`)·콜백(`addPickedStudent`)이 전역 `AppState` 기반 | 새 테마도 같은 인터페이스를 지켜야 함 |

## 4. 통합 전략 — 3가지 옵션 비교

### 옵션 A. 전체 Three.js 업그레이드 (r128 → r180+)

- **내용**: `index.html`의 CDN 버전 교체, 모든 테마를 ES 모듈화, 기존 세 테마의 파괴적 변경 대응.
- **장점**: 장기적으로 통일된 최신 스택.
- **단점**: r128 → r180 사이 파괴적 변경 다수(`Geometry` 제거, `Texture.encoding` → `colorSpace`, 조명 물리 모델, `Material.vertexColors` 타입 변경 등). 기존 3개 테마 전수 리그레션 필요. 작업량 큼.
- **권장도**: 낮음 (범위가 pickme에 비해 과함).

### 옵션 B. Spark 테마만 iframe 격리 (권장)

- **내용**: `themes/my-classroom/index.html`을 독립 문서로 만들고, 해당 테마 실행 시 부모 문서에서 `<iframe>`을 생성해 로드. iframe 내부는 자체 import map으로 Three r180 + Spark를 ES 모듈로 로드. 부모 ↔ iframe은 `postMessage`로 상호작용.
- **장점**
  - 기존 r128 세 테마를 건드리지 않음 — 리그레션 리스크 0.
  - 모듈 버전·import map 전부 iframe 안에서만 유효 → 격리 완벽.
  - iframe은 자체 WebGL 컨텍스트를 가져 부모와 경합 없음.
  - iframe URL만 교체하면 샘플 교실/운동장/체육관 등 여러 배경 프리셋을 정적 파일 추가만으로 확장 가능.
- **단점**
  - postMessage 프로토콜을 정의·유지해야 함 (아래 §8).
  - iframe의 포커스·스크린리더 연결을 명시적으로 설계해야 함.
- **권장도**: 높음. pickme의 "빌드리스·정적 배포" 철학과 정합.

### 옵션 C. ES 모듈 임포트 동적 로드 + Three 전역 공존

- **내용**: 기존 스크립트는 그대로 두고, 새 테마에서 동적 `import()`로 Three r180 + Spark를 가져옴.
- **장점**: iframe 불필요.
- **단점**: 같은 Realm에 Three 두 버전이 공존 → 기존 r128 전역 `THREE`와 새 모듈 버전이 상호 오염될 수 있다. 삼자 공유 상태(WebGLRenderer, Texture cache)에서 디버깅이 어려워진다.
- **권장도**: 낮음.

> **결정**: **옵션 B (iframe 격리)** 채택.

## 5. 제안 테마 "내 교실(My Classroom)" UX 설계

### 5.1 시나리오

1. 3단계 테마 선택 화면에 "🏫 내 교실" 카드 추가 (4번째 테마).
2. 선발 시작 시 전체 화면 iframe이 떠오르며 가우시안 스플랫 장면을 로드한다. 기본 제공 샘플 하나(교실 느낌의 공간)가 즉시 스트리밍된다.
3. 장면 안 허공에 학생 이름 카드(`THREE.Sprite` + 텍스트 텍스처)가 떠다닌다.
4. 라운드가 진행되면 카메라가 한 카드로 천천히 줌인 → 확정되면 셔터음 재생 → 카드가 반짝이며 `addPickedStudent` 메시지를 부모로 전달.
5. 모든 학생이 선발되면 iframe은 자동으로 해제된다.

### 5.2 배경 선택 UX

- **기본 배경**: 리포지토리에 샘플 `.spz` 1개 (10MB 이하로 압축된 작은 교실/공간).
- **업로드 옵션**: "내 교실 파일 불러오기" 버튼 — 로컬 `.ply`/`.spz`를 `<input type="file">`로 읽어 `URL.createObjectURL()`로 iframe에 전달. 업로드 서버 불필요, 프라이버시 보전.
- **샘플 갤러리(추후)**: 공개 3DGS 장면 몇 개를 외부 CDN(Vercel Blob 등)에 올리고 URL만 참조. 저장소 비대화 회피.

### 5.3 접근성 설계

- iframe 로드 직후 부모의 aria-live 영역에 "내 교실 테마가 시작됩니다. (학생 수) 명을 뽑습니다." 안내.
- 기존 `announceToScreenReader()` 경로를 iframe → 부모 postMessage로 그대로 이어 사용.
- **키보드 조작**: ESC = 기존 일시정지 플로우 유지. 공간 탐색 기능은 필수 아님 — 카메라는 자동 연출만.
- **시각 효과 비의존 원칙**: 선발 결정은 오디오 신호(셔터음)와 aria-live 알림으로 완결. 시각적 줌인은 보조적.

## 6. 파일 구조 변경

```
pickme/
├── docs/
│   └── spark-integration.md         # (이 문서)
├── themes/
│   ├── roulette.js                  # 변경 없음
│   ├── lottery.js                   # 변경 없음
│   ├── fishing.js                   # 변경 없음
│   ├── my-classroom.js              # 신규: iframe 생성 + postMessage 브리지
│   └── my-classroom/                # 신규: iframe 내부 자산 번들
│       ├── index.html               #   - 자체 import map, Three r180 + Spark
│       ├── scene.js                 #   - 스플랫 로드·카드 배치·카메라 연출
│       └── assets/
│           └── sample.spz           #   - (선택) 샘플 장면 1개
├── index.html                       # 테마 선택 UI에 "🏫 내 교실" 카드 추가
├── app.js                           # runThemeAnimation에 my-classroom 분기 추가
└── styles.css                       # 테마 카드 스타일 1개 추가
```

## 7. 외부 인터페이스 (테마 시그니처 준수 방법)

부모 쪽 어댑터(`themes/my-classroom.js`)가 기존 인터페이스를 그대로 구현한다.

```js
// themes/my-classroom.js (스케치)
async function runMyClassroomAnimation(canvas, selectedStudents, addPickedStudent) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.src = 'themes/my-classroom/index.html';
    iframe.title = '내 교실 3D 배경'; // a11y
    iframe.setAttribute('allow', 'fullscreen');
    // 기존 canvas 자리 위에 겹쳐 띄우는 CSS는 styles.css에서 처리
    canvas.parentElement.appendChild(iframe);

    const channel = new MessageChannel();
    iframe.addEventListener('load', () => {
      iframe.contentWindow.postMessage(
        { type: 'init', students: selectedStudents },
        '*',
        [channel.port2]
      );
    });

    channel.port1.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === 'picked') {
        addPickedStudent(msg.student);
      } else if (msg.type === 'done') {
        iframe.remove();
        resolve();
      } else if (msg.type === 'announce') {
        // 기존 announceToScreenReader 재사용
        announceToScreenReader(msg.text);
      }
    };

    // 일시정지/중단 전파
    const tick = setInterval(() => {
      channel.port1.postMessage({
        type: 'state',
        isPaused: AppState.isPaused,
        shouldStop: AppState.shouldStop,
      });
      if (AppState.shouldStop) clearInterval(tick);
    }, 100);
  });
}
```

## 8. 부모 ↔ iframe postMessage 프로토콜

| 방향 | type | 페이로드 | 시점 |
|------|------|----------|------|
| 부모 → iframe | `init` | `{ students: [...] }` + MessagePort | iframe load 직후 1회 |
| 부모 → iframe | `state` | `{ isPaused, shouldStop }` | 100ms마다 폴링 |
| iframe → 부모 | `picked` | `{ student }` | 한 명 확정 시마다 |
| iframe → 부모 | `announce` | `{ text }` | 주요 이벤트 (aria-live 중계) |
| iframe → 부모 | `done` | 없음 | 모든 선발 완료 시 1회 |

- MessageChannel을 쓰는 이유: 부모가 iframe의 전역 `window.postMessage` 리스너를 오염시키지 않고 전용 채널로 분리.
- 출처 제한은 같은 GitHub Pages 도메인이므로 origin 검증은 `location.origin` 단일 매칭으로 충분.

## 9. iframe 내부 구현 메모 (scene.js)

```js
// themes/my-classroom/scene.js (스케치)
import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';

let state = { isPaused: false, shouldStop: false };
let port;

window.addEventListener('message', (ev) => {
  if (ev.data?.type === 'init') {
    port = ev.ports[0];
    port.onmessage = (m) => {
      if (m.data?.type === 'state') state = m.data;
    };
    start(ev.data.students);
  }
});

async function start(students) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const splat = new SplatMesh({ url: 'assets/sample.spz' });
  scene.add(splat);

  // 학생 이름 카드를 THREE.Sprite로 배치 (스케치)
  const cards = students.map(createNameCard);
  cards.forEach(c => scene.add(c));

  renderer.setAnimationLoop(() => {
    if (state.shouldStop) { port?.postMessage({ type: 'done' }); return; }
    if (!state.isPaused) { /* 연출 업데이트 */ }
    renderer.render(scene, camera);
  });

  for (const card of cards) {
    if (state.shouldStop) break;
    await zoomIntoCard(camera, card, () => !state.isPaused && !state.shouldStop);
    port.postMessage({ type: 'announce', text: `${card.student.name} 선발` });
    port.postMessage({ type: 'picked', student: card.student });
  }
  port.postMessage({ type: 'done' });
}
```

Three r180은 iframe 내부 import map에서 CDN으로 가져오므로 npm 설치·번들 과정 없음.

```html
<!-- themes/my-classroom/index.html (스케치) -->
<script type="importmap">
{
  "imports": {
    "three": "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.180.0/three.module.js",
    "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/2.0.0/spark.module.js"
  }
}
</script>
<script type="module" src="scene.js"></script>
```

## 10. 스플랫 자산 호스팅 전략

1. **MVP**: 리포에 `.spz` 1개만 포함. 10MB 이하로 의도적으로 다운샘플링된 작은 공간. Git LFS 사용 불가(Pages 대역폭 이슈)이므로 일반 Git 커밋.
2. **확장 단계**: 추가 샘플은 외부 공개 CDN(Vercel Blob, Cloudflare R2 공개 버킷, Zenodo 등)에 올리고 URL만 기록. 리포 크기 비대화 회피.
3. **사용자 자산**: `<input type="file" accept=".ply,.spz,.ksplat,.splat">` + `URL.createObjectURL()`로 인-메모리 로드. 업로드 서버 없음.

## 11. 위험과 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| 모바일 저사양 기기에서 Spark가 프레임 드랍 | 룰렛/로또보다 느려 체감 나쁨 | 기본 샘플을 소형으로 유지, 자동 품질 저하(LoD 기본값 신뢰). UX상 "내 교실"은 권장 사양 기기 우선으로 표기. |
| Spark 버전 업그레이드 시 API 변경 | 린 깨짐 | import map의 `@2.0.0` 고정. 업그레이드는 별도 PR. |
| postMessage 타이밍 레이스(초기 init 전 tick 송신) | 초기 상태 누락 | iframe이 `ready` 메시지를 먼저 보내고 부모가 받은 후에만 tick 시작하도록 보강. |
| iframe fullscreen 전환 시 ESC 흐름 간섭 | 일시정지가 안 먹힘 | `keydown` 리스너를 부모·iframe 양쪽에 두고 동일 플래그로 제어. |
| 스크린리더가 iframe 경계에서 혼동 | 사용자 본인에게 직접 영향 | 주요 알림은 **부모의 aria-live**에 모아서 읽히게 한다. iframe 내부는 순수 시각 효과. |
| GitHub Pages 캐시 때문에 새 자산 반영 지연 | 디버깅 혼선 | 파일명에 해시 부여(`sample-<hash>.spz`) 또는 쿼리스트링 캐시버스터. |

## 12. 미해결 질문(결정 필요)

1. 샘플 배경을 어디서 구할지 — 직접 촬영 vs 공개 데이터셋(CC 라이선스 검증 필요).
2. 카드 렌더링을 `THREE.Sprite`로 할지, iframe 내부 HTML 오버레이(DOM)로 할지. DOM 오버레이가 접근성에 유리하나 Spark의 깊이 정렬과 충돌 가능.
3. "내 교실" 업로드 시 학교·학생 초상권이 함께 찍힐 수 있음 — UI에 가이드 문구·사전 모자이크 권고 필요.

## 13. 구현 작업 순서 (체크리스트)

- [ ] `themes/my-classroom/` 뼈대 작성 (`index.html`, `scene.js`)
- [ ] 부모 어댑터 `themes/my-classroom.js` 작성
- [ ] `index.html`에 테마 카드 추가, `app.js`의 `runThemeAnimation`에 분기 추가
- [ ] `styles.css`에 iframe 오버레이 스타일, 테마 카드 아이콘
- [ ] 샘플 `.spz` 1개 확보·커밋 (10MB 이하)
- [ ] postMessage 프로토콜 상세 구현 + `ready` 핸드셰이크
- [ ] aria-live 경로로 알림 연결, 로컬 스크린리더로 수동 검증
- [ ] 모바일(iOS Safari / Android Chrome)에서 프레임레이트 실측
- [ ] 문서 업데이트: README "테마별 특징"에 "내 교실" 항목 추가

## 14. 범위 외 (이번 통합에서는 하지 않음)

- 스플랫 실시간 촬영·생성 기능 (Polycam 등 외부 앱에 위임).
- 공간 탐색용 OrbitControls 노출 (연출 자동화만 제공).
- 로그인·업로드 서버 백엔드 (pickme의 "빌드리스·정적" 원칙 유지).

---

승인되면 체크리스트의 위에서부터 순차 구현한다. 중간 산출물은 별도 문서 없이 커밋 메시지로 기록한다.
