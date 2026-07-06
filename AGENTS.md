> 🤖 **이 파일은 자동 생성됩니다. 직접 수정하지 마세요.**
> 정본은 `CLAUDE.md` 입니다. 내용을 바꾸려면 `CLAUDE.md` 를 수정한 뒤
> 프로젝트 루트에서 `python sync_agent_docs.py` 를 실행하세요.
> 이 파일을 직접 고치면 다음 동기화 때 경고와 함께 덮어쓰기 대상이 됩니다.

<!-- SYNC-BODY-START: 이 줄 아래 본문은 CLAUDE.md 와 100% 동일하게 자동 생성됨 -->
이 프로젝트는 빌드 도구 없는 바닐라 HTML/CSS/JS 프로젝트이다.

- HTML: 단일 페이지 위저드 UI
- CSS: 전체 스타일, 반응형, 접근성
- JavaScript: 상태 관리, 파일 파싱 결과 처리, 선발 로직, Three.js 애니메이션 실행
- Three.js: 룰렛 / 로또 / 낚시 테마 애니메이션

## Development

정적 파일만으로 구성되어 빌드/번들링 과정이 없다.  
아무 HTTP 서버로 루트 디렉터리를 서빙하면 된다.

```bash
# 로컬 개발 서버 예시
npx serve .

# 또는 Python
python -m http.server 8000

배포: GitHub Pages

https://engccer.github.io/pickme/
Architecture
파일 구조와 역할
index.html
단일 페이지. 3-step 위저드 UI, 애니메이션 영역, 결과 화면을 포함한다.
styles.css
전체 스타일링, 반응형 레이아웃, 접근성 스타일을 담당한다.
app.js
핵심 로직 전체. AppState 전역 객체로 상태를 관리한다.
sounds.js
SoundManager 클래스. Web Audio API로 효과음/배경음을 합성한다. 외부 오디오 파일은 사용하지 않는다.
file-parsers.js
CSV, TSV, TXT, MD, Excel, DOCX, HWPX, PDF 등 다양한 명단 파일을 파싱한다.
themes/roulette.js
룰렛 테마 Three.js 애니메이션.
themes/lottery.js
로또 테마 Three.js 애니메이션.
themes/fishing.js
낚시 테마 Three.js 애니메이션.
핵심 흐름
initElements() / initEventListeners()
DOMContentLoaded 이후 DOM 요소를 바인딩하고 이벤트를 연결한다.
Step 1: 학생 명단 불러오기
파일 업로드: FileParsers.parseFile
직접 입력: handleManualInput
최근 학급: loadRecentClass
결과는 AppState.students[]에 저장된다.
Step 2: 선발 조건 설정
선발 인원
성별 조건
역할명
validateStep2()로 유효성을 검사한다.
Step 3: 테마 선택 및 선발 시작
테마 선택
startPicking()
performPicking()
runThemeAnimation()
결과 표시
displayResults()
계속 선발하기: continuePicking()
다시 설정하고 선발: resetSettings()
종료: resetApp()
Important Implementation Rules
기능 보존

코드 수정 시 기존 기능을 깨뜨리면 안 된다.

특히 다음 id는 JavaScript와 연결되어 있을 가능성이 높으므로 임의로 삭제하거나 변경하지 않는다.

csvFile
fileSelectBtn
fileInfo
fileDeleteBtn
sampleDownloadBtn
csvPreviewSection
csvPreviewCount
csvPreviewList
manualGrade
manualClass
manualNames
autoNumber
genderFemale
genderMale
genderNone
manualPreviewSection
previewCount
previewList
recentClassesList
recentEmptyMsg
recentPreviewSection
recentPreviewCount
recentPreviewList
studentCount
totalStudents
step1
step2
step3
stepResult
step1Next
step2Back
step2Next
step3Back
startBtn
totalPick
useGenderFilter
genderSettings
femalePick
malePick
purpose
animationContainer
threeCanvas
animationMessage
pickedStudentsLive
pauseBtn
pauseMenu
resumeBtn
backToStartBtn
resultTitle
congratulationsMessage
resultContainer
saveResultBtn
continuePickBtn
resetSettingsBtn
resetBtn
srAnnounce
genderSumHint
테마 값 보존

다음 data-theme 값은 기존 애니메이션 로직과 연결될 수 있으므로 변경하지 않는다.

roulette
lottery
fishing
접근성 보존

다음 접근성 관련 속성과 구조는 삭제하지 않는다.

aria-label
aria-live
aria-atomic
aria-selected
aria-controls
aria-labelledby
role
tabindex
스크린 리더 전용 영역
키보드 포커스 스타일
focus-visible 스타일

접근성 속성을 수정할 경우, 의미가 더 명확해지는 방향으로만 수정한다.

Design Direction
Core Principle

Pick Me는 랜딩페이지가 아니라 수업 중 사용하는 실용 도구이다.

따라서 기본 화면은 단순하고 명확해야 한다.
디자인의 힘은 설정 화면 전체가 아니라 다음 두 순간에 집중한다.

테마 선택과 선발 시작 버튼
선발 애니메이션과 결과 화면

최종 목표:

평소에는 단정한 교사용 도구,
선발 순간에는 룰렛·로또·낚시 각자의 방식이 살아나는 앱.

Pick Me는 하나의 공통 발표 무대 앱이 아니다.
룰렛 / 로또 / 낚시 3가지 독립 선발 방식을 가진 교사용 학생 추첨 앱이다.
Layout Principle

기본 구조는 중앙 중심의 단일 패널 레이아웃을 유지한다.

권장 구조:

상단: 간결한 브랜드 헤더
중앙: 현재 단계의 핵심 폼 카드
하단: 이전 / 다음 / 선발 시작 버튼
선발 중: 전체 화면 애니메이션 모드
결과: 중앙 집중형 결과 화면

피해야 할 구조:

좌측 사이드바 중심 구조
복잡한 대시보드형 구조
장식용 미리보기 패널
과도한 다중 컬럼 구성
앱의 목적보다 장식이 먼저 보이는 구조
Visual Tone

기본 화면은 다음 기준을 따른다.

깨끗한 배경
넓은 여백
명확한 입력 영역
읽기 쉬운 타이포그래피
적당한 카드 반경
절제된 그림자
명확한 버튼 위계

시각적 개성은 제한적으로 사용한다.

허용되는 포인트:

테마 카드의 작은 그래픽 요소
선발 시작 버튼의 약한 강조
결과 카드의 시각적 임팩트
각 테마 애니메이션의 고유한 정체성

피해야 할 표현:

과도한 그라데이션
과도한 반짝임 효과
의미 없는 배지 남발
영어 라벨 남발
장식 목적의 스티커 요소 과다 사용
모든 요소를 카드로 감싸는 방식
설정 화면 전체가 계속 움직이는 모션
무료 게임 UI처럼 보이는 과한 장난감 느낌
템플릿형 SaaS 랜딩페이지처럼 보이는 구성
Color Strategy

색은 디자인의 주인공이 아니라 상태와 강조를 돕는 보조 수단이다.

권장 기본 컬러:

--bg: #FAFAF7;
--surface: #FFFFFF;
--ink: #111827;
--muted: #6B7280;
--line: rgba(17, 24, 39, 0.10);

권장 포인트 컬러:

--pink: #FF5DA2;
--violet: #8B5CF6;
--cyan: #22D3EE;
--lime: #C7F464;
--yellow: #FFE66D;
--navy: #101827;

사용 기준:

기본 설정 화면: 포인트 컬러 10% 이하
테마 선택 화면: 포인트 컬러 20~30%
애니메이션 화면: 포인트 컬러 40%까지 허용
결과 화면: 이름과 결과 카드에만 강한 강조 사용
Typography

Pretendard를 기본 서체로 유지한다.

원칙:

한국어 UI 중심
짧고 명확한 문장
설명문은 1~2줄 이내
버튼 텍스트는 직관적으로
영어는 장식이 아니라 보조 감도 요소로만 제한
과도한 letter-spacing 사용 금지
h1, h2, 버튼, 입력 라벨의 위계를 명확히 한다
Component Guidelines
Header

헤더는 낮고 간결해야 한다.

포함 요소:

Pick Me
짧은 설명
앱 사용법 버튼

허용:

작은 심볼 하나
작은 배지 하나

금지:

큰 브랜드 영역
과도한 스티커
여러 개의 영어 라벨
앱 기능보다 로고가 더 튀는 구조
Stepper

3단계 흐름은 단순해야 한다.

단계:

명단
조건
선발

원칙:

가로형 progress 유지
active 상태는 명확하게
completed 상태는 check 등으로 표시 가능
inactive 상태는 낮은 대비
stepper가 화면의 주인공처럼 보이면 안 된다
Step 1: 명단 불러오기

목표는 사용자가 즉시 이해하는 것이다.

원칙:

파일 업로드 영역은 크고 명확하게
직접 입력 탭은 넓고 편하게
최근 학급은 비어 있을 때도 명확하게
지원 확장자는 작은 chip으로 정리
hover / focus 상태는 명확히 표현

피해야 할 것:

과도한 티켓 장식
복잡한 드롭존 구조
장식 때문에 클릭 위치가 불분명해지는 것
Step 2: 조건 설정

목표는 실수 없이 빠르게 설정하는 것이다.

원칙:

선발 인원 입력을 가장 명확하게
성별 조건은 켜고 끄기 쉬워야 함
역할 입력은 선택사항임이 분명해야 함
숫자 입력 옆 단위는 명확히 표시
Step 3: 테마 선택

이 화면에서만 약간의 장난기와 개성을 허용한다.

원칙:

테마 카드는 3개가 동일한 크기와 위계를 가진다
각 카드 상단에 작은 추상 그래픽을 둘 수 있다
선택된 카드는 색상뿐 아니라 형태나 상태 표시로 구분한다
hover 시 약한 lift 효과 허용
선택 상태는 접근성에도 반영한다

피해야 할 것:

카드마다 너무 많은 도형
배경 전체를 강한 컬러로 채우는 것
과도한 회전, 흔들림, 튀는 애니메이션
선발 시작 버튼

이 버튼은 기본 화면에서 가장 강한 CTA다.

원칙:

크고 명확한 버튼
텍스트는 “선발 시작”
보조 텍스트는 필요할 때만 사용
hover / active / focus 상태가 명확해야 함
과도한 장식은 금지
Animation Mode (선발 화면 공통 base)

선발 애니메이션은 가장 임팩트가 있어야 하는 화면이다.
단, 룰렛·로또·낚시는 각자의 방식이 살아 있어야 하며,
세 테마를 하나의 공통 stage UI로 통합하지 않는다.
이 섹션은 세 테마가 공통으로 따르는 base 규칙만 정의한다.
각 테마의 정체성은 아래의 Picking Modes Direction을 따른다.

공통 base 원칙:

전체 화면 모드
어두운 배경
높은 대비
큰 글자
현재 선발 중인 학생 이름이 명확하게 보여야 함
선발된 학생은 하단 또는 측면에 누적 표시 가능
일시정지 버튼은 찾기 쉬워야 함
빔프로젝터에서도 읽기 쉬워야 함

공통 base 금지:

설정 화면과 같은 평면적 UI
배경 장식이 이름보다 튀는 것
과도한 모션
텍스트 가독성 저하
세 테마를 하나의 공통 stage UI로 통합
stage preview 패널 재도입
presentation stage / 발표 무대 컨셉으로 통합
영어 라벨 남발
sparkle, sticker, confetti 남발

Picking Modes Direction

Pick Me의 핵심은 3가지 독립 선발 방식이다.

roulette: 룰렛 방식
lottery: 로또 방식
fishing: 낚시 방식

이 값들은 기존 JavaScript와 연결되어 있으므로 변경하지 않는다.

룰렛 방식 (roulette)

회전, 감속, 선택 지점이 명확해야 한다.
사용자가 "룰렛이 멈춰서 학생이 뽑혔다"고 이해할 수 있어야 한다.
룰렛 조각, 포인터, 회전감이 핵심이다.
단순히 이름 카드가 뜨는 방식으로 대체하지 않는다.

로또 방식 (lottery)

공이 섞이고, 튀고, 하나씩 나오는 동작이 핵심이다.
사용자가 "공이 뽑혀서 학생이 선택됐다"고 이해할 수 있어야 한다.
학생 이름 또는 번호는 공, 캡슐, 추첨 결과와 자연스럽게 연결되어야 한다.
overlay UI가 3D 공 애니메이션을 과하게 가리면 안 된다.

낚시 방식 (fishing)

낚싯줄, 훅, 물결, 잡히는 동작이 핵심이다.
사용자가 "낚아서 학생이 뽑혔다"고 이해할 수 있어야 한다.
너무 유치한 캐릭터형 물고기 UI는 피한다.
깔끔한 라인, 물결, 태그, 오브젝트 중심으로 표현한다.

Common Rule

룰렛 / 로또 / 낚시는 하나의 공통 stage UI로 통합하지 않는다.
각 방식의 선발 경험과 애니메이션 정체성을 유지한다.
같은 threeCanvas를 공유하지만 scene/renderer/RAF는 테마 함수의 클로저 안에 격리되어 있어야 하며,
cleanup 후에는 RAF가 새 frame을 그리지 않도록 isDisposed 가드를 유지한다.
Result Screen

결과 화면은 단순하지만 기억에 남아야 한다.

원칙:

선발 결과 제목
당첨자 이름을 가장 크게
역할명이 있으면 보조 텍스트로 표시
여러 명이면 grid 또는 stack으로 정리
액션 버튼 위계를 명확히 한다

버튼 위계:

계속 선발하기: primary
결과 저장 / 다시 설정: secondary
종료: ghost 또는 low emphasis
Motion Guidelines

움직임은 제한적으로 사용한다.

허용:

버튼 hover
테마 카드 hover
선택 카드의 미세한 강조
선발 애니메이션
결과 카드 reveal

금지:

설정 화면 전체가 계속 움직이는 것
배경 장식이 지속적으로 움직이는 것
과도한 진입 애니메이션
사용자의 입력을 방해하는 모션

반드시 prefers-reduced-motion을 고려한다.

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
    scroll-behavior: auto;
  }
}
JavaScript Safety Rules
app.js 수정 전 기존 이벤트 바인딩을 확인한다.
elements 객체에서 참조하는 id/class를 삭제하지 않는다.
AppState 구조를 바꿀 경우 전체 흐름을 확인한다.
performPicking()의 선발 로직은 UI 수정 작업에서 건드리지 않는다.
테마 함수의 시그니처를 변경하지 않는다.
사용자 명단 데이터(학생 이름·역할명·시트명 등)는 innerHTML 문자열 보간으로 출력하지 않는다. textContent로 주입하거나 escapeHtml()로 이스케이프한다(XSS·렌더링 깨짐 방지). 결과 화면(createResultItem)·시트 선택 UI·renderRecentClasses가 이 패턴을 따르며, 테마 파일들도 이름을 textContent로만 렌더링한다.
빌드 과정이 없으므로 JS 수정 후 node --check app.js file-parsers.js 로 문법을 검증한다.

테마 함수 시그니처:

runRouletteAnimation(canvas, selectedStudents, addPickedStudent)
runLotteryAnimation(canvas, selectedStudents, addPickedStudent)
runFishingAnimation(canvas, selectedStudents, addPickedStudent)
Data and Storage

최근 학급은 localStorage에 저장된다.

pickme-recent-classes

같은 학생 구성이면 중복 저장하지 않고 timestamp만 갱신한다.

비밀 선발 기능은 CSV의 비밀선발 열과 연결된다.
이 기능은 UI 수정 중 삭제하거나 무력화하지 않는다.

Korean Language

UI 텍스트, 변수 주석, CSV 헤더는 한국어 맥락을 유지한다.

원칙:

교사가 바로 이해할 수 있는 표현 사용
지나치게 마케팅적인 문구 금지
불필요한 영어 문구 남발 금지
학생 이름, 학년, 반, 번호, 성별 등 학교 맥락을 자연스럽게 유지
Before Editing

수정 전 반드시 다음을 확인한다.

index.html
styles.css
app.js
필요한 경우 themes/ 파일

수정 전 먼저 어떤 파일을 왜 바꿀지 간단히 계획한다.

After Editing Checklist

수정 후 아래를 점검한다.

기존 id가 유지되었는가?
기존 이벤트가 깨지지 않았는가?
파일 업로드가 작동하는가?
직접 입력이 작동하는가?
최근 학급이 작동하는가?
Step 1 → Step 2 → Step 3 흐름이 유지되는가?
테마 선택이 작동하는가?
선발 시작 버튼이 작동하는가?
애니메이션 화면이 표시되는가?
결과 화면이 표시되는가?
계속 선발하기 / 다시 설정 / 종료가 작동하는가?
키보드 포커스가 보이는가?
스크린 리더 영역이 유지되는가?
모바일 화면에서 레이아웃이 깨지지 않는가?
디자인이 과하게 장식적이지 않은가?
기본 화면은 단순하고, 선발 순간은 충분히 임팩트 있는가?
Temporary Preferences

일시적인 디자인 실험 방향을 memory에 저장하지 않는다.
사용자가 명시적으로 요청하지 않는 한 새로운 디자인 취향이나 임시 방향성을 CLAUDE.md에 추가하지 않는다.