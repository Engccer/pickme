// 전역 상태
const AppState = {
    students: [],
    excludedStudents: new Set(),
    selectedTheme: 'roulette',
    pickResults: [],
    currentStep: 1,
    isPaused: false,
    shouldStop: false,
    ambientSoundInterval: null,
    bgMusicInterval: null,
    pickedStudentsLive: [],
    currentInputMethod: 'csv', // 'csv' 또는 'manual'
    selectedGender: '', // '여', '남', '' (기본값: 표기 안 함)
    tempStudents: [], // 직접 입력 시 임시 저장
    disableSecretPickOnce: false // 일회성 비밀 선발 제외 플래그
};

// DOM 요소
const elements = {
    // 단계 컨테이너
    steps: [],
    progressSteps: [],

    // Step 1
    csvFile: null,
    fileSelectBtn: null,
    fileInfo: null,
    studentCount: null,
    totalStudents: null,
    step1Next: null,
    // Step 1 - 탭
    csvTab: null,
    manualTab: null,
    csvPanel: null,
    manualPanel: null,
    // Step 1 - CSV 업로드
    fileDeleteBtn: null,
    csvPreviewSection: null,
    csvPreviewCount: null,
    csvPreviewList: null,
    sampleDownloadBtn: null,
    // Step 1 - 직접 입력
    manualGrade: null,
    manualClass: null,
    manualNames: null,
    autoNumber: null,
    genderFemale: null,
    genderMale: null,
    genderNone: null,
    manualPreviewSection: null,
    previewCount: null,
    previewList: null,

    // Step 2
    totalPick: null,
    useGenderFilter: null,
    genderSettings: null,
    femalePick: null,
    malePick: null,
    purpose: null,
    step2Back: null,
    step2Next: null,

    // Step 3
    themeCards: [],
    step3Back: null,
    startBtn: null,

    // 애니메이션
    animationContainer: null,
    threeCanvas: null,
    animationMessage: null,
    pickedStudentsLiveEl: null,
    pauseBtn: null,

    // 중지 메뉴
    pauseMenu: null,
    resumeBtn: null,
    backToStartBtn: null,

    // 결과
    resultSection: null,
    congratulationsMessage: null,
    resultContainer: null,
    saveResultBtn: null,
    resetBtn: null,

    // 스크린 리더
    srAnnounce: null
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initEventListeners();
});

// DOM 요소 초기화
function initElements() {
    // 단계 컨테이너
    for (let i = 1; i <= 3; i++) {
        elements.steps[i] = document.getElementById(`step${i}`);
        elements.progressSteps[i] = document.querySelector(`.progress-step[data-step="${i}"]`);
    }

    // Step 1
    elements.csvFile = document.getElementById('csvFile');
    elements.fileSelectBtn = document.getElementById('fileSelectBtn');
    elements.fileInfo = document.getElementById('fileInfo');
    elements.studentCount = document.getElementById('studentCount');
    elements.totalStudents = document.getElementById('totalStudents');
    elements.step1Next = document.getElementById('step1Next');
    // Step 1 - 탭
    elements.csvTab = document.getElementById('csvTab');
    elements.manualTab = document.getElementById('manualTab');
    elements.csvPanel = document.getElementById('csvPanel');
    elements.manualPanel = document.getElementById('manualPanel');
    // Step 1 - CSV 업로드
    elements.fileDeleteBtn = document.getElementById('fileDeleteBtn');
    elements.csvPreviewSection = document.getElementById('csvPreviewSection');
    elements.csvPreviewCount = document.getElementById('csvPreviewCount');
    elements.csvPreviewList = document.getElementById('csvPreviewList');
    elements.sampleDownloadBtn = document.getElementById('sampleDownloadBtn');
    // Step 1 - 직접 입력
    elements.manualGrade = document.getElementById('manualGrade');
    elements.manualClass = document.getElementById('manualClass');
    elements.manualNames = document.getElementById('manualNames');
    elements.autoNumber = document.getElementById('autoNumber');
    elements.genderFemale = document.getElementById('genderFemale');
    elements.genderMale = document.getElementById('genderMale');
    elements.genderNone = document.getElementById('genderNone');
    elements.manualPreviewSection = document.getElementById('manualPreviewSection');
    elements.previewCount = document.getElementById('previewCount');
    elements.previewList = document.getElementById('previewList');

    // Step 2
    elements.totalPick = document.getElementById('totalPick');
    elements.useGenderFilter = document.getElementById('useGenderFilter');
    elements.genderSettings = document.getElementById('genderSettings');
    elements.femalePick = document.getElementById('femalePick');
    elements.malePick = document.getElementById('malePick');
    elements.purpose = document.getElementById('purpose');
    elements.step2Back = document.getElementById('step2Back');
    elements.step2Next = document.getElementById('step2Next');

    // Step 3
    elements.themeCards = document.querySelectorAll('.theme-card');
    elements.step3Back = document.getElementById('step3Back');
    elements.startBtn = document.getElementById('startBtn');

    // 애니메이션
    elements.animationContainer = document.getElementById('animationContainer');
    elements.threeCanvas = document.getElementById('threeCanvas');
    elements.animationMessage = document.getElementById('animationMessage');
    elements.pickedStudentsLiveEl = document.getElementById('pickedStudentsLive');
    elements.pauseBtn = document.getElementById('pauseBtn');

    // 중지 메뉴
    elements.pauseMenu = document.getElementById('pauseMenu');
    elements.resumeBtn = document.getElementById('resumeBtn');
    elements.backToStartBtn = document.getElementById('backToStartBtn');

    // 결과
    elements.resultSection = document.getElementById('stepResult');
    elements.congratulationsMessage = document.getElementById('congratulationsMessage');
    elements.resultContainer = document.getElementById('resultContainer');
    elements.saveResultBtn = document.getElementById('saveResultBtn');
    elements.resetBtn = document.getElementById('resetBtn');

    // 스크린 리더
    elements.srAnnounce = document.getElementById('srAnnounce');
}

