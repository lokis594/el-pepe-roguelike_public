/**
 * ============================================================================
 * SISTEMA DE SONIDO SINTETIZADO (WEB AUDIO API - CERO ARCHIVOS EXTERNOS)
 * ============================================================================
 */
const CUSTOM_AUDIO_CANDIDATES = {
    elPepe: ['El pepe.mp3', 'el pepe.mp3', 'el_pepe.mp3', 'El_pepe.mp3'],
    pepeMuerte: ['Pepe_Muerte.mp3', 'pepe_muerte.mp3'],
    eteSech: ['ete sech.mp3', 'ete_sech.mp3', 'Ete_sech.mp3'],
    bombaGrito: ['Bomba_Grito.mp3', 'bomba_grito.mp3'],
    risaPepin: ['Risa_pepin.mp3', 'risa_pepin.mp3'],
    risinMuerte: ['Risin_Muerte.mp3', 'risin_muerte.mp3'],
    lolaBlaster: ['Lola_Blaster.mp3', 'lola_blaster.mp3'],
    belcesword: ['Belcesword.mp3', 'belcesword.mp3'],
    muerteOxxo: ['Muerte oxxo.mp3', 'muerte oxxo.mp3', 'Muerte_oxxo.mp3', 'muerte_oxxo.mp3']
};

