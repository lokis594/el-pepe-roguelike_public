/**
 * ============================================================================
 * SISTEMA DE SONIDO SINTETIZADO (WEB AUDIO API - CERO ARCHIVOS EXTERNOS)
 * ============================================================================
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        let savedVol = null;
        try {
            savedVol = typeof localStorage !== 'undefined' ? localStorage.getItem('pepe_master_volume') : null;
        } catch(e) {}
        this.masterVolume = savedVol !== null ? Math.max(0, Math.min(1, parseFloat(savedVol))) : 0.8;
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

    // Ataques de El Pepe Maestro: Rugido/alarma grave al embestir
    playBossRoar() { this.playTone('sawtooth', [[80, 35]], 0.45, 0.38, 0.45, 0.46, true); }

    // Ataques de El Pepe Maestro: Estruendo sísmico al caer del salto
    playBossSlam() { this.playTone('triangle', [[65, 18]], 0.55, 0.5, 0.55, 0.56); }
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