// 이벤트 리스너 초기화
function initEventListeners() {
    // Step 1: 탭 전환
    elements.csvTab.addEventListener('click', () => switchInputTab('csv'));
    elements.manualTab.addEventListener('click', () => switchInputTab('manual'));

    // Step 1: CSV 파일 업로드
    elements.fileSelectBtn.addEventListener('click', () => {
        elements.csvFile.click();
    });
    elements.csvFile.addEventListener('change', handleFileUpload);
    elements.fileDeleteBtn.addEventListener('click', clearCsvFile);
    elements.sampleDownloadBtn.addEventListener('click', downloadSampleCSV);

    // Step 1: 직접 입력
    elements.manualNames.addEventListener('input', handleManualInput);
    elements.manualGrade.addEventListener('input', handleManualInput);
    elements.manualClass.addEventListener('input', handleManualInput);
    elements.autoNumber.addEventListener('change', handleManualInput);

    // 성별 토글
    elements.genderFemale.addEventListener('click', () => handleGenderToggle('여'));
    elements.genderMale.addEventListener('click', () => handleGenderToggle('남'));
    elements.genderNone.addEventListener('click', () => handleGenderToggle(''));

    elements.step1Next.addEventListener('click', () => goToStep(2));

    // Step 2: 설정
    elements.totalPick.addEventListener('input', validateStep2);
    elements.useGenderFilter.addEventListener('change', (e) => {
        elements.genderSettings.style.display = e.target.checked ? 'block' : 'none';
        validateStep2();
    });
    elements.femalePick.addEventListener('input', validateStep2);
    elements.malePick.addEventListener('input', validateStep2);
    elements.step2Back.addEventListener('click', () => goToStep(1));
    elements.step2Next.addEventListener('click', () => goToStep(3));

    // Step 3: 테마 선택
    elements.themeCards.forEach(card => {
        card.addEventListener('click', () => handleThemeSelect(card));
    });
    elements.step3Back.addEventListener('click', () => {
        // 앰비언트 사운드 중지
        if (AppState.ambientSoundInterval) {
            soundManager.stopSound(AppState.ambientSoundInterval);
            AppState.ambientSoundInterval = null;
        }
        goToStep(2);
    });
    elements.startBtn.addEventListener('click', (e) => {
        // Ctrl+Shift+클릭 시 비밀 선발 제외 (일회성)
        if (e.ctrlKey && e.shiftKey) {
            AppState.disableSecretPickOnce = true;
        } else {
            AppState.disableSecretPickOnce = false;
        }

        // 첫 클릭 시 사운드 초기화
        if (!soundManager.initialized) {
            soundManager.init();
        }
        // 앰비언트 사운드 중지
        if (AppState.ambientSoundInterval) {
            soundManager.stopSound(AppState.ambientSoundInterval);
            AppState.ambientSoundInterval = null;
        }
        startPicking();
    });

    // 중지/재개
    elements.pauseBtn.addEventListener('click', pausePicking);
    elements.resumeBtn.addEventListener('click', resumePicking);
    elements.backToStartBtn.addEventListener('click', () => {
        AppState.shouldStop = true;
        AppState.isPaused = false;
        elements.pauseMenu.style.display = 'none';
        elements.animationContainer.style.display = 'none';

        // 배경 음악 중지
        if (AppState.bgMusicInterval) {
            soundManager.stopSound(AppState.bgMusicInterval);
            AppState.bgMusicInterval = null;
        }

        // 버튼 상태 복원
        elements.pauseBtn.innerHTML = '⏸ 일시 정지';
        elements.pauseBtn.setAttribute('aria-label', '일시 정지');
        elements.pauseBtn.disabled = false;

        resetApp();
    });

    // 결과 버튼
    elements.saveResultBtn.addEventListener('click', saveResults);
    elements.resetBtn.addEventListener('click', resetApp);

    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        // ESC 키로 일시 중지
        if (e.key === 'Escape' && elements.animationContainer.style.display === 'block' && !AppState.isPaused) {
            pausePicking();
        }

        // Ctrl+Shift+/ 로 앱 사용법 열기
        if (e.ctrlKey && e.shiftKey && e.key === '?') {
            e.preventDefault();
            openUsageGuide();
        }
    });
}