class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        let savedVol = null;
        try {
            savedVol = typeof localStorage !== 'undefined' ? localStorage.getItem('pepe_master_volume') : null;
        } catch(e) {}
        this.masterVolume = savedVol !== null ? Math.max(0, Math.min(1, parseFloat(savedVol))) : 0.8;
        this.customAudioResolvedSrc = {};
        this.customAudioFailed = {};
        this.customLastPlayed = {};
        this.activeCustomAudios = [];
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && !this.masterGain) this.getMasterNode();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    }

    setVolume(vol) {
        this.masterVolume = Math.max(0, Math.min(1, vol));
        if (this.ctx && this.masterGain) this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        for (let i = this.activeCustomAudios.length - 1; i >= 0; i--) {
            const entry = this.activeCustomAudios[i];
            if (!entry || !entry.audio || entry.audio.ended) {
                this.activeCustomAudios.splice(i, 1);
                continue;
            }
            entry.audio.volume = Math.max(0, Math.min(1, this.masterVolume * (entry.volumeScale || 1)));
        }
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('pepe_master_volume', this.masterVolume.toString());
        } catch(e) {}
    }

    getMasterNode() {
        if (!this.ctx) return null;
        if (!this.masterGain) {
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);
        }
        return this.masterGain;
    }

    // Helper reutilizable: uno o varios osciladores (pairs = [[freqIni, freqFin], ...]) con barrido de
    // frecuencia (fDur, exponencial o lineal) y envolvente de volumen exponencial (gDur) hacia el nodo maestro.
    playTone(type, pairs, fDur, vol, gDur, stopAt, linear = false) {
        if (!this.ctx) return;
        const dest = this.getMasterNode();
        if (!dest) return;
        try {
            const now = this.ctx.currentTime;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + gDur);
            gain.connect(dest);
            for (const [f0, f1] of pairs) {
                const osc = this.ctx.createOscillator();
                osc.type = type;
                osc.frequency.setValueAtTime(f0, now);
                if (linear) osc.frequency.linearRampToValueAtTime(f1, now + fDur);
                else osc.frequency.exponentialRampToValueAtTime(f1, now + fDur);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + stopAt);
            }
        } catch(e) {}
    }

    // Tajo de espada: Barrido rápido de frecuencia (sawtooth corto de 120ms)
    playSwordSlash() { this.playTone('sawtooth', [[440, 75]], 0.12, 0.24, 0.12, 0.13); }

    // Disparo de pistola: Pulso agudo descendente (square de 800Hz a 150Hz en 100ms)
    playGunshot() { this.playTone('square', [[800, 150]], 0.10, 0.28, 0.10, 0.11); }

    // Ráfaga de rifle de asalto: chasquido percusivo seco (ruido filtrado + golpe grave corto)
    playRifleShot() {
        if (!this.ctx) return;
        const dest = this.getMasterNode();
        if (!dest) return;
        try {
            const now = this.ctx.currentTime;
            const len = Math.floor(this.ctx.sampleRate * 0.05);
            const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const hp = this.ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 1400;
            const ng = this.ctx.createGain();
            ng.gain.setValueAtTime(0.22, now);
            ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            noise.connect(hp);
            hp.connect(ng);
            ng.connect(dest);
            noise.start(now);
        } catch(e) {}
        this.playTone('square', [[320, 70]], 0.04, 0.14, 0.045, 0.05);
    }

    // Paso pesado del Coloso: golpe sordo grave
    playHeavyStep() { this.playTone('sine', [[90, 35]], 0.16, 0.3, 0.18, 0.2); }

    // Impacto / Daño a enemigo: Golpe grave corto (triangle a 120Hz)
    playEnemyHit() { this.playTone('triangle', [[120, 40]], 0.08, 0.25, 0.08, 0.09); }

    // Daño recibido por el jugador: Sonido distorsionado de alerta grave (ligera disonancia agresiva)
    playPlayerHurt() { this.playTone('sawtooth', [[95, 45], [103, 48]], 0.22, 0.35, 0.22, 0.23); }

    // Recoger ítem / arma: Arpegio ascendente alegre de 2 notas (Do5 -> Sol5)
    playPickup() {
        if (!this.ctx) return;
        const dest = this.getMasterNode();
        if (!dest) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(783.99, now + 0.07);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.setValueAtTime(0.25, now + 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.21);
        } catch(e) {}
    }

    // Moneda / Bolsa de Oro: Tintineo metálico corto y brillante
    playGoldPickup() {
        if (!this.ctx) return;
        const dest = this.getMasterNode();
        if (!dest) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(987.77, now);        // Si5
            osc.frequency.setValueAtTime(1318.51, now + 0.045); // Mi6
            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.17);
        } catch(e) {}
    }

    // Beber Poción: Burbujeo / acorde cristalino ascendente
    playPotionUse() {
        this.playTone('sine', [[392, 784], [587.33, 1174.66]], 0.18, 0.26, 0.22, 0.23);
    }

    // Recarga mecánica del Rifle de Asalto: Doble clic metálico rápido
    playRifleReload() {
        if (!this.ctx) return;
        const dest = this.getMasterNode();
        if (!dest) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.setValueAtTime(520, now + 0.045);
            gain.gain.setValueAtTime(0.20, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.13);
        } catch(e) {}
    }

    stopCustomSound(key = null) {
        for (let i = this.activeCustomAudios.length - 1; i >= 0; i--) {
            const entry = this.activeCustomAudios[i];
            if (!entry || !entry.audio) {
                this.activeCustomAudios.splice(i, 1);
                continue;
            }
            if (!key || entry.key === key) {
                try {
                    entry.audio.pause();
                    entry.audio.currentTime = 0;
                } catch(e) {}
                this.activeCustomAudios.splice(i, 1);
            }
        }
    }

    playCustomSound(key, options = {}) {
        const candidates = CUSTOM_AUDIO_CANDIDATES[key];
        const fallback = typeof options.onFallback === 'function' ? options.onFallback : null;
        const cooldownMs = options.cooldownMs !== undefined ? options.cooldownMs : 70;
        const overlap = options.overlap !== false;
        const volumeScale = options.volumeScale !== undefined ? options.volumeScale : 1;

        const now = Date.now();
        if (cooldownMs > 0 && now - (this.customLastPlayed[key] || 0) < cooldownMs) {
            return false;
        }
        this.customLastPlayed[key] = now;

        if (!candidates || candidates.length === 0 || typeof Audio === 'undefined' || this.customAudioFailed[key]) {
            if (fallback) fallback();
            return false;
        }

        if (!overlap) {
            this.stopCustomSound(key);
        } else if (this.activeCustomAudios.length > 24) {
            this.activeCustomAudios = this.activeCustomAudios.filter(e => e.audio && !e.audio.ended);
        }

        const resolvedSrc = this.customAudioResolvedSrc[key];
        const tryList = resolvedSrc ? [resolvedSrc] : candidates;

        const attemptPlay = (idx) => {
            if (idx >= tryList.length) {
                if (!resolvedSrc) this.customAudioFailed[key] = true;
                if (fallback) fallback();
                return;
            }
            const rawSrc = tryList[idx];
            const encodedSrc = encodeURI(rawSrc);
            let audio;
            try {
                audio = new Audio(encodedSrc);
            } catch(e) {
                attemptPlay(idx + 1);
                return;
            }

            audio.volume = Math.max(0, Math.min(1, this.masterVolume * volumeScale));
            const entry = { key, audio, volumeScale };
            this.activeCustomAudios.push(entry);

            let settled = false;
            const cleanupEntry = () => {
                const pos = this.activeCustomAudios.indexOf(entry);
                if (pos !== -1) this.activeCustomAudios.splice(pos, 1);
            };
            const handleFailure = () => {
                if (settled) return;
                settled = true;
                cleanupEntry();
                attemptPlay(idx + 1);
            };

            if (typeof audio.addEventListener === 'function') {
                audio.addEventListener('ended', cleanupEntry, { once: true });
                audio.addEventListener('error', handleFailure, { once: true });
            } else {
                audio.onended = cleanupEntry;
                audio.onerror = handleFailure;
            }

            try {
                const playPromise = audio.play();
                if (playPromise && typeof playPromise.then === 'function') {
                    playPromise.then(() => {
                        if (!settled) {
                            settled = true;
                            this.customAudioResolvedSrc[key] = rawSrc;
                        }
                    }).catch((err) => {
                        if (err && err.name === 'NotAllowedError') {
                            cleanupEntry();
                            if (fallback) fallback();
                            return;
                        }
                        handleFailure();
                    });
                } else {
                    this.customAudioResolvedSrc[key] = rawSrc;
                }
            } catch(e) {
                handleFailure();
            }
        };

        attemptPlay(0);
        return true;
    }

    // Ataques y muerte de El Pepe Maestro
    playElPepe(options = {}) {
        return this.playCustomSound('elPepe', {
            overlap: options.overlap !== false,
            cooldownMs: options.cooldownMs !== undefined ? options.cooldownMs : 120,
            onFallback: () => this.playTone('sawtooth', [[80, 35]], 0.45, 0.38, 0.45, 0.46, true)
        });
    }

    playPepeMuerte() {
        this.stopCustomSound('elPepe');
        return this.playCustomSound('pepeMuerte', {
            overlap: false,
            cooldownMs: 250,
            onFallback: () => this.playTone('sawtooth', [[180, 32], [95, 22]], 0.55, 0.45, 0.56, 0.58, true)
        });
    }

    // Salto sísmico de Ete Sech
    playEteSech() {
        return this.playCustomSound('eteSech', {
            overlap: true,
            cooldownMs: 180,
            onFallback: () => this.playBossRoar()
        });
    }

    // Ataques de El Pepe Maestro: Rugido/alarma grave al embestir
    playBossRoar() { this.playTone('sawtooth', [[80, 35]], 0.45, 0.38, 0.45, 0.46, true); }

    // Ataques de El Pepe Maestro: Estruendo sísmico al caer del salto
    playBossSlam() { this.playTone('triangle', [[65, 18]], 0.55, 0.5, 0.55, 0.56); }

    // Risín Pepín: Carcajada malévola (.mp3 con fallback sintetizado) y muerte
    playRisinLaugh() {
        return this.playCustomSound('risaPepin', {
            overlap: true,
            cooldownMs: 160,
            onFallback: () => this.playTone('sawtooth', [[320, 580], [480, 240]], 0.28, 0.32, 0.30, 0.32)
        });
    }

    playRisinMuerte() {
        this.stopCustomSound('risaPepin');
        return this.playCustomSound('risinMuerte', {
            overlap: false,
            cooldownMs: 250,
            onFallback: () => this.playTone('sawtooth', [[420, 90], [260, 45]], 0.60, 0.45, 0.62, 0.64, true)
        });
    }

    // Risín Pepín: Disparo del Láser de Risa Descontrolada
    playLaserBeam() {
        this.playTone('sawtooth', [[520, 140], [780, 210]], 0.45, 0.34, 0.45, 0.46);
    }

    // Risín Pepín (Intro): Risa malévola de payaso en 8-bit (notas square rítmicas descendentes "JA-JA-JA-JA-JA")
    playClownLaugh8Bit() {
        try {
            if (!this.ctx) this.init();
            if (!this.ctx) return;
            const dest = this.getMasterNode();
            if (!dest) return;
            const now = this.ctx.currentTime;
            const notes = [880, 784, 698.46, 659.25, 587.33, 523.25, 698.46];
            notes.forEach((freq, idx) => {
                const t0 = now + idx * 0.11;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq * 1.22, t0);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t0 + 0.085);
                gain.gain.setValueAtTime(0.24, t0);
                gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
                osc.connect(gain);
                gain.connect(dest);
                osc.start(t0);
                osc.stop(t0 + 0.095);
            });
        } catch(e) {}
    }

    // Golpe seco contra la puerta en la intro de Risín Pepín
    playDoorBang() {
        try {
            if (!this.ctx) this.init();
            this.playTone('triangle', [[110, 28], [75, 20]], 0.22, 0.48, 0.24, 0.25);
        } catch(e) {}
    }

    // Impacto somnífero de Gárgola (step 1 = aviso, step 2 = dormido)
    playSleepHit(step = 1) {
        if (step === 1) {
            this.playTone('sine', [[520, 340]], 0.16, 0.25, 0.18, 0.19);
        } else {
            this.playTone('triangle', [[440, 180], [660, 270]], 0.38, 0.32, 0.40, 0.42);
        }
    }

    // Tic de veneno (Patirrona) y salpicadura de charco debilitador (Risín Pepín)
    playPoisonTick() {
        this.playTone('sawtooth', [[260, 140]], 0.12, 0.16, 0.13, 0.14);
    }

    playPuddleSplash() {
        this.playTone('triangle', [[380, 110], [220, 90]], 0.24, 0.34, 0.26, 0.27);
    }

    // Explosión de Bomba Grito, disparo cargado de Lola Blaster, 3er golpe Belcesword y muerte del jugador
    playBombExplosion() {
        return this.playCustomSound('bombaGrito', {
            overlap: true,
            cooldownMs: 70,
            onFallback: () => this.playTone('sawtooth', [[160, 38], [240, 52]], 0.32, 0.36, 0.34, 0.36)
        });
    }

    playLolaBlasterCharged() {
        return this.playCustomSound('lolaBlaster', {
            overlap: true,
            cooldownMs: 80,
            onFallback: () => this.playTone('sawtooth', [[320, 980], [640, 180]], 0.22, 0.32, 0.24, 0.25)
        });
    }

    playBelcesword() {
        return this.playCustomSound('belcesword', {
            overlap: true,
            cooldownMs: 80,
            onFallback: () => this.playTone('sawtooth', [[460, 140], [720, 220]], 0.20, 0.30, 0.22, 0.23)
        });
    }

    playMuerteOxxo() {
        return this.playCustomSound('muerteOxxo', {
            overlap: false,
            cooldownMs: 200,
            onFallback: () => this.playTone('sawtooth', [[220, 55], [140, 42]], 0.45, 0.35, 0.46, 0.48)
        });
    }
}

