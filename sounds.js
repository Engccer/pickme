// 사운드 효과 관리 - Web Audio API 사용

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.initialized = false;
    }

    // 오디오 컨텍스트 초기화
    init() {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = 0.3; // 전체 볼륨
            this.initialized = true;
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    // 기본 톤 생성
    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (!this.initialized) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        oscillator.type = type;
        oscillator.frequency.value = frequency;

        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + duration
        );

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    // 드럼 비트
    playDrum() {
        if (!this.initialized) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + 0.5
        );

        filter.type = 'lowpass';
        filter.frequency.value = 200;

        gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + 0.5
        );

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }

    // 심벌 (cymbal) 효과
    playCymbal() {
        if (!this.initialized) return;

        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.audioContext.sampleRate * 0.3));
        }

        const noise = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        filter.type = 'highpass';
        filter.frequency.value = 3000;

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + 1
        );

        noise.start(this.audioContext.currentTime);
        noise.stop(this.audioContext.currentTime + 1);
    }

    // 상승 효과음 (whoosh)
    playWhoosh() {
        if (!this.initialized) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
            1000,
            this.audioContext.currentTime + 0.5
        );

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, this.audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(
            5000,
            this.audioContext.currentTime + 0.5
        );

        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + 0.5
        );

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }

    // 성공 사운드
    playSuccess() {
        if (!this.initialized) return;

        const notes = [523.25, 659.25, 783.99]; // C, E, G (C major chord)

        notes.forEach((freq, index) => {
            setTimeout(() => {
                this.playTone(freq, 0.3, 'sine', 0.2);
            }, index * 100);
        });
    }

    // 스플래시 (물 소리)
    playSplash() {
        if (!this.initialized) return;

        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.audioContext.sampleRate * 0.1));
        }

        const noise = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + 0.5
        );

        noise.start(this.audioContext.currentTime);
        noise.stop(this.audioContext.currentTime + 0.5);
    }

    // 룰렛 테마 배경음
    playRouletteBackground() {
        if (!this.initialized) return;

        const interval = setInterval(() => {
            this.playDrum();
        }, 500);

        // 10초 후 중지
        setTimeout(() => {
            clearInterval(interval);
        }, 10000);

        return interval;
    }

    // 로또 테마 효과음
    playLotteryPick() {
        if (!this.initialized) return;

        this.playWhoosh();
        setTimeout(() => {
            this.playTone(800, 0.2, 'sine', 0.3);
        }, 300);
    }

    // 낚시 테마 효과음
    playFishingCast() {
        if (!this.initialized) return;

        this.playWhoosh();
        setTimeout(() => {
            this.playSplash();
        }, 500);
    }

    playFishingCatch() {
        if (!this.initialized) return;

        this.playSplash();
        setTimeout(() => {
            this.playSuccess();
        }, 200);
    }

    // 배경 음악 (간단한 멜로디 루프)
    playBackgroundMusic(theme) {
        if (!this.initialized) return;

        let melodyInterval;

        switch (theme) {
            case 'roulette':
                // 긴장감 있는 리듬
                melodyInterval = setInterval(() => {
                    this.playTone(440, 0.1, 'square', 0.15);
                    setTimeout(() => {
                        this.playTone(550, 0.1, 'square', 0.15);
                    }, 150);
                }, 1000);
                break;

            case 'lottery':
                // 밝고 경쾌한 멜로디
                const lotteryNotes = [523, 587, 659, 698];
                let noteIndex = 0;
                melodyInterval = setInterval(() => {
                    this.playTone(lotteryNotes[noteIndex % lotteryNotes.length], 0.2, 'sine', 0.15);
                    noteIndex++;
                }, 400);
                break;

            case 'fishing':
                // 잔잔한 물결 같은 사운드
                melodyInterval = setInterval(() => {
                    const freq = 300 + Math.random() * 100;
                    this.playTone(freq, 0.5, 'sine', 0.1);
                }, 2000);
                break;
        }

        return melodyInterval;
    }

    // 사운드 중지
    stopSound(interval) {
        if (interval) {
            clearInterval(interval);
        }
    }

    // 볼륨 조절
    setVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    // 앰비언트 사운드 (테마 선택 화면용)
    playAmbientSound() {
        if (!this.initialized) return null;

        // 주기적으로 변화하는 저음 톤
        const playAmbientTone = () => {
            const baseFreq = 60 + Math.random() * 20;
            this.playTone(baseFreq, 3, 'sine', 0.08);

            setTimeout(() => {
                const freq2 = 80 + Math.random() * 20;
                this.playTone(freq2, 3, 'sine', 0.06);
            }, 1500);
        };

        playAmbientTone();
        const interval = setInterval(playAmbientTone, 6000);
        return interval;
    }

    // 테마 선택 효과음
    playThemeSelectSound() {
        if (!this.initialized) return;

        // 상승하는 톤
        this.playTone(440, 0.1, 'sine', 0.2);
        setTimeout(() => {
            this.playTone(554, 0.15, 'sine', 0.2);
        }, 80);
    }

    // 학생 선발 효과음
    playStudentPickSound() {
        if (!this.initialized) return;

        // 경쾌한 벨 사운드
        this.playTone(880, 0.2, 'sine', 0.3);
        setTimeout(() => {
            this.playTone(1046, 0.15, 'sine', 0.25);
        }, 100);
    }
}

// 전역 사운드 매니저 인스턴스
const soundManager = new SoundManager();