// Step 2 유효성 검사
function validateStep2() {
    const totalPick = parseInt(elements.totalPick.value);
    const useGender = elements.useGenderFilter.checked;

    // 총 선발 인원이 유효한지 확인
    if (isNaN(totalPick) || totalPick < 1) {
        elements.step2Next.disabled = true;
        return;
    }

    // 성별 조건을 사용하는 경우
    if (useGender) {
        const femalePick = parseInt(elements.femalePick.value) || 0;
        const malePick = parseInt(elements.malePick.value) || 0;

        // 합계가 총 인원과 일치하는지 확인
        if (femalePick + malePick !== totalPick) {
            elements.step2Next.disabled = true;
            return;
        }
    }

    // 모든 조건을 만족하면 다음 버튼 활성화
    elements.step2Next.disabled = false;
}

// 테마 선택 처리
function handleThemeSelect(selectedCard) {
    const theme = selectedCard.dataset.theme;
    AppState.selectedTheme = theme;

    // 모든 카드 비활성화
    elements.themeCards.forEach(card => {
        card.setAttribute('aria-checked', 'false');
    });

    // 선택된 카드 활성화
    selectedCard.setAttribute('aria-checked', 'true');

    // 효과음 재생
    soundManager.playThemeSelectSound();

    // 스크린 리더 안내
    announceToScreenReader(`${selectedCard.querySelector('.theme-name').textContent} 테마 선택됨`);
}

// 단계 이동
function goToStep(stepNumber) {
    const currentStepEl = elements.steps[AppState.currentStep];
    const nextStepEl = elements.steps[stepNumber];

    if (!currentStepEl || !nextStepEl) return;

    // aria-live 영역 초기화
    if (elements.srAnnounce) {
        elements.srAnnounce.textContent = '';
    }

    // Step 1에서 Step 2로 이동 시, 직접 입력한 학생 저장
    if (AppState.currentStep === 1 && stepNumber === 2) {
        if (AppState.currentInputMethod === 'manual' && AppState.tempStudents) {
            AppState.students = AppState.tempStudents;

            // UI 업데이트
            elements.studentCount.style.display = 'block';
            elements.totalStudents.textContent = AppState.students.length;

            announceToScreenReader(`${AppState.students.length}명의 학생이 입력되었습니다`);
        }
    }

    // 애니메이션 방향 결정
    const direction = stepNumber > AppState.currentStep ? 'right' : 'left';

    // 현재 단계 숨김 애니메이션
    currentStepEl.classList.remove('active');
    currentStepEl.classList.add(direction === 'right' ? 'slide-out-left' : 'slide-out-right');

    // 애니메이션 완료 후 다음 단계 표시
    setTimeout(() => {
        currentStepEl.style.display = 'none';
        currentStepEl.classList.remove('slide-out-left', 'slide-out-right');

        nextStepEl.style.display = 'block';
        nextStepEl.classList.add('active');

        // 진행 표시기 업데이트
        updateProgressBar(stepNumber);

        // 단계별 추가 처리
        if (stepNumber === 3) {
            // 테마 선택 화면에 도달하면 앰비언트 사운드 재생
            if (!soundManager.initialized) {
                soundManager.init();
            }
            if (!AppState.ambientSoundInterval) {
                AppState.ambientSoundInterval = soundManager.playAmbientSound();
            }
        }

        AppState.currentStep = stepNumber;

        // 포커스를 제목으로 이동
        const title = nextStepEl.querySelector('h2');
        if (title) {
            title.focus();
        }
    }, 400);
}

// 진행 표시기 업데이트
function updateProgressBar(activeStep) {
    elements.progressSteps.forEach((step, index) => {
        if (step) {
            if (index <= activeStep) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        }
    });
}

// CSV 파일 업로드 처리
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        // UTF-8 BOM 처리를 위해 ArrayBuffer로 읽기
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // UTF-8 BOM 제거 (EF BB BF)
        let offset = 0;
        if (uint8Array.length >= 3 &&
            uint8Array[0] === 0xEF &&
            uint8Array[1] === 0xBB &&
            uint8Array[2] === 0xBF) {
            offset = 3;
        }

        // UTF-8 디코딩
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(uint8Array.slice(offset));

        parseCSV(text);

        elements.fileInfo.textContent = `${file.name} (${AppState.students.length}명)`;
        elements.fileInfo.style.color = 'var(--secondary-color)';

        // 파일 삭제 버튼 표시
        elements.fileDeleteBtn.style.display = 'inline-block';

        // CSV 미리보기 렌더링
        renderCsvPreview(AppState.students);

        // UI 업데이트
        elements.studentCount.style.display = 'block';
        elements.totalStudents.textContent = AppState.students.length;
        updateNextButtonLabel();
        elements.step1Next.disabled = false;

        announceToScreenReader(`${AppState.students.length}명의 학생 명단이 로드되었습니다`);

    } catch (error) {
        elements.fileInfo.textContent = '파일 읽기 오류: ' + error.message;
        elements.fileInfo.style.color = 'var(--danger-color)';
    }
}

// CSV 파싱
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    AppState.students = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length >= 5) {
            const student = {
                grade: values[0],
                class: values[1],
                number: values[2],
                name: values[3],
                gender: values[4],
                secretPick: values[5] === '1' || values[5]?.toLowerCase() === 'true'
            };
            AppState.students.push(student);
        }
    }
}

