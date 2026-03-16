# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pick Me는 교사용 무작위 학생 선발 웹앱. 룰렛/로또/낚시 3가지 테마의 Three.js 3D 애니메이션으로 학생을 선발한다. 빌드 도구 없는 바닐라 HTML/CSS/JS 프로젝트.

## Development

정적 파일만으로 구성되어 빌드/번들링 과정 없음. 아무 HTTP 서버로 루트 디렉터리를 서빙하면 된다.

```bash
# 로컬 개발 서버 (예시)
npx serve .
# 또는 Python
python -m http.server 8000
```

배포: GitHub Pages (`https://engccer.github.io/pickme/`)

## Architecture

### 파일 구조와 역할

- **`index.html`** — 단일 페이지. 3-step 위저드 UI (명단 → 조건 → 테마/선발) + 결과 화면
- **`app.js`** (~1700줄) — 핵심 로직 전체. `AppState` 전역 객체로 상태 관리
- **`styles.css`** — 전체 스타일링, 반응형, 접근성
- **`sounds.js`** — `SoundManager` 클래스. Web Audio API로 효과음/배경음 합성 (외부 오디오 파일 없음)
- **`themes/`** — 테마별 Three.js 애니메이션. 각 파일이 하나의 async 함수를 export
  - `roulette.js` → `runRouletteAnimation(canvas, selectedStudents, addPickedStudent)`
  - `lottery.js` → `runLotteryAnimation(...)`
  - `fishing.js` → `runFishingAnimation(...)`

### 핵심 흐름

1. `initElements()` / `initEventListeners()` — DOM 바인딩 (DOMContentLoaded)
2. Step 1: 파일 업로드(`FileParsers.parseFile`) / 직접 입력(`handleManualInput`) / 최근 학급(`loadRecentClass`) → `AppState.students[]`
3. Step 2: 인원/성별/역할 설정 → `validateStep2()`
4. Step 3: 테마 선택 → `startPicking()` → `performPicking()` (선발 알고리즘) → `runThemeAnimation()` (Three.js)
5. 결과: `displayResults()` → `saveResults()` (텍스트 파일 다운로드)

### 주요 설계 포인트

- **전역 상태**: `AppState` 객체 하나에 모든 상태 집중. `elements` 객체에 DOM 참조 캐싱
- **다양한 파일 형식**: `file-parsers.js`의 `FileParsers.parseFile()`이 CSV/TSV/TXT/MD/Excel/DOCX/HWPX/PDF 파싱. CSV EUC-KR 인코딩 자동 감지
- **CSV 형식 자동 감지**: `detectFormat()`이 'grid'(자리표) vs 'roster'(명단) 형식 구분
- **최근 학급**: `localStorage` (`pickme-recent-classes` 키)에 최대 20개 학급 저장. 같은 학생 구성이면 중복 없이 timestamp 갱신
- **비밀 선발**: CSV의 `비밀선발` 열이 1인 학생 우선 선발. Ctrl+Shift+클릭 또는 더블클릭으로 일회성 제외 가능 (`disableSecretPickOnce`)
- **동명이인 처리**: `getDisplayName()`이 번호/반/학년 정보를 자동 부가
- **테마 인터페이스**: 각 테마 함수는 `(canvas, selectedStudents, addPickedStudent)` 시그니처. `addPickedStudent` 콜백으로 선발 결과를 실시간 UI에 반영
- **일시정지**: `AppState.isPaused` / `AppState.shouldStop` 플래그로 애니메이션 루프 제어
- **접근성**: ARIA 레이블, `aria-live` 영역, `announceToScreenReader()` 함수로 스크린 리더 지원. 키보드 네비게이션 지원

### 외부 의존성

- Three.js r128 (CDN: `cdnjs.cloudflare.com`)
- SheetJS (CDN: `cdn.sheetjs.com`) — Excel 파싱
- JSZip (CDN: `cdnjs.cloudflare.com`) — DOCX/HWPX 파싱
- pdf.js — PDF 파싱 (지연 로드)
- 그 외 빌드 의존성 없음 (package.json 없음)

## Korean Language

UI 텍스트, 변수 주석, CSV 헤더 모두 한국어. 코드 수정 시 한국어 맥락 유지할 것.