const soundManager = new SoundManager();

// Recursos de imagen compartidos (skins)
const playerImg = new Image();
playerImg.src = 'player.png';
const meleeImg = new Image();
meleeImg.src = 'melee.png';
const rangedImg = new Image();
rangedImg.src = 'ranged.png';
const pepeImg = new Image();
pepeImg.src = 'pepe.png';
const etesechImg = new Image();
etesechImg.src = 'etesech.png';
const risinImg = new Image();
risinImg.src = 'risinpepin.png';
const villaImg = new Image();
villaImg.onerror = () => {
    if (!villaImg._retried) {
        villaImg._retried = true;
        villaImg.src = 'Villa.png';
    }
};
villaImg.src = 'villa.png';
const patirronaImg = new Image();
patirronaImg.onerror = () => {
    if (!patirronaImg._retried) {
        patirronaImg._retried = true;
        patirronaImg.src = 'Patirrona.png';
    }
};
patirronaImg.src = 'patirrona.png';

// Pociones reales (v1.4.0)
const potionHealImg = new Image();
potionHealImg.src = 'central.png';

const potionSpeedImg = new Image();
potionSpeedImg.src = 'vive100.png';

const potionFuryImg = new Image();
potionFuryImg.src = 'smirnoff.png';
potionFuryImg.onerror = () => {
    if (!potionFuryImg._retried) {
        potionFuryImg._retried = true;
        potionFuryImg.src = 'Smirnoff.png';
    }
};

// Helper reutilizable con fallback de mayúsculas/minúsculas para nuevos Power-Ups (v1.7.0)
function loadImageWithFallback(primarySrc, fallbackSrc) {
    const img = new Image();
    img.onerror = () => {
        if (!img._retried && fallbackSrc) {
            img._retried = true;
            img.src = fallbackSrc;
        }
    };
    img.src = primarySrc;
    return img;
}

const bombaGritoImg = loadImageWithFallback('Bomba_grito.png', 'bomba_grito.png');
const lolaBlasterImg = loadImageWithFallback('Lola_Blaster.png', 'lola_blaster.png');
const lolaBlaster2Img = loadImageWithFallback('Lola_Blaster2.png', 'lola_blaster2.png');
const belceswordImg = loadImageWithFallback('Belcesword.png', 'belcesword.png');