// Opt-out 리스트 렌더링
function renderOptoutList() {
    elements.optoutContainer.innerHTML = '';

    AppState.students.forEach((student, index) => {
        const label = document.createElement('label');
        label.className = 'student-checkbox';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `student-${index}`;
        checkbox.value = index;

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                AppState.excludedStudents.add(index);
                label.classList.add('excluded');
            } else {
                AppState.excludedStudents.delete(index);
                label.classList.remove('excluded');
            }
        });

        const info = document.createElement('div');
        info.className = 'student-info';
        info.innerHTML = `
            <div class="student-name">${student.name}</div>
            <div class="student-details">${student.grade}학년 ${student.class}반 ${student.number}번 (${student.gender})</div>
        `;

        label.appendChild(checkbox);
        label.appendChild(info);
        elements.optoutContainer.appendChild(label);
    });
}

// 학생 선발 시작
async function startPicking() {
    // 유효성 검사
    const totalPick = parseInt(elements.totalPick.value);
    if (isNaN(totalPick) || totalPick < 1) {
        alert('선발 인원을 1명 이상 입력해주세요.');
        return;
    }

    const useGender = elements.useGenderFilter.checked;
    let femalePick = 0, malePick = 0;

    if (useGender) {
        femalePick = parseInt(elements.femalePick.value) || 0;
        malePick = parseInt(elements.malePick.value) || 0;

        if (femalePick + malePick !== totalPick) {
            alert('성별별 인원의 합이 총 선발 인원과 일치해야 합니다.');
            return;
        }
    }

    // 선발 가능한 학생 필터링
    const availableStudents = AppState.students.filter((student, index) =>
        !AppState.excludedStudents.has(index)
    );

    if (availableStudents.length < totalPick) {
        alert('선발 가능한 학생 수가 부족합니다.');
        return;
    }

    // 선발 로직 실행
    AppState.pickResults = performPicking(availableStudents, {
        totalPick,
        useGender,
        femalePick,
        malePick
    });

    if (AppState.pickResults.length === 0) {
        alert('선발 조건을 만족하는 학생이 없습니다.');
        return;
    }

    // 초기화
    AppState.isPaused = false;
    AppState.pickedStudentsLive = [];
    elements.pickedStudentsLiveEl.innerHTML = '';

    // 애니메이션 실행
    await runThemeAnimation();

    // 결과 표시
    if (!AppState.isPaused) {
        displayResults();
    }
}

// 학생 선발 로직
function performPicking(availableStudents, options) {
    const { totalPick, useGender, femalePick, malePick } = options;
    const selected = [];

    // 비밀 선발 제외 모드 확인
    if (AppState.disableSecretPickOnce) {
        // 비밀 선발 무시하고 완전 랜덤 선발
        if (useGender) {
            // 성별 조건이 있는 경우
            const females = availableStudents.filter(s => s.gender === '여');
            const males = availableStudents.filter(s => s.gender === '남');

            // 여학생 랜덤 선발
            let femaleCount = 0;
            while (femaleCount < femalePick && females.length > 0) {
                const index = Math.floor(Math.random() * females.length);
                selected.push(females.splice(index, 1)[0]);
                femaleCount++;
            }

            // 남학생 랜덤 선발
            let maleCount = 0;
            while (maleCount < malePick && males.length > 0) {
                const index = Math.floor(Math.random() * males.length);
                selected.push(males.splice(index, 1)[0]);
                maleCount++;
            }
        } else {
            // 성별 조건 없이 랜덤 선발
            const students = [...availableStudents];
            while (selected.length < totalPick && students.length > 0) {
                const index = Math.floor(Math.random() * students.length);
                selected.push(students.splice(index, 1)[0]);
            }
        }

        // 플래그 초기화 (일회성)
        AppState.disableSecretPickOnce = false;

        return selected;
    }

    // 1단계: secret-pick 학생 우선 선발
    const secretStudents = availableStudents.filter(s => s.secretPick);

    if (useGender) {
        // 성별 조건이 있는 경우
        const secretFemales = secretStudents.filter(s => s.gender === '여');
        const secretMales = secretStudents.filter(s => s.gender === '남');

        // 여학생 선발
        let femaleCount = 0;
        secretFemales.forEach(student => {
            if (femaleCount < femalePick) {
                selected.push(student);
                femaleCount++;
            }
        });

        // 남학생 선발
        let maleCount = 0;
        secretMales.forEach(student => {
            if (maleCount < malePick) {
                selected.push(student);
                maleCount++;
            }
        });

        // 부족한 인원 랜덤 선발
        const remainingFemales = availableStudents.filter(s =>
            s.gender === '여' && !selected.includes(s)
        );
        const remainingMales = availableStudents.filter(s =>
            s.gender === '남' && !selected.includes(s)
        );

        while (femaleCount < femalePick && remainingFemales.length > 0) {
            const index = Math.floor(Math.random() * remainingFemales.length);
            selected.push(remainingFemales.splice(index, 1)[0]);
            femaleCount++;
        }

        while (maleCount < malePick && remainingMales.length > 0) {
            const index = Math.floor(Math.random() * remainingMales.length);
            selected.push(remainingMales.splice(index, 1)[0]);
            maleCount++;
        }

    } else {
        // 성별 조건이 없는 경우
        secretStudents.forEach(student => {
            if (selected.length < totalPick) {
                selected.push(student);
            }
        });

        // 부족한 인원 랜덤 선발
        const remaining = availableStudents.filter(s => !selected.includes(s));
        while (selected.length < totalPick && remaining.length > 0) {
            const index = Math.floor(Math.random() * remaining.length);
            selected.push(remaining.splice(index, 1)[0]);
        }
    }

    return selected;
}

