// 사운드 효과 관리 — Web Audio API 합성 기반.
//
// 설계 원칙:
//  - 외부 음원 파일 없이 oscillator / noise buffer / filter / gain 조합으로 합성.
//  - 테마별 phase 와 1:1 대응하는 cue 를 노출 (lottery / roulette / fishing).
//  - 반복(loop) 사운드는 { stop() } 핸들 객체를 반환 → 기존 코드의
//    `stopSound(handle)` 패턴 그대로 사용. 멱등.
//  - pause 시 masterGain 을 사용자 볼륨 → 0 으로 60ms 페이드. resume 시 복귀.
//    loop 들은 _paused 플래그를 보고 새 burst 생성을 skip → CPU/노드 누수 방지.
//  - 모든 one-shot 은 onended 에서 disconnect — 노드 누수 없음.
//  - 신호 체인: 각 노드 → masterGain → DynamicsCompressor (soft limiter) → destination.
//    교실 잡음 위에서 인지되도록 baseline 볼륨/peak 상향 — limiter 가 동시 발화 보호.

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.limiter = null;
        this.initialized = false;
        // 사용자가 setVolume() 으로 설정 가능한 기준값. setPaused(false) 시 이 값으로 복귀.
        // 0.7 — 교실 환경 기준 적정 baseline (limiter 가 동시 발화 시 ceiling 보호).
        // 사용자가 setVolume(v) 호출 시 v 로 즉시 갱신되며 hardcode 되지 않음.
        this.masterVolume = 0.7;
        // pause 상태 — true 면 loop 가 새 burst 생성을 skip.
        this._paused = false;
    }

    // 오디오 컨텍스트 초기화 (lazy — user gesture 이후 호출 필요)
    init() {
        if (this.initialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            // soft limiter — 동시 발화 시에도 clipping 방지 + 음악적 transient 보존.
            // threshold -3 dB (0.71 ceiling) / ratio 14:1 — brick-wall 에 가까운 soft 캐릭터.
            // attack 2ms — chord 시작 transient 살리되 spike 빠르게 catch.
            // release 150ms — pumping 거의 안 들리는 자연스러운 복귀.
            this.limiter = this.audioContext.createDynamicsCompressor();
            this.limiter.threshold.value = -3;
            this.limiter.knee.value = 6;
            this.limiter.ratio.value = 14;
            this.limiter.attack.value = 0.002;
            this.limiter.release.value = 0.15;
            this.masterGain.connect(this.limiter);
            this.limiter.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.masterVolume;
            this.initialized = true;
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    // ── 내부 헬퍼 ─────────────────────────────────────────

    _now() { return this.audioContext.currentTime; }

    // 짧은 oscillator one-shot (attack + decay envelope).
    // outputNode 기본 this.masterGain. loop 핸들이 mixGain 등 자체 노드 거치고 싶을 때 지정.
    // when (audio clock sec) 주어지면 그 시각에 정확히 예약 — BPM 그리드 lookahead scheduler 용.
    _oneShot({ type = 'sine', freq = 440, freqTo = null, dur = 0.15,
               attack = 0.005, peak = 0.15, filterType = null,
               filterFreq = null, filterFreqTo = null, filterQ = 1,
               outputNode = null, when = null }) {
        if (!this.initialized) return;
        const t = (when != null) ? when : this._now();
        const dest = outputNode || this.masterGain;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        let filterNode = null;
        if (filterType) {
            filterNode = this.audioContext.createBiquadFilter();
            filterNode.type = filterType;
            if (filterFreq != null) filterNode.frequency.value = filterFreq;
            filterNode.Q.value = filterQ;
            osc.connect(filterNode);
            filterNode.connect(gain);
            if (filterFreqTo != null) {
                filterNode.frequency.exponentialRampToValueAtTime(
                    Math.max(0.001, filterFreqTo), t + dur);
            }
        } else {
            osc.connect(gain);
        }
        gain.connect(dest);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (freqTo != null) {
            osc.frequency.exponentialRampToValueAtTime(
                Math.max(0.001, freqTo), t + dur);
        }
        const safePeak = Math.max(0.0002, peak);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(safePeak, t + Math.max(0.001, attack));
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        osc.onended = () => {
            try { osc.disconnect(); } catch (e) {}
            try { gain.disconnect(); } catch (e) {}
            if (filterNode) { try { filterNode.disconnect(); } catch (e) {} }
        };
    }

    // 짧은 noise burst (white noise → biquad filter → gain). onended 에서 disconnect.
    // outputNode 기본 this.masterGain.
    // when (audio clock sec) 주어지면 그 시각에 정확히 예약.
    _noiseBurst({ dur = 0.05, filterType = 'bandpass', filterFreq = 1200,
                  filterFreqTo = null, filterQ = 1.5, peak = 0.1,
                  outputNode = null, when = null }) {
        if (!this.initialized) return;
        const t = (when != null) ? when : this._now();
        const dest = outputNode || this.masterGain;
        const sr = this.audioContext.sampleRate;
        const len = Math.max(1, Math.floor(sr * dur));
        const buf = this.audioContext.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.audioContext.createBufferSource();
        src.buffer = buf;
        const filter = this.audioContext.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = filterFreq;
        filter.Q.value = filterQ;
        if (filterFreqTo != null) {
            filter.frequency.exponentialRampToValueAtTime(
                Math.max(0.001, filterFreqTo), t + dur);
        }
        const gain = this.audioContext.createGain();
        src.connect(filter); filter.connect(gain); gain.connect(dest);
        const safePeak = Math.max(0.0002, peak);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(safePeak, t + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.start(t);
        src.stop(t + dur + 0.02);
        src.onended = () => {
            try { src.disconnect(); } catch (e) {}
            try { filter.disconnect(); } catch (e) {}
            try { gain.disconnect(); } catch (e) {}
        };
    }

    // 짧은 marimba/kalimba 풍 pluck — sine 기본 + 2x harmonic 18% + lowpass + AD env.
    // 낚시 background loop 의 청아한 멜로디 note 합성에 사용.
    // when (audio clock sec) 주어지면 그 시각에 정확히 예약.
    _pluck(freq, dur = 0.32, peak = 0.16, outputNode = null, when = null) {
        if (!this.initialized) return;
        const t = (when != null) ? when : this._now();
        const dest = outputNode || this.masterGain;
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const g1 = this.audioContext.createGain();
        const g2 = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        const gain = this.audioContext.createGain();
        filter.type = 'lowpass';
        filter.frequency.value = Math.max(1000, freq * 4);
        filter.Q.value = 0.6;
        osc1.type = 'sine'; osc1.frequency.value = freq;
        osc2.type = 'sine'; osc2.frequency.value = freq * 2;
        g1.gain.value = 1;
        g2.gain.value = 0.18;
        osc1.connect(g1); g1.connect(filter);
        osc2.connect(g2); g2.connect(filter);
        filter.connect(gain); gain.connect(dest);
        const safePeak = Math.max(0.0002, peak);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(safePeak, t + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc1.start(t); osc2.start(t);
        osc1.stop(t + dur + 0.02); osc2.stop(t + dur + 0.02);
        osc1.onended = () => {
            try { osc1.disconnect(); } catch (e) {}
            try { osc2.disconnect(); } catch (e) {}
            try { g1.disconnect(); } catch (e) {}
            try { g2.disconnect(); } catch (e) {}
            try { filter.disconnect(); } catch (e) {}
            try { gain.disconnect(); } catch (e) {}
        };
    }

    // BPM 기반 lookahead scheduler.
    // 25ms tick 으로 100ms 윈도우 안의 16분음표 step 들을 audio clock 시각에 정확히 예약 →
    // setTimeout drift 회피. onStep(stepIdx, when) 콜백이 매 step 마다 호출되며 caller 는
    // when 을 _oneShot/_noiseBurst/_pluck 에 그대로 전달하면 됨.
    // _paused 일 때 onStep skip — 단, stepIdx/nextNoteTime 은 계속 advance 해서 resume 시
    // 음악이 같은 grid 에서 자연스럽게 이어짐. stopped 시 즉시 schedule 중단.
    // 반환: { stopped, intervalId, ... } — _stopLoopScheduler 로 정리.
    _makeLoopScheduler({ bpm, stepsPerBeat = 4, onStep }) {
        if (!this.initialized) return null;
        const SCHEDULE_AHEAD = 0.10;    // 미리 예약 윈도우 (sec)
        const TICK_MS = 25;             // setInterval 주기
        const secPerStep = 60 / bpm / stepsPerBeat;
        const state = {
            stopped: false,
            intervalId: null,
            nextNoteTime: this._now() + 0.05,    // 첫 스텝에 소량 lead
            stepIdx: 0,
        };
        const tick = () => {
            if (state.stopped) return;
            const ctxNow = this._now();
            // catch up — 정상 동작에선 1~2회만 돌고 빠져나옴
            while (!state.stopped && state.nextNoteTime < ctxNow + SCHEDULE_AHEAD) {
                if (!this._paused) {
                    try { onStep(state.stepIdx, state.nextNoteTime); } catch (e) {}
                }
                state.nextNoteTime += secPerStep;
                state.stepIdx++;
            }
        };
        tick();
        state.intervalId = setInterval(tick, TICK_MS);
        return state;
    }

    // scheduler stop — 새 step 예약 중단. 이미 예약된 osc 들은 outputNode 의 gain fade 가
    // 즉시 silent 처리. osc.start 가 이미 미래 시각으로 예약되어도 출력 경로가 muted 라 무해.
    _stopLoopScheduler(state) {
        if (!state) return;
        state.stopped = true;
        if (state.intervalId !== null) {
            clearInterval(state.intervalId);
            state.intervalId = null;
        }
    }

    // ── 기본 원자 톤 (back-compat) ────────────────────────

    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        this._oneShot({ type, freq: frequency, dur: duration, peak: volume });
    }

    playDrum() {
        this._oneShot({ type: 'triangle', freq: 150, freqTo: 0.01, dur: 0.5,
                        peak: 0.3, filterType: 'lowpass', filterFreq: 200 });
    }

    playCymbal() {
        this._noiseBurst({ dur: 1.0, filterType: 'highpass',
                           filterFreq: 3000, filterQ: 0.5, peak: 0.18 });
    }

    playWhoosh() {
        this._oneShot({ type: 'sawtooth', freq: 100, freqTo: 1000, dur: 0.5,
                        peak: 0.18, filterType: 'lowpass',
                        filterFreq: 500, filterFreqTo: 5000, filterQ: 0.8 });
    }

    playSplash() {
        this._noiseBurst({ dur: 0.5, filterType: 'lowpass',
                           filterFreq: 1000, filterQ: 0.7, peak: 0.20 });
    }

    // outro chord — 결과 진입 직전에 한 번.
    playSuccess() {
        if (!this.initialized) return;
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                if (this._paused) return;
                this._oneShot({ type: 'sine', freq, dur: 0.30, peak: 0.14, attack: 0.005 });
            }, i * 90);
        });
    }

    // ── Lottery cues ──────────────────────────────────────

    // 공 섞임 + 132 BPM 캐주얼 아케이드 BGM — 단일 핸들로 6 레이어 동시 운영.
    // 라우팅: 모든 노드 → mixGain → masterGain. stop() 시 mixGain 60ms 페이드 →
    // 미래에 예약된 osc 도 출력 경로가 muted 라 silent.
    //   Layer 1: rattle (plastic ball, 55~110ms 간격 — '공 섞이고 있다' 정체성)
    //   Layer 2: kick — 4-on-the-floor (16-step grid 의 0/4/8/12)
    //   Layer 3: clap — beat 2, 4 (4, 12)
    //   Layer 4: closed hat — 8분 offbeats (2, 6, 10, 14)
    //   Layer 5: bass pluck — quarter grid C2-G2-F2-G2 (I-V-IV-V)
    //   Layer 6: synth lead pluck — quarter grid C5-E5-G5-E5
    // BPM 132 / 16분음표 step ≈ 113.6ms
    startLotteryMix() {
        if (!this.initialized) return null;
        const state = { stopped: false, rattleTimer: null, scheduler: null, mixGain: null };

        // 전용 mixGain — stop() 시 페이드용
        const mixGain = this.audioContext.createGain();
        mixGain.gain.value = 1;
        mixGain.connect(this.masterGain);
        state.mixGain = mixGain;

        // Layer 1 — rattle (공 섞임 정체성 — 다른 레이어 위에서도 들리도록 0.24~0.34 유지)
        const rattle = () => {
            if (state.stopped) return;
            if (!this._paused) {
                this._noiseBurst({
                    dur: 0.018 + Math.random() * 0.014,
                    filterType: 'bandpass',
                    filterFreq: 900 + Math.random() * 800,
                    filterQ: 2.6,
                    peak: 0.24 + Math.random() * 0.10,
                    outputNode: mixGain,
                });
            }
            state.rattleTimer = setTimeout(rattle, 55 + Math.random() * 55);
        };
        rattle();

        // Layers 2~6 — 132 BPM 16-step grid
        // BASS: I-V-IV-V (C-G-F-G) at quarters / LEAD: C-E-G-E at quarters
        const BASS = [
            65.41, 0, 0, 0,    // 0  C2
            98.00, 0, 0, 0,    // 4  G2
            87.31, 0, 0, 0,    // 8  F2
            98.00, 0, 0, 0,    // 12 G2
        ];
        const LEAD = [
            523.25, 0, 0, 0,   // 0  C5
            659.25, 0, 0, 0,   // 4  E5
            783.99, 0, 0, 0,   // 8  G5
            659.25, 0, 0, 0,   // 12 E5
        ];

        state.scheduler = this._makeLoopScheduler({
            bpm: 132,
            stepsPerBeat: 4,
            onStep: (idx, when) => {
                const s = idx % 16;
                // Kick — 4-on-the-floor
                if (s === 0 || s === 4 || s === 8 || s === 12) {
                    this._oneShot({
                        when, type: 'triangle', freq: 80, freqTo: 50, dur: 0.10,
                        peak: 0.18, attack: 0.003,
                        filterType: 'lowpass', filterFreq: 260, filterQ: 0.7,
                        outputNode: mixGain,
                    });
                }
                // Clap — beats 2 & 4
                if (s === 4 || s === 12) {
                    this._noiseBurst({
                        when, dur: 0.05,
                        filterType: 'bandpass', filterFreq: 1800, filterQ: 1.4,
                        peak: 0.14, outputNode: mixGain,
                    });
                }
                // Closed hat — 8분 offbeats
                if (s === 2 || s === 6 || s === 10 || s === 14) {
                    this._noiseBurst({
                        when, dur: 0.025,
                        filterType: 'highpass', filterFreq: 5500, filterQ: 0.7,
                        peak: 0.05, outputNode: mixGain,
                    });
                }
                // Bass pluck
                const bf = BASS[s];
                if (bf > 0) {
                    this._oneShot({
                        when, type: 'triangle', freq: bf, dur: 0.18,
                        peak: 0.13, attack: 0.004,
                        filterType: 'lowpass',
                        filterFreq: Math.max(500, bf * 5), filterQ: 0.7,
                        outputNode: mixGain,
                    });
                }
                // Lead synth pluck (+ 2x harmonic sparkle)
                const lf = LEAD[s];
                if (lf > 0) {
                    this._oneShot({
                        when, type: 'sine', freq: lf, dur: 0.22,
                        peak: 0.10, attack: 0.003,
                        filterType: 'lowpass', filterFreq: lf * 4, filterQ: 0.6,
                        outputNode: mixGain,
                    });
                    this._oneShot({
                        when, type: 'sine', freq: lf * 2, dur: 0.15,
                        peak: 0.04, attack: 0.003,
                        outputNode: mixGain,
                    });
                }
            },
        });

        return {
            stop: () => {
                if (state.stopped) return;                    // 멱등
                state.stopped = true;
                if (state.rattleTimer) { clearTimeout(state.rattleTimer); state.rattleTimer = null; }
                this._stopLoopScheduler(state.scheduler);
                state.scheduler = null;
                // mixGain 페이드 → in-flight + 미래 예약 osc 모두 silent
                if (state.mixGain) {
                    const mg = state.mixGain;
                    try {
                        const t = this._now();
                        mg.gain.cancelScheduledValues(t);
                        mg.gain.setValueAtTime(mg.gain.value, t);
                        mg.gain.linearRampToValueAtTime(0.0001, t + 0.06);
                    } catch (e) {}
                    setTimeout(() => {
                        try { mg.disconnect(); } catch (e) {}
                    }, 200);
                    state.mixGain = null;
                }
            }
        };
    }

    // 공 한 개가 빠져나가는 pop
    playLotteryEject() {
        if (!this.initialized) return;
        this._noiseBurst({ dur: 0.04, filterType: 'bandpass',
                           filterFreq: 1400, filterQ: 2, peak: 0.32 });
        this._oneShot({ type: 'sine', freq: 600, freqTo: 200, dur: 0.10,
                        peak: 0.32, attack: 0.003 });
    }

    // 슈트를 따라 또르르 — 0.35s
    playLotteryRoll() {
        if (!this.initialized) return;
        this._noiseBurst({ dur: 0.35, filterType: 'bandpass',
                           filterFreq: 700, filterFreqTo: 1500,
                           filterQ: 1.6, peak: 0.32 });
    }

    // 트레이 안착 톡
    playLotterySettle() {
        if (!this.initialized) return;
        this._oneShot({ type: 'triangle', freq: 380, freqTo: 280,
                        dur: 0.09, peak: 0.30, attack: 0.001 });
    }

    // 이름 reveal chord — E5/G5/B5 stagger 35ms, 가장 선명
    playLotteryReveal() {
        if (!this.initialized) return;
        const notes = [659.25, 783.99, 987.77];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                if (this._paused) return;
                this._oneShot({ type: 'sine', freq, dur: 0.34, peak: 0.42, attack: 0.005 });
            }, i * 35);
        });
    }

    // back-compat: 기존 호출 자리는 reveal 사운드로 연결
    playLotteryPick() { this.playLotteryReveal(); }

    // ── Roulette cues ─────────────────────────────────────

    // 회전 시작 whoosh — 선명
    playRouletteSpinStart() {
        if (!this.initialized) return;
        this._oneShot({ type: 'sawtooth', freq: 80, freqTo: 400, dur: 0.40,
                        peak: 0.32, filterType: 'lowpass',
                        filterFreq: 600, filterFreqTo: 2400, filterQ: 0.7 });
    }

    // 회전 중 arcade spin BGM — 140 BPM 밝은 캐주얼 게임 BGM (5 레이어 단일 핸들).
    // 라우팅: 모든 노드 → spinGain → masterGain. stop() 시 spinGain 60ms 페이드 →
    // 미래에 예약된 osc 도 출력 경로가 muted 라 silent.
    // 키 C major. 4-bar 코드 진행: C – G – Am – F (I–V–vi–IV). 단조 drone / sustained hum 없음.
    //   Layer 1: kick — 4-on-the-floor 70→50Hz triangle (peak 0.15)
    //   Layer 2: clap — beats 2 & 4 bandpass-noise 1800Hz (peak 0.08, 마디당 2회만)
    //   Layer 3: shaker — 8분 offbeats highpass 7000Hz noise (peak 0.04)
    //   Layer 4: synth bass — quarter grid 코드 root C2/G2/A2/F2 triangle (peak 0.12)
    //   Layer 5: 8-bit lead pluck — quarter grid 코드톤 4음/마디 sine + 2× harmonic (peak 0.075 + 0.025)
    // BPM 140 / 16분음표 step ≈ 107.1ms / 한 마디 16 step / 4-bar 루프 64 step
    // tick (1800Hz triangle, peak 0.22~0.30) 와의 충돌 방지 — 대역 분리:
    //   kick<240Hz / bass<550Hz / lead 500~1050Hz fundamental / shaker>7000Hz
    //   → 1500~3500Hz tick 대역 비움. clap 만 1800Hz 와 겹치지만 peak 0.08 (tick 의 1/3) +
    //   마디당 2회만 발화라 tick 항상 위에서 들림.
    startRouletteSpinBed() {
        if (!this.initialized) return null;
        const state = { stopped: false, scheduler: null, spinGain: null };

        // 전용 spinGain — stop() 시 페이드용. 1.0 base, 각 레이어 peak 가 실제 레벨.
        const spinGain = this.audioContext.createGain();
        spinGain.gain.value = 1;
        spinGain.connect(this.masterGain);
        state.spinGain = spinGain;

        // 마디별 bass root — C major 진행 (C2 / G2 / A2 / F2)
        const BAR_BASS = [65.41, 98.00, 110.00, 87.31];
        // 마디별 lead 16-step pattern — 코드톤 4음/마디 (root, mid, top, mid), 4분 grid
        const LEAD = [
            // bar 1: C  → E5 G5 C6 G5
            [659.25, 0, 0, 0, 783.99, 0, 0, 0, 1046.50, 0, 0, 0, 783.99, 0, 0, 0],
            // bar 2: G  → D5 G5 B5 G5
            [587.33, 0, 0, 0, 783.99, 0, 0, 0,  987.77, 0, 0, 0, 783.99, 0, 0, 0],
            // bar 3: Am → E5 A5 C6 A5
            [659.25, 0, 0, 0, 880.00, 0, 0, 0, 1046.50, 0, 0, 0, 880.00, 0, 0, 0],
            // bar 4: F  → C5 F5 A5 F5
            [523.25, 0, 0, 0, 698.46, 0, 0, 0,  880.00, 0, 0, 0, 698.46, 0, 0, 0],
        ];

        state.scheduler = this._makeLoopScheduler({
            bpm: 140,
            stepsPerBeat: 4,
            onStep: (idx, when) => {
                const bar = Math.floor(idx / 16) % 4;
                const s = idx % 16;
                // Kick — 4-on-the-floor
                if (s === 0 || s === 4 || s === 8 || s === 12) {
                    this._oneShot({
                        when, type: 'triangle', freq: 70, freqTo: 50, dur: 0.09,
                        peak: 0.15, attack: 0.003,
                        filterType: 'lowpass', filterFreq: 240, filterQ: 0.7,
                        outputNode: spinGain,
                    });
                }
                // Clap — beats 2 & 4 (마디당 2회만 → tick 1800Hz 충돌 최소)
                if (s === 4 || s === 12) {
                    this._noiseBurst({
                        when, dur: 0.045,
                        filterType: 'bandpass', filterFreq: 1800, filterQ: 1.4,
                        peak: 0.08, outputNode: spinGain,
                    });
                }
                // Shaker — 8분 offbeats. highpass 7000+ → tick 대역 완전 분리
                if (s === 2 || s === 6 || s === 10 || s === 14) {
                    this._noiseBurst({
                        when, dur: 0.022,
                        filterType: 'highpass', filterFreq: 7000, filterQ: 0.6,
                        peak: 0.04, outputNode: spinGain,
                    });
                }
                // Synth bass — quarter grid 의 코드 root
                const bf = BAR_BASS[bar];
                if (s === 0 || s === 4 || s === 8 || s === 12) {
                    this._oneShot({
                        when, type: 'triangle', freq: bf, dur: 0.18,
                        peak: 0.12, attack: 0.004,
                        filterType: 'lowpass',
                        filterFreq: Math.max(500, bf * 5), filterQ: 0.7,
                        outputNode: spinGain,
                    });
                }
                // 8-bit lead pluck (+ 2× harmonic sparkle)
                const lf = LEAD[bar][s];
                if (lf > 0) {
                    this._oneShot({
                        when, type: 'sine', freq: lf, dur: 0.14,
                        peak: 0.075, attack: 0.003,
                        filterType: 'lowpass', filterFreq: lf * 4, filterQ: 0.6,
                        outputNode: spinGain,
                    });
                    this._oneShot({
                        when, type: 'sine', freq: lf * 2, dur: 0.10,
                        peak: 0.025, attack: 0.003,
                        outputNode: spinGain,
                    });
                }
            },
        });

        return {
            stop: () => {
                if (state.stopped) return;                    // 멱등
                state.stopped = true;
                this._stopLoopScheduler(state.scheduler);
                state.scheduler = null;
                // spinGain 60ms 페이드 → in-flight + 미래 예약 osc 모두 silent
                if (state.spinGain) {
                    const sg = state.spinGain;
                    try {
                        const t = this._now();
                        sg.gain.cancelScheduledValues(t);
                        sg.gain.setValueAtTime(sg.gain.value, t);
                        sg.gain.linearRampToValueAtTime(0.0001, t + 0.06);
                    } catch (e) {}
                    setTimeout(() => {
                        try { sg.disconnect(); } catch (e) {}
                    }, 200);
                    state.spinGain = null;
                }
            }
        };
    }

    // segment 통과 click — intensity 0~1 입력에 0.4 베이스 곡선 적용.
    // 곡선: curved = 0.4 + 0.6 * intensity → decel 후반 (slow) tick 도 들림.
    // peak = 0.16 + 0.14 * curved → 0.22 ~ 0.30 범위.
    playRouletteTick(intensity = 0.5) {
        if (!this.initialized) return;
        const i = Math.max(0, Math.min(1, intensity));
        const curved = 0.4 + 0.6 * i;
        const peak = 0.16 + 0.14 * curved;
        this._oneShot({ type: 'triangle', freq: 1800, dur: 0.032,
                        peak, attack: 0.001,
                        filterType: 'lowpass', filterFreq: 3500, filterQ: 0.6 });
    }

    // 멈추는 순간 "탁" — 분명한 stop tap
    playRouletteStop() {
        if (!this.initialized) return;
        this._noiseBurst({ dur: 0.04, filterType: 'lowpass',
                           filterFreq: 1500, filterQ: 0.7, peak: 0.30 });
        this._oneShot({ type: 'triangle', freq: 220, dur: 0.09,
                        peak: 0.34, attack: 0.001 });
    }

    // reveal chord — G5/B5/D6 staggered, 가장 화려
    playRouletteReveal() {
        if (!this.initialized) return;
        const notes = [783.99, 987.77, 1174.66];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                if (this._paused) return;
                this._oneShot({ type: 'sine', freq, dur: 0.34, peak: 0.42, attack: 0.005 });
            }, i * 55);
        });
    }

    // ── Fishing cues ──────────────────────────────────────

    // bubble + sub pad + 126 BPM 통통 튀는 물속 게임 BGM (6 레이어 단일 핸들).
    // 라우팅: 모든 레이어 → ambGain → masterGain. stop() 시 ambGain 페이드.
    //   Layer 1: pad — 90Hz sine + lowpass 200 (옅은 베드, 베이스 자리 양보용 peak 0.06)
    //   Layer 2: bubble — 0.9~1.6초 간격 sine burst (귀여운 뽀글뽀글)
    //   Layer 3: heartbeat thump — 60→45Hz triangle, 1·3박 (peak 0.10, 절제)
    //   Layer 4: shaker — 8분 offbeats highpass noise (peak 0.05)
    //   Layer 5: marimba bass — C3/G2/A2/G2 quarter grid (peak 0.12)
    //   Layer 6: kalimba arp — E5-G5-B5-G5 (16-step, 8분음 — 통통 튀고 동요화 회피)
    // BPM 126 / 16분음표 step ≈ 119ms
    startFishingAmbient() {
        if (!this.initialized) return null;
        const state = {
            stopped: false, bubbleTimer: null, scheduler: null,
            ambGain: null, padOsc: null, padGain: null, padFilter: null,
        };

        // 전용 ambGain — stop() 시 페이드용
        const ambGain = this.audioContext.createGain();
        ambGain.gain.value = 1;
        ambGain.connect(this.masterGain);
        state.ambGain = ambGain;

        // Layer 1 — pad (베이스 자리 양보 — 0.09 → 0.06 으로 더 옅게)
        try {
            const t = this._now();
            const padOsc = this.audioContext.createOscillator();
            const padGain = this.audioContext.createGain();
            const padFilter = this.audioContext.createBiquadFilter();
            padFilter.type = 'lowpass';
            padFilter.frequency.value = 200;
            padFilter.Q.value = 0.5;
            padOsc.type = 'sine';
            padOsc.frequency.value = 90;
            padOsc.connect(padFilter);
            padFilter.connect(padGain);
            padGain.connect(ambGain);
            padGain.gain.setValueAtTime(0.0001, t);
            padGain.gain.linearRampToValueAtTime(0.06, t + 1.2);
            padOsc.start(t);
            state.padOsc = padOsc;
            state.padGain = padGain;
            state.padFilter = padFilter;
        } catch (e) {}

        // Layer 2 — bubble (귀엽고 자주, 단조롭지 않게)
        const bubble = () => {
            if (state.stopped) return;
            if (!this._paused) {
                const f = 400 + Math.random() * 300;
                this._oneShot({
                    type: 'sine',
                    freq: f,
                    freqTo: f * (0.85 + Math.random() * 0.1),
                    dur: 0.07 + Math.random() * 0.05,
                    peak: 0.18 + Math.random() * 0.08,
                    attack: 0.004,
                    outputNode: ambGain,
                });
            }
            state.bubbleTimer = setTimeout(bubble, 900 + Math.random() * 700);
        };
        bubble();

        // Layers 3~6 — 126 BPM 16-step grid
        // BASS: C3-G2-A2-G2 (i-v-VI-v 분위기, 따뜻한 marimba) at 0/6/8/14 (살짝 syncopation)
        const BASS = [
            130.81, 0, 0, 0, 0, 0, 98.00, 0,    // 0 C3 / 6 G2
            110.00, 0, 0, 0, 0, 0, 98.00, 0,    // 8 A2 / 14 G2
        ];
        // KALIMBA: 8분음 E-G-B-G arp — 통통 튀고 단순 동요 회피용 phrase 변형 없음
        const KALIMBA = [
            659.25, 0, 783.99, 0, 987.77, 0, 783.99, 0,   // E5 G5 B5 G5
            659.25, 0, 783.99, 0, 987.77, 0, 783.99, 0,   // E5 G5 B5 G5
        ];

        state.scheduler = this._makeLoopScheduler({
            bpm: 126,
            stepsPerBeat: 4,
            onStep: (idx, when) => {
                const s = idx % 16;
                // Heartbeat thump — beat 1, 3 만 (절제된 wave pulse)
                if (s === 0 || s === 8) {
                    this._oneShot({
                        when, type: 'triangle', freq: 60, freqTo: 45, dur: 0.14,
                        peak: 0.10, attack: 0.004,
                        filterType: 'lowpass', filterFreq: 200, filterQ: 0.6,
                        outputNode: ambGain,
                    });
                }
                // Shaker — 8분 offbeats (귀여운 텍스처)
                if (s === 2 || s === 6 || s === 10 || s === 14) {
                    this._noiseBurst({
                        when, dur: 0.025,
                        filterType: 'highpass', filterFreq: 6000, filterQ: 0.6,
                        peak: 0.05, outputNode: ambGain,
                    });
                }
                // Marimba bass
                const bf = BASS[s];
                if (bf > 0) {
                    this._oneShot({
                        when, type: 'triangle', freq: bf, dur: 0.22,
                        peak: 0.12, attack: 0.005,
                        filterType: 'lowpass',
                        filterFreq: Math.max(500, bf * 5), filterQ: 0.6,
                        outputNode: ambGain,
                    });
                }
                // Kalimba pluck arp (±2 cent detune — 미세한 organic 흔들림)
                const kf = KALIMBA[s];
                if (kf > 0) {
                    const detuneCents = (Math.random() - 0.5) * 4;
                    const factor = Math.pow(2, detuneCents / 1200);
                    this._pluck(kf * factor, 0.30, 0.20, ambGain, when);
                }
            },
        });

        return {
            stop: () => {
                if (state.stopped) return;                                 // 멱등
                state.stopped = true;
                if (state.bubbleTimer) { clearTimeout(state.bubbleTimer); state.bubbleTimer = null; }
                this._stopLoopScheduler(state.scheduler);
                state.scheduler = null;
                // ambGain 페이드 → 모든 in-flight + 미래 예약 레이어 silent
                if (state.ambGain) {
                    const ag = state.ambGain;
                    try {
                        const t = this._now();
                        ag.gain.cancelScheduledValues(t);
                        ag.gain.setValueAtTime(ag.gain.value, t);
                        ag.gain.linearRampToValueAtTime(0.0001, t + 0.06);
                    } catch (e) {}
                    try {
                        const t = this._now();
                        if (state.padGain) {
                            state.padGain.gain.cancelScheduledValues(t);
                            state.padGain.gain.linearRampToValueAtTime(0.0001, t + 0.06);
                        }
                        if (state.padOsc) state.padOsc.stop(t + 0.10);
                    } catch (e) {}
                    setTimeout(() => {
                        try { if (state.padOsc) state.padOsc.disconnect(); } catch (e) {}
                        try { if (state.padFilter) state.padFilter.disconnect(); } catch (e) {}
                        try { if (state.padGain) state.padGain.disconnect(); } catch (e) {}
                        try { ag.disconnect(); } catch (e) {}
                        state.padOsc = state.padFilter = state.padGain = null;
                        state.ambGain = null;
                    }, 250);
                }
            }
        };
    }

    // 찌가 물에 들어가는 짧은 water plop
    playFishingCast() {
        if (!this.initialized) return;
        this._noiseBurst({ dur: 0.14, filterType: 'lowpass',
                           filterFreq: 600, filterQ: 0.8, peak: 0.32 });
        this._oneShot({ type: 'sine', freq: 400, freqTo: 200, dur: 0.12,
                        peak: 0.26, attack: 0.003 });
    }

    // 잡힘 순간 — 분명한 sharp tug + 미세 noise + 청아한 high "뿅/plink"
    playFishingHooked() {
        if (!this.initialized) return;
        this._oneShot({ type: 'triangle', freq: 600, freqTo: 300, dur: 0.10,
                        peak: 0.34, attack: 0.001 });
        this._noiseBurst({ dur: 0.05, filterType: 'highpass',
                           filterFreq: 1500, filterQ: 0.8, peak: 0.18 });
        // "뿅!" — 잡힘 순간을 확실히 인식시키는 high plink
        this._oneShot({ type: 'sine', freq: 1500, dur: 0.10,
                        peak: 0.30, attack: 0.001 });
    }

    // 끌어올리는 동안 — rising tone
    playFishingPull() {
        if (!this.initialized) return;
        this._oneShot({ type: 'sine', freq: 400, freqTo: 700, dur: 0.22,
                        peak: 0.24, attack: 0.02 });
    }

    // 이름 reveal — 청아한 띠링 (B5 + E6 동시) + kalimba arpeggio
    // BGM 페이드 직후라 chime 이 또렷이 들림. ASMR 잔잔함이 아니라 게임 reveal jingle 캐릭터.
    playFishingReveal() {
        if (!this.initialized) return;
        this._oneShot({ type: 'sine', freq: 987.77, dur: 0.34,
                        peak: 0.42, attack: 0.002 });
        this._oneShot({ type: 'sine', freq: 1318.51, dur: 0.34,
                        peak: 0.32, attack: 0.002 });
        // E6 → G6 → B6 marimba arp (35ms stagger) — 확실한 reveal chime
        const arp = [1318.51, 1567.98, 1975.53];
        arp.forEach((f, i) => {
            setTimeout(() => {
                if (this._paused) return;
                this._pluck(f, 0.28, 0.20);
            }, i * 35);
        });
    }

    // back-compat
    playFishingCatch() { this.playFishingReveal(); }

    // ── 글로벌 ────────────────────────────────────────────

    // 테마별 배경/loop 디스패처. lottery=mix rattle + arcade pulse,
    // fishing=bubble + pad + pluck, roulette=null (spin bed 는 theme 가 직접 관리).
    playBackgroundMusic(theme) {
        if (!this.initialized) return null;
        switch (theme) {
            case 'lottery':  return this.startLotteryMix();
            case 'fishing':  return this.startFishingAmbient();
            case 'roulette': return null;
            default:         return null;
        }
    }

    // back-compat — 사용처 없는 것으로 보이지만 보존
    playRouletteBackground() { return this.playBackgroundMusic('roulette'); }

    // pause/resume — masterGain 을 사용자 볼륨 ↔ 0 으로 60ms 페이드.
    // resume 시 항상 this.masterVolume 으로 복귀 (사용자 setVolume 호출값 보존).
    setPaused(paused) {
        if (!this.initialized || !this.masterGain) return;
        this._paused = !!paused;
        const t = this._now();
        this.masterGain.gain.cancelScheduledValues(t);
        const target = paused ? 0 : this.masterVolume;
        this.masterGain.gain.linearRampToValueAtTime(target, t + 0.06);
    }

    // 사운드 정지 — legacy numeric interval handle 과 신규 { stop() } 객체 모두 지원. 멱등.
    stopSound(handle) {
        if (handle == null) return;
        if (typeof handle === 'object' && typeof handle.stop === 'function') {
            try { handle.stop(); } catch (e) {}
            return;
        }
        try { clearInterval(handle); } catch (e) {}
        try { clearTimeout(handle); } catch (e) {}
    }

    // 사용자 master volume — setPaused(false) 시 이 값으로 복귀.
    // setVolume(v) 호출 시 즉시 반영 (paused 중이면 masterVolume 만 갱신, 다음 resume 에 적용).
    setVolume(volume) {
        const v = Math.max(0, Math.min(1, volume));
        this.masterVolume = v;
        if (this.masterGain && this.audioContext && !this._paused) {
            const t = this._now();
            this.masterGain.gain.cancelScheduledValues(t);
            this.masterGain.gain.linearRampToValueAtTime(v, t + 0.05);
        }
    }

    // 테마 선택 화면 ambient — 매우 옅은 sine pad 가 6초 주기로 무작위 톤.
    playAmbientSound() {
        if (!this.initialized) return null;
        const state = { stopped: false, timer: null, innerTimer: null };
        const tone = () => {
            if (state.stopped) return;
            if (!this._paused) {
                const f1 = 60 + Math.random() * 20;
                this._oneShot({ type: 'sine', freq: f1, dur: 3.0, peak: 0.08, attack: 0.5 });
                state.innerTimer = setTimeout(() => {
                    state.innerTimer = null;
                    if (state.stopped || this._paused) return;
                    const f2 = 80 + Math.random() * 20;
                    this._oneShot({ type: 'sine', freq: f2, dur: 3.0, peak: 0.07, attack: 0.5 });
                }, 1500);
            }
            state.timer = setTimeout(tone, 6000);
        };
        tone();
        return {
            stop: () => {
                if (state.stopped) return;
                state.stopped = true;
                if (state.timer) { clearTimeout(state.timer); state.timer = null; }
                if (state.innerTimer) { clearTimeout(state.innerTimer); state.innerTimer = null; }
            }
        };
    }

    // 테마 카드 선택 효과음
    playThemeSelectSound() {
        if (!this.initialized) return;
        this._oneShot({ type: 'sine', freq: 440, dur: 0.10, peak: 0.22, attack: 0.003 });
        setTimeout(() => {
            if (this._paused) return;
            this._oneShot({ type: 'sine', freq: 554, dur: 0.15, peak: 0.22, attack: 0.003 });
        }, 80);
    }

    // 학생 추가 효과음 — 테마 reveal chime 과 거의 동시에 호출되므로
    // 거슬리지 않게 매우 짧은 soft click 으로 절제 (메인 사운드는 테마 reveal).
    playStudentPickSound() {
        if (!this.initialized) return;
        this._oneShot({ type: 'triangle', freq: 1100, dur: 0.04,
                        peak: 0.06, attack: 0.001 });
    }
}

// 전역 사운드 매니저 인스턴스
const soundManager = new SoundManager();
