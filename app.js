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
    pickedStudentsLive: []
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
    optoutContainer: null,
    step3Back: null,
    step3Next: null,

    // Step 4
    themeCards: [],
    step4Back: null,
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
    for (let i = 1; i <= 4; i++) {
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
    elements.optoutContainer = document.getElementById('optoutContainer');
    elements.step3Back = document.getElementById('step3Back');
    elements.step3Next = document.getElementById('step3Next');

    // Step 4
    elements.themeCards = document.querySelectorAll('.theme-card');
    elements.step4Back = document.getElementById('step4Back');
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
    // Step 1: CSV 파일 업로드
    elements.fileSelectBtn.addEventListener('click', () => {
        elements.csvFile.click();
    });
    elements.csvFile.addEventListener('change', handleFileUpload);
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

    // Step 3: Opt-out
    elements.step3Back.addEventListener('click', () => goToStep(2));
    elements.step3Next.addEventListener('click', () => goToStep(4));

    // Step 4: 테마 선택
    elements.themeCards.forEach(card => {
        card.addEventListener('click', () => handleThemeSelect(card));
    });
    elements.step4Back.addEventListener('click', () => {
        // 앰비언트 사운드 중지
        if (AppState.ambientSoundInterval) {
            soundManager.stopSound(AppState.ambientSoundInterval);
            AppState.ambientSoundInterval = null;
        }
        goToStep(3);
    });
    elements.startBtn.addEventListener('click', () => {
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

    // ESC 키로 일시 중지
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.animationContainer.style.display === 'block' && !AppState.isPaused) {
            pausePicking();
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
            renderOptoutList();
        } else if (stepNumber === 4) {
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
        const text = await file.text();
        parseCSV(text);

        elements.fileInfo.textContent = `${file.name} (${AppState.students.length}명)`;
        elements.fileInfo.style.color = 'var(--secondary-color)';

        // UI 업데이트
        elements.studentCount.style.display = 'block';
        elements.totalStudents.textContent = AppState.students.length;
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
    elements.steps[4].style.display = 'none';
    elements.steps[4].classList.remove('active');

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
    elements.steps[4].style.display = 'none';
    elements.steps[4].classList.remove('active');
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
        }, 100);
    }
}