// 테마 애니메이션 실행
async function runThemeAnimation() {
    // 테마 선택 화면 숨기기
    elements.steps[3].style.display = 'none';
    elements.steps[3].classList.remove('active');

    // 애니메이션 컨테이너 전체화면 표시
    elements.animationContainer.style.display = 'block';
    elements.animationContainer.classList.add('fullscreen-animation');

    // 배경 음악 시작 및 전역 상태에 저장
    AppState.bgMusicInterval = soundManager.playBackgroundMusic(AppState.selectedTheme);

    // 테마별 애니메이션 함수 호출 (학생 추가 콜백 전달)
    switch (AppState.selectedTheme) {
        case 'roulette':
            if (typeof runRouletteAnimation === 'function') {
                await runRouletteAnimation(elements.threeCanvas, AppState.pickResults, addPickedStudent);
            }
            break;
        case 'lottery':
            if (typeof runLotteryAnimation === 'function') {
                await runLotteryAnimation(elements.threeCanvas, AppState.pickResults, addPickedStudent);
            }
            break;
        case 'fishing':
            if (typeof runFishingAnimation === 'function') {
                await runFishingAnimation(elements.threeCanvas, AppState.pickResults, addPickedStudent);
            }
            break;
    }

    // 배경 음악 중지 (정상 완료 시에만)
    if (!AppState.shouldStop && AppState.bgMusicInterval) {
        soundManager.stopSound(AppState.bgMusicInterval);
        AppState.bgMusicInterval = null;
    }

    // 성공 사운드
    if (!AppState.isPaused && !AppState.shouldStop) {
        soundManager.playSuccess();
    }

    elements.animationContainer.style.display = 'none';
    elements.animationContainer.classList.remove('fullscreen-animation');
}

// 선발된 학생 추가 (애니메이션 중 호출)
function addPickedStudent(student) {
    if (AppState.isPaused) return;

    AppState.pickedStudentsLive.push(student);

    // 동명이인 처리
    const displayName = getDisplayName(student, AppState.pickedStudentsLive);

    // 화면에 표시
    const div = document.createElement('div');
    div.className = 'picked-student-item';
    div.textContent = displayName;
    elements.pickedStudentsLiveEl.appendChild(div);

    // 효과음
    soundManager.playStudentPickSound();

    // 스크린 리더 안내
    announceToScreenReader(`${displayName} 선발됨`);

    // 스크롤
    elements.pickedStudentsLiveEl.scrollTop = elements.pickedStudentsLiveEl.scrollHeight;
}

// 동명이인 처리 - 표시할 이름 생성
function getDisplayName(student, allStudents) {
    // 같은 이름을 가진 학생 찾기
    const sameNameStudents = allStudents.filter(s => s.name === student.name);

    // 동명이인이 없으면 이름만 반환
    if (sameNameStudents.length === 1) {
        return student.name;
    }

    // 동명이인이 있는 경우
    // 같은 학년, 같은 반인지 확인
    const sameClass = sameNameStudents.every(s =>
        s.grade === student.grade && s.class === student.class
    );

    if (sameClass) {
        // 같은 반이면 번호만 표시
        return `${student.name} (${student.number}번)`;
    }

    // 같은 학년인지 확인
    const sameGrade = sameNameStudents.every(s => s.grade === student.grade);

    if (sameGrade) {
        // 같은 학년이면 반과 번호 표시
        return `${student.name} (${student.class}반 ${student.number}번)`;
    }

    // 다른 학년이면 학년, 반, 번호 모두 표시
    return `${student.name} (${student.grade}학년 ${student.class}반 ${student.number}번)`;
}

// 일시 중지
function pausePicking() {
    AppState.isPaused = true;
    elements.pauseMenu.style.display = 'flex';

    // 버튼 문구 변경
    elements.pauseBtn.innerHTML = '⏸ 일시 정지됨';
    elements.pauseBtn.setAttribute('aria-label', '일시 정지됨');
    elements.pauseBtn.disabled = true;
}

// 재개
function resumePicking() {
    AppState.isPaused = false;
    elements.pauseMenu.style.display = 'none';

    // 버튼 문구 복원
    elements.pauseBtn.innerHTML = '⏸ 일시 정지';
    elements.pauseBtn.setAttribute('aria-label', '일시 정지');
    elements.pauseBtn.disabled = false;

    // 애니메이션은 자동으로 재개됨
}

// 결과 표시
function displayResults() {
    // 축하 메시지 표시
    const purpose = elements.purpose.value.trim();
    if (purpose) {
        elements.congratulationsMessage.style.display = 'block';
        elements.congratulationsMessage.innerHTML = `
            <h3>🎉 축하합니다! 🎉</h3>
            <p><strong>${purpose}</strong>로 선발된 것을 축하합니다!</p>
            <img src="https://media.giphy.com/media/g9582DNuQppxC/giphy.gif"
                 alt="축하 애니메이션"
                 class="congratulations-gif"
                 onerror="this.style.display='none'">
        `;
    } else {
        elements.congratulationsMessage.style.display = 'none';
    }

    elements.resultContainer.innerHTML = '';

    AppState.pickResults.forEach((student, index) => {
        const displayName = getDisplayName(student, AppState.pickResults);

        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <span class="result-number">${index + 1}</span>
            <div style="display: inline-block;">
                <div class="result-name">${displayName}</div>
            </div>
        `;
        elements.resultContainer.appendChild(div);
    });

    // 결과 화면 표시
    elements.steps[3].style.display = 'none';
    elements.steps[3].classList.remove('active');
    elements.resultSection.style.display = 'block';

    // 포커스
    const resultTitle = document.getElementById('resultTitle');
    if (resultTitle) {
        resultTitle.focus();
    }

    elements.resultSection.scrollIntoView({ behavior: 'smooth' });
}

// 결과 저장
function saveResults() {
    const purpose = elements.purpose.value || '선발';
    const timestamp = new Date().toLocaleString('ko-KR');

    let content = `=== ${purpose} 결과 ===\n`;
    content += `날짜: ${timestamp}\n`;
    content += `총 ${AppState.pickResults.length}명 선발\n\n`;

    AppState.pickResults.forEach((student, index) => {
        const displayName = getDisplayName(student, AppState.pickResults);
        content += `${index + 1}. ${displayName}\n`;
    });

    // 파일명 생성 (yymmdd_hhmmss_선발결과.txt)
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const filename = `${yy}${mm}${dd}_${hh}${min}${ss}_선발결과.txt`;

    // 파일 다운로드
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// 앱 초기화
function resetApp() {
    // 상태 초기화
    AppState.pickResults = [];
    AppState.excludedStudents.clear();
    AppState.currentStep = 1;
    AppState.isPaused = false;
    AppState.shouldStop = false;
    AppState.pickedStudentsLive = [];

    // 앰비언트 사운드 중지
    if (AppState.ambientSoundInterval) {
        soundManager.stopSound(AppState.ambientSoundInterval);
        AppState.ambientSoundInterval = null;
    }

    // 배경 음악 중지
    if (AppState.bgMusicInterval) {
        soundManager.stopSound(AppState.bgMusicInterval);
        AppState.bgMusicInterval = null;
    }

    // UI 초기화
    elements.resultSection.style.display = 'none';
    elements.pauseMenu.style.display = 'none';
    elements.animationContainer.classList.remove('fullscreen-animation');
    elements.pickedStudentsLiveEl.innerHTML = '';
    // aria-live 영역 초기화
    if (elements.srAnnounce) {
        elements.srAnnounce.textContent = '';
    }
    elements.steps.forEach((step, index) => {
        if (step && index > 0) {
            step.style.display = 'none';
            step.classList.remove('active');
        }
    });

    // 1단계로 이동
    elements.steps[1].style.display = 'block';
    elements.steps[1].classList.add('active');
    updateProgressBar(1);

    // 스크롤 최상단
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 포커스
    const step1Title = document.getElementById('step1Title');
    if (step1Title) {
        step1Title.focus();
    }
}

// 스크린 리더 안내
function announceToScreenReader(message) {
    if (elements.srAnnounce) {
        elements.srAnnounce.textContent = '';
        setTimeout(() => {
            elements.srAnnounce.textContent = message;
            // 3초 후 자동 삭제
            setTimeout(() => {
                elements.srAnnounce.textContent = '';
            }, 3000);
        }, 100);
    }
}

// ===== 직접 입력 기능 =====

// 탭 전환
function switchInputTab(method) {
    AppState.currentInputMethod = method;

    // 탭 버튼 상태 업데이트
    if (method === 'csv') {
        elements.csvTab.classList.add('active');
        elements.manualTab.classList.remove('active');
        elements.csvTab.setAttribute('aria-selected', 'true');
        elements.manualTab.setAttribute('aria-selected', 'false');

        // 패널 전환
        elements.csvPanel.classList.add('active');
        elements.manualPanel.classList.remove('active');
    } else {
        elements.manualTab.classList.add('active');
        elements.csvTab.classList.remove('active');
        elements.manualTab.setAttribute('aria-selected', 'true');
        elements.csvTab.setAttribute('aria-selected', 'false');

        // 패널 전환
        elements.manualPanel.classList.add('active');
        elements.csvPanel.classList.remove('active');
    }
}

// 성별 토글 처리
function handleGenderToggle(gender) {
    AppState.selectedGender = gender;

    // 모든 버튼 비활성화
    [elements.genderFemale, elements.genderMale, elements.genderNone].forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
    });

    // 선택된 버튼 활성화
    if (gender === '여') {
        elements.genderFemale.classList.add('active');
        elements.genderFemale.setAttribute('aria-checked', 'true');
    } else if (gender === '남') {
        elements.genderMale.classList.add('active');
        elements.genderMale.setAttribute('aria-checked', 'true');
    } else {
        elements.genderNone.classList.add('active');
        elements.genderNone.setAttribute('aria-checked', 'true');
    }

    // 새로운 성별로 미리보기 업데이트
    handleManualInput();
}

// 직접 입력 처리
function handleManualInput() {
    const namesText = elements.manualNames.value.trim();

    // 이름이 없으면 미리보기 숨김
    if (!namesText) {
        elements.manualPreviewSection.style.display = 'none';
        elements.step1Next.disabled = true;
        return;
    }

    // 이름 파싱
    const names = parseManualNames(namesText);

    if (names.length === 0) {
        elements.manualPreviewSection.style.display = 'none';
        elements.step1Next.disabled = true;
        return;
    }

    // 공통 정보 가져오기
    const grade = elements.manualGrade.value.trim();
    const classNum = elements.manualClass.value.trim();
    const autoNumber = elements.autoNumber.checked;
    const gender = AppState.selectedGender;

    // 학생 객체 배열 생성
    const students = names.map((name, index) => ({
        grade: grade || '-',
        class: classNum || '-',
        number: autoNumber ? String(index + 1) : '-',
        name: name,
        gender: gender || '-',
        secretPick: false
    }));

    // 임시 저장 (미리보기용)
    AppState.tempStudents = students;

    // 미리보기 렌더링
    renderPreview(students);

    // 다음 버튼 활성화 및 라벨 업데이트
    updateNextButtonLabel();
    elements.step1Next.disabled = false;
}

// 이름 파싱 (줄바꿈, 콤마, 공백으로 구분)
function parseManualNames(text) {
    return text
        .split(/[\n,\s]+/)  // 줄바꿈, 콤마, 공백을 구분자로 사용
        .map(name => name.trim())
        .filter(name => name.length > 0);
}

// 미리보기 렌더링
function renderPreview(students) {
    elements.previewList.innerHTML = '';
    elements.previewCount.textContent = students.length;
    elements.manualPreviewSection.style.display = 'block';

    students.forEach((student, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';

        // 학생 정보
        const info = document.createElement('div');
        info.className = 'preview-info';

        // 이름 (읽기 전용)
        const nameLine = document.createElement('div');
        nameLine.className = 'preview-name';
        nameLine.textContent = student.name;
        info.appendChild(nameLine);

        // 상세 정보 (편집 가능)
        const detailLine = document.createElement('div');
        detailLine.className = 'preview-details-editable';

        // 학년/반 (읽기 전용)
        if (student.grade !== '-' || student.class !== '-') {
            const gradeClass = document.createElement('span');
            gradeClass.className = 'preview-grade-class';
            const parts = [];
            if (student.grade !== '-') parts.push(`${student.grade}학년`);
            if (student.class !== '-') parts.push(`${student.class}반`);
            gradeClass.textContent = parts.join(' ');
            detailLine.appendChild(gradeClass);
        }

        // 번호 (편집 가능)
        const numberWrapper = document.createElement('span');
        numberWrapper.className = 'preview-number-wrapper';
        const numberInput = document.createElement('input');
        numberInput.type = 'text';
        numberInput.className = 'preview-number-input';
        numberInput.value = student.number === '-' ? '' : student.number;
        numberInput.placeholder = '번호';
        numberInput.setAttribute('aria-label', `${student.name} 번호`);
        numberInput.addEventListener('change', (e) => updatePreviewItem(index, 'number', e.target.value));
        numberWrapper.appendChild(numberInput);
        numberWrapper.appendChild(document.createTextNode('번'));
        detailLine.appendChild(numberWrapper);

        // 성별 (편집 가능 - 토글)
        const genderToggleContainer = document.createElement('div');
        genderToggleContainer.className = 'preview-gender-toggle';
        genderToggleContainer.setAttribute('role', 'radiogroup');
        genderToggleContainer.setAttribute('aria-label', `${student.name} 성별 선택`);

        const genderOptions = [
            { value: '여', text: '여' },
            { value: '남', text: '남' },
            { value: '-', text: '표기 안 함' }
        ];

        genderOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preview-gender-btn';
            if (opt.value === student.gender) {
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
            } else {
                btn.setAttribute('aria-checked', 'false');
            }
            btn.textContent = opt.text;
            btn.setAttribute('role', 'radio');
            btn.setAttribute('data-value', opt.value);
            btn.addEventListener('click', () => {
                // 같은 그룹의 모든 버튼 비활성화
                genderToggleContainer.querySelectorAll('.preview-gender-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                // 현재 버튼 활성화
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                // 값 업데이트
                updatePreviewItem(index, 'gender', opt.value);
            });
            genderToggleContainer.appendChild(btn);
        });

        detailLine.appendChild(genderToggleContainer);

        info.appendChild(detailLine);

        // 삭제 버튼
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'preview-item-delete';
        deleteBtn.textContent = '삭제';
        deleteBtn.setAttribute('aria-label', `${student.name} 삭제`);
        deleteBtn.addEventListener('click', () => deletePreviewItem(index));

        div.appendChild(info);
        div.appendChild(deleteBtn);
        elements.previewList.appendChild(div);
    });
}

// 미리보기 항목 업데이트
function updatePreviewItem(index, field, value) {
    if (!AppState.tempStudents || !AppState.tempStudents[index]) return;

    // 값 업데이트
    if (field === 'number') {
        AppState.tempStudents[index].number = value.trim() || '-';
    } else if (field === 'gender') {
        AppState.tempStudents[index].gender = value;
    }
}

// 미리보기 항목 삭제
function deletePreviewItem(index) {
    // 현재 이름 목록 가져오기
    const namesText = elements.manualNames.value.trim();
    const names = parseManualNames(namesText);

    // 해당 인덱스 삭제
    names.splice(index, 1);

    // textarea 업데이트
    elements.manualNames.value = names.join('\n');

    // 미리보기 재렌더링
    handleManualInput();
}

// CSV 미리보기 렌더링 (비밀선발 제외)
function renderCsvPreview(students) {
    elements.csvPreviewList.innerHTML = '';
    elements.csvPreviewCount.textContent = students.length;
    elements.csvPreviewSection.style.display = 'block';

    students.forEach((student, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';

        // 학생 정보
        const info = document.createElement('div');
        info.className = 'preview-info';

        // 이름
        const nameLine = document.createElement('div');
        nameLine.className = 'preview-name';
        nameLine.textContent = student.name;
        info.appendChild(nameLine);

        // 상세 정보 (학년, 반, 번호, 성별)
        const detailLine = document.createElement('div');
        detailLine.className = 'preview-details-editable';

        const details = [];
        if (student.grade !== '-') details.push(`${student.grade}학년`);
        if (student.class !== '-') details.push(`${student.class}반`);
        if (student.number !== '-') details.push(`${student.number}번`);
        if (student.gender !== '-') details.push(student.gender);

        detailLine.textContent = details.join(' ');
        info.appendChild(detailLine);

        // 삭제 버튼
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'preview-item-delete';
        deleteBtn.textContent = '삭제';
        deleteBtn.setAttribute('aria-label', `${student.name} 삭제`);
        deleteBtn.addEventListener('click', () => deleteCsvPreviewItem(index));

        div.appendChild(info);
        div.appendChild(deleteBtn);
        elements.csvPreviewList.appendChild(div);
    });
}

// CSV 미리보기 항목 삭제
function deleteCsvPreviewItem(index) {
    // AppState.students에서 삭제
    AppState.students.splice(index, 1);

    // 미리보기 재렌더링
    renderCsvPreview(AppState.students);

    // UI 업데이트
    elements.totalStudents.textContent = AppState.students.length;
    elements.fileInfo.textContent = `${AppState.students.length}명`;
    updateNextButtonLabel();

    // 스크린 리더 알림
    announceToScreenReader(`학생이 삭제되었습니다. 현재 ${AppState.students.length}명`);

    // 학생이 0명이 되면 다음 버튼 비활성화
    if (AppState.students.length === 0) {
        elements.step1Next.disabled = true;
        elements.csvPreviewSection.style.display = 'none';
    }
}

// CSV 파일 삭제
function clearCsvFile() {
    // 파일 input 초기화
    elements.csvFile.value = '';

    // AppState 초기화
    AppState.students = [];

    // UI 초기화
    elements.fileInfo.textContent = '파일을 선택하지 않았습니다';
    elements.fileInfo.style.color = '';
    elements.fileDeleteBtn.style.display = 'none';
    elements.csvPreviewSection.style.display = 'none';
    elements.studentCount.style.display = 'none';
    elements.step1Next.disabled = true;

    announceToScreenReader('파일이 삭제되었습니다');
}

// 다음 단계 버튼 라벨 업데이트
function updateNextButtonLabel() {
    const studentCount = AppState.currentInputMethod === 'csv'
        ? AppState.students.length
        : (AppState.tempStudents ? AppState.tempStudents.length : 0);

    if (studentCount > 0) {
        elements.step1Next.innerHTML = `${studentCount}명 다음 <span>→</span>`;
        elements.step1Next.setAttribute('aria-label', `${studentCount}명 다음 단계`);
    } else {
        elements.step1Next.innerHTML = `다음 <span>→</span>`;
        elements.step1Next.setAttribute('aria-label', '다음 단계');
    }
}

// 샘플 CSV 다운로드
function downloadSampleCSV() {
    const csvContent = `학년,반,번호,이름,성별,비밀선발
1,1,1,이름 1,여,1
1,1,2,이름 2,여,1
1,1,3,이름 3,여,1
1,1,4,이름 4,여,0
1,1,5,이름 5,여,0
1,1,6,이름 6,여,0
1,1,7,이름 7,여,0
1,1,8,이름 8,여,0
1,1,9,이름 9,여,0
1,1,10,이름 10,여,0
1,1,11,이름 11,여,0
1,1,12,이름 12,여,0
1,1,13,이름 13,여,0
1,1,14,이름 14,남,1
1,1,15,이름 15,남,1
1,1,16,이름 16,남,1
1,1,17,이름 17,남,0
1,1,18,이름 18,남,0
1,1,19,이름 19,남,0
1,1,20,이름 20,남,0
1,1,21,이름 21,남,0
1,1,22,이름 22,남,0
1,1,23,이름 23,남,0
1,1,24,이름 24,남,0
1,1,25,이름 25,남,0`;

    // UTF-8 BOM 추가 (엑셀 호환성)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

    // 다운로드 실행
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '명단파일(샘플).csv';
    a.click();
    URL.revokeObjectURL(url);

    // 스크린 리더 알림
    announceToScreenReader('샘플 CSV 파일이 다운로드되었습니다');
}

// 앱 사용법 열기
function openUsageGuide() {
    window.open('https://github.com/Engccer/pickme#readme', '_blank', 'noopener,noreferrer');
    announceToScreenReader('앱 사용법 페이지가 새 탭에서 열렸습니다');
}
