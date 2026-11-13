/**
 * ============================================================================
 * CONTROLADOR PRINCIPAL DEL JUEGO: GAME
 * ============================================================================
 */
class Game {
    // Estado del juego: al cambiarlo se sincroniza el estilo de la etiqueta de versión
    // (amarilla en el menú principal, gris discreta en partida / pausa / pantallas finales).
    get state() { return this._state; }
    set state(v) {
        this._state = v;
        const tag = document.getElementById('version-tag');
        if (tag) tag.classList.toggle('in-game', v !== 'MENU');
        const patchBtn = document.getElementById('btn-patch-notes');
        if (patchBtn) patchBtn.classList.toggle('hidden', v !== 'MENU');
        if (this.syncAdminButtonsVisibility) this.syncAdminButtonsVisibility();
    }

    get isMobileView() {
        return this.isTouchDevice || this.width < 1024 || this.height < 600;
    }

    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Soporte de Alta Densidad de Píxeles (Retina / HD) y Dimensiones Dinámicas
        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = Math.round(this.width * this.dpr);
        this.canvas.height = Math.round(this.height * this.dpr);

        // Estados: 'MENU' | 'PLAYING' | 'BOSS_INTRO' | 'VICTORY' | 'GAMEOVER'
        this.state = 'MENU';
        this.lastTime = performance.now();
        this.globalTime = 0;

        // Nivel actual, mundo y cámara dinámica
        this.level = 1;
        this.runId = 0;
        this.worldW = 1100;
        this.worldH = 720;
        this.arena = {
            x: 60,
            y: 60,
            w: this.worldW - 120,
            h: this.worldH - 120
        };
        this.camera = { x: 0, y: 0 };
        this.spawners = [];

        // Cámara y Screen Shake
        this.shakeIntensity = 0;
        this.shakeTimer = 0;
        this.bossIntroTimer = 0;

        // Controles de entrada (PC)
        this.keys = {};
        this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, active: false };

        // Controles táctiles móviles y soporte multitouch independiente
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.cameraZoom = this.isMobileView ? 0.68 : 1.0;
        this.touchControls = {
            joystick: {
                active: false,
                touchId: null,
                baseX: 140,
                baseY: 580,
                stickX: 140,
                stickY: 580,
                dirX: 0,
                dirY: 0,
                radius: 60,
                stickRadius: 25
            },
            buttons: {
                attack: {
                    x: this.width - 100,
                    y: this.height - 120,
                    r: 45,
                    down: false,
                    touchId: null,
                    hasDragged: false,
                    aimAngle: 0
                },
                dash: {
                    x: this.width - 210,
                    y: this.height - 90,
                    r: 32,
                    down: false,
                    touchId: null
                },
                weapon: {
                    x: this.width - 100,
                    y: this.height - 230,
                    r: 30,
                    down: false,
                    touchId: null
                },
                potions: {
                    heal: { x: this.width - 280, y: this.height - 84, r: 22, down: false, touchId: null, color: '#4ade80', key: '4' },
                    fury: { x: this.width - 266, y: this.height - 146, r: 22, down: false, touchId: null, color: '#f97316', key: '5' },
                    speed: { x: this.width - 204, y: this.height - 162, r: 22, down: false, touchId: null, color: '#38bdf8', key: '6' }
                },
                pause: {
                    x: this.width - 55,
                    y: 18,
                    w: 42,
                    h: 42
                },
                fullscreen: {
                    x: this.width - 105,
                    y: 18,
                    w: 42,
                    h: 42
                }
            },
            isAttackTouchHeld: false
        };
        this.updateControlPositions();

        // Eventos de Redimensionamiento Dinámico y Pantalla Completa
        window.addEventListener('resize', () => this.resizeCanvas());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.resizeCanvas(), 100);
        });
        document.addEventListener('fullscreenchange', () => this.resizeCanvas());
        document.addEventListener('webkitfullscreenchange', () => this.resizeCanvas());

        // Entidades y contenedores
        this.player = null;
        this.enemies = [];
        this.projectiles = [];
        this.puddles = [];
        this.bombs = [];
        this.pillars = [];
        this.pickups = [];
        this.particles = [];
        this.floatingTexts = [];
        this.torches = [];
        this.boss = null;
        this.waveGatePos = { x: 685, y: 360 };
        this.postPepePowerupGate = false;
        this.powerupGatePos = { x: 550, y: 330 };
        this.isPowerupOpen = false;
        this.selectedPowerup = null;

        // Modo Admin Secreto (en memoria de sesión; jamás se guarda en localStorage)
        this.isAdminUnlocked = false;
        this.titleClickCount = 0;
        this.titleAdminButtonRevealed = false;
        this.isAdminOpen = false;
        this.adminState = {
            isImmortal: false,
            infiniteItems: false,
            weaponOverrides: { sword: null, gun: null, rifle: null },
            powerUps: { bombaGrito: null, lolaBlaster: null, belcesword: null }
        };

        // Progresión de Oleadas (5 Rondas), Preparación Pre-Jefe y Estado de Pausa
        this.currentWave = 1;
        this.maxWaves = 5;
        this.waveTransitionTimer = 0;
        this.waveCooldown = 0;
        this.waveIntermission = false;
        this.preBossPrepare = false;
        this.isShopOpen = false;
        this.shopPos = { x: 410, y: 340 };
        this.dancerPos = { x: 690, y: 350 };
        this.waveTotalEnemies = 7;
        this.waveGoldDropped = 0;
        this.waveGoldTarget = 4;
        this.enemiesKilledCount = 0;
        this.isPaused = false;
        this.gunDropped = false;

        // Modo Bajo Rendimiento (desactivado por defecto para todos los usuarios)
        let savedLowSpec = null;
        try {
            savedLowSpec = localStorage.getItem('pepe_low_spec');
        } catch(e) {}
        this.lowSpecMode = savedLowSpec === '1'; // estrictamente false por defecto
        this.offscreenLightCanvas = this.buildOffscreenLightCanvas();

        // Interceptor de shadowBlur para Modo Bajo Rendimiento (cero costo cuando está desactivado)
        try {
            const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
            if (desc && desc.set) {
                const origSet = desc.set;
                const self = this;
                Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
                    get: function() { return desc.get.call(this); },
                    set: function(val) {
                        if (self.lowSpecMode) {
                            origSet.call(this, 0);
                        } else {
                            origSet.call(this, val);
                        }
                    },
                    configurable: true,
                    enumerable: true
                });
            }
        } catch(e) {}

        this.setupInputs();
        this.setupUI();
        this.initArenaEnvironment();

        requestAnimationFrame((t) => this.loop(t));
    }

    buildOffscreenLightCanvas() {
        try {
            const size = 300;
            const half = size / 2;
            const cvs = document.createElement('canvas');
            cvs.width = size;
            cvs.height = size;
            const c = cvs.getContext('2d');
            if (c) {
                const grad = c.createRadialGradient(half, half, 3, half, half, half);
                grad.addColorStop(0, 'rgba(255, 170, 60, 0.24)');
                grad.addColorStop(0.35, 'rgba(234, 88, 12, 0.10)');
                grad.addColorStop(0.7, 'rgba(234, 88, 12, 0.03)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                c.fillStyle = grad;
                c.beginPath();
                c.arc(half, half, half, 0, Math.PI * 2);
                c.fill();
            }
            return cvs;
        } catch(e) {
            return null;
        }
    }

    showMenuView(viewName) {
        const mainView = document.getElementById('menu-main-view');
        const controlsView = document.getElementById('menu-controls-view');
        const optionsView = document.getElementById('menu-options-view');
        if (mainView) mainView.classList.toggle('hidden', viewName !== 'main');
        if (controlsView) controlsView.classList.toggle('hidden', viewName !== 'controls');
        if (optionsView) optionsView.classList.toggle('hidden', viewName !== 'options');
    }

    togglePause(forceState) {
        if (this.state !== 'PLAYING' && this.state !== 'BOSS_INTRO' && !this.isPaused) return;
        const targetState = forceState !== undefined ? forceState : !this.isPaused;
        this.setPaused(targetState);
    }

    setPaused(val) {
        this.isPaused = !!val;
        if (this.isPaused) {
            // 1. Corrección obligatoria de vibración: Forzar inmediatamente shakeTimer y shakeIntensity a cero
            this.shakeTimer = 0;
            this.shakeIntensity = 0;

            // 2. Liberar controles e interacciones activas para evitar disparos accidentales al reanudar
            this.mouse.down = false;
            if (this.touchControls) {
                const js = this.touchControls.joystick;
                js.active = false;
                js.touchId = null;
                js.stickX = js.baseX;
                js.stickY = js.baseY;
                js.dirX = 0;
                js.dirY = 0;
                this.touchControls.buttons.attack.down = false;
                this.touchControls.buttons.dash.down = false;
                this.touchControls.buttons.weapon.down = false;
                this.touchControls.isAttackTouchHeld = false;
            }

            // 3. Mostrar el menú de pausa interactivo
            if (this.ui && this.ui.pauseScreen) {
                this.ui.pauseScreen.classList.remove('hidden');
                this.showPauseView('main');
            }
            this.syncPauseSettingsUI();
        } else {
            // Ocultar el menú de pausa
            if (this.ui && this.ui.pauseScreen) {
                this.ui.pauseScreen.classList.add('hidden');
            }
            this.lastTime = performance.now();
        }
    }

    showPauseView(viewName) {
        const mainView = document.getElementById('pause-main-view');
        const optionsView = document.getElementById('pause-options-view');
        if (mainView) mainView.classList.toggle('hidden', viewName !== 'main');
        if (optionsView) optionsView.classList.toggle('hidden', viewName !== 'options');
        if (viewName === 'options') {
            this.syncPauseSettingsUI();
        }
    }

    isAnyMenuOpen() {
        if (this.state === 'MENU' || this.isPaused || this.isAdminOpen || this.isPowerupOpen || this.isShopOpen) return true;
        const patchModal = document.getElementById('patch-notes-modal');
        if (patchModal && !patchModal.classList.contains('hidden')) return true;
        const confirmModal = document.getElementById('newgame-confirm-modal');
        if (confirmModal && !confirmModal.classList.contains('hidden')) return true;
        const passModal = document.getElementById('admin-password-modal');
        if (passModal && !passModal.classList.contains('hidden')) return true;
        const adminModal = document.getElementById('admin-panel-modal');
        if (adminModal && !adminModal.classList.contains('hidden')) return true;
        return false;
    }

    syncPauseSettingsUI() {
        const pct = Math.round(soundManager.masterVolume * 100);
        const pauseSlider = document.getElementById('slider-pause-volume');
        const pauseVolText = document.getElementById('pause-volume-val-text');
        if (pauseSlider) pauseSlider.value = pct;
        if (pauseVolText) pauseVolText.textContent = pct + '%';

        const mainSlider = document.getElementById('slider-volume');
        const mainVolText = document.getElementById('volume-val-text');
        if (mainSlider) mainSlider.value = pct;
        if (mainVolText) mainVolText.textContent = pct + '%';

        if (this.updateLowSpecButtons) {
            this.updateLowSpecButtons();
        }
    }

    saveProgress() {
        try {
            const p = this.player;
            if (!p) return;
            const data = {
                savedLevel: 2,
                gold: p.gold || 0,
                potions: p.potions ? {
                    heal: p.potions.heal || 0,
                    fury: p.potions.fury || 0,
                    speed: p.potions.speed || 0
                } : { heal: 0, fury: 0, speed: 0 },
                hasPistol: !!(p.hasGun || p.hasPistol),
                hasRifle: true,
                powerup: this.selectedPowerup || p.powerup || null,
                powerUps: p.powerUps ? { ...p.powerUps } : null
            };
            localStorage.setItem('pepe_roguelike_save', JSON.stringify(data));
        } catch (e) {}
        this.updateContinueButtonUI();
    }

    getSavedProgress() {
        try {
            const raw = localStorage.getItem('pepe_roguelike_save');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.savedLevel === 2) return parsed;
        } catch (e) {}
        return null;
    }

    updateContinueButtonUI() {
        const btn = document.getElementById('btn-continue');
        if (!btn) return;
        const save = this.getSavedProgress();
        const hasSave = !!save;
        btn.disabled = !hasSave;
        btn.classList.toggle('btn-locked', !hasSave);
        btn.textContent = hasSave ? 'CONTINUAR PARTIDA' : '🔒 CONTINUAR PARTIDA';
    }

    handleStartButtonClick() {
        if (this.getSavedProgress()) {
            const modal = document.getElementById('newgame-confirm-modal');
            if (modal) modal.classList.remove('hidden');
        } else {
            this.startNewRun();
        }
    }

    confirmNewGameFromZero() {
        try {
            localStorage.removeItem('pepe_roguelike_save');
        } catch (e) {}
        this.updateContinueButtonUI();
        this.closeNewGameConfirmModal();
        this.startNewRun();
    }

    closeNewGameConfirmModal() {
        const modal = document.getElementById('newgame-confirm-modal');
        if (modal) modal.classList.add('hidden');
    }

    openPatchNotesModal() {
        if (this.state !== 'MENU') return;
        const modal = document.getElementById('patch-notes-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closePatchNotesModal() {
        const modal = document.getElementById('patch-notes-modal');
        if (modal) modal.classList.add('hidden');
    }

    registerTitleClick() {
        if (this.state !== 'MENU') return;
        this.titleClickCount = (this.titleClickCount || 0) + 1;
        if (this.titleClickCount >= 7) {
            this.titleAdminButtonRevealed = true;
            this.syncAdminButtonsVisibility();
        }
    }

    syncAdminButtonsVisibility() {
        const menuBtn = document.getElementById('btn-admin-access');
        const floatBtn = document.getElementById('btn-admin-floating');
        const inMenu = this.state === 'MENU';
        if (menuBtn) {
            menuBtn.classList.toggle('hidden', !(inMenu && (this.titleAdminButtonRevealed || this.isAdminUnlocked)));
        }
        if (floatBtn) {
            floatBtn.classList.toggle('hidden', !(!inMenu && this.isAdminUnlocked));
        }
    }

    openAdminPasswordModal() {
        const modal = document.getElementById('admin-password-modal');
        const input = document.getElementById('admin-password-input');
        const err = document.getElementById('admin-password-error');
        if (err) err.classList.add('hidden');
        if (input) {
            input.value = '';
        }
        if (modal) modal.classList.remove('hidden');
        if (input) {
            setTimeout(() => { try { input.focus(); } catch(e) {} }, 20);
        }
    }

    closeAdminPasswordModal() {
        const modal = document.getElementById('admin-password-modal');
        const input = document.getElementById('admin-password-input');
        const err = document.getElementById('admin-password-error');
        if (err) err.classList.add('hidden');
        if (input) input.value = '';
        if (modal) modal.classList.add('hidden');
    }

    submitAdminPassword() {
        const input = document.getElementById('admin-password-input');
        const err = document.getElementById('admin-password-error');
        const val = input ? input.value : '';
        if (val === 'peponciooaxaco67') {
            this.isAdminUnlocked = true;
            this.closeAdminPasswordModal();
            this.syncAdminButtonsVisibility();
            this.openAdminPanel();
            return true;
        }
        if (err) err.classList.remove('hidden');
        if (input) {
            input.value = '';
            try { input.focus(); } catch(e) {}
        }
        return false;
    }

    openAdminPanel() {
        if (!this.isAdminUnlocked) return;
        this.isAdminOpen = true;
        this.mouse.down = false;
        this.keys = {};
        if (this.touchControls) {
            this.touchControls.isAttackTouchHeld = false;
            this.touchControls.joystick.active = false;
        }
        this.syncAdminPanelUI();
        const modal = document.getElementById('admin-panel-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closeAdminPanel() {
        this.isAdminOpen = false;
        const modal = document.getElementById('admin-panel-modal');
        if (modal) modal.classList.add('hidden');
    }

    exitAdminMode() {
        this.closeAdminPanel();
        this.closeAdminPasswordModal();
        this.isAdminUnlocked = false;
        this.titleAdminButtonRevealed = false;
        this.titleClickCount = 0;
        this.syncAdminButtonsVisibility();
    }

    applyAdminStateToPlayer(p) {
        if (!p || !this.adminState) return;
        p.isImmortal = !!this.adminState.isImmortal;
        p.infiniteItems = !!this.adminState.infiniteItems;
        if (p.infiniteItems) {
            p.potions.heal = p.maxPotionStack;
            p.potions.fury = p.maxPotionStack;
            p.potions.speed = p.maxPotionStack;
            p.pistolAmmo = p.pistolMaxAmmo;
            p.rifleAmmo = p.rifleMaxAmmo;
            p.gold = Math.max(p.gold || 0, 999);
        }
        const wo = this.adminState.weaponOverrides || {};
        if (wo.sword !== null && wo.sword !== undefined) p.hasSword = !!wo.sword;
        if (wo.gun !== null && wo.gun !== undefined) {
            p.hasGun = !!wo.gun;
            p.hasPistol = !!wo.gun;
        }
        if (wo.rifle !== null && wo.rifle !== undefined) p.hasRifle = !!wo.rifle;

        const curInvalid = (p.currentWeapon === 'SWORD' && !p.hasSword)
            || (p.currentWeapon === 'GUN' && !p.hasGun)
            || (p.currentWeapon === 'RIFLE' && !p.hasRifle);
        if (curInvalid) {
            if (p.hasSword) p.currentWeapon = 'SWORD';
            else if (p.hasGun) p.currentWeapon = 'GUN';
            else if (p.hasRifle) p.currentWeapon = 'RIFLE';
        }

        const pu = this.adminState.powerUps || {};
        if (pu.bombaGrito !== null && pu.bombaGrito !== undefined && p.setPowerUpEnabled) {
            p.setPowerUpEnabled('BOMBA_GRITO', !!pu.bombaGrito);
        }
        if (pu.lolaBlaster !== null && pu.lolaBlaster !== undefined && p.setPowerUpEnabled) {
            p.setPowerUpEnabled('LOLA_BLASTER', !!pu.lolaBlaster);
        }
        if (pu.belcesword !== null && pu.belcesword !== undefined && p.setPowerUpEnabled) {
            p.setPowerUpEnabled('BELCESWORD', !!pu.belcesword);
        }
    }

    syncAdminPanelUI() {
        const p = this.player;
        const setToggle = (id, label, on) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = `${label}: ${on ? 'ON' : 'OFF'}`;
            el.classList.toggle('admin-on', !!on);
            el.classList.toggle('admin-off', !on);
        };
        const immortalOn = p ? !!p.isImmortal : !!this.adminState.isImmortal;
        const infiniteOn = p ? !!p.infiniteItems : !!this.adminState.infiniteItems;
        const swordOn = p ? !!p.hasSword : (this.adminState.weaponOverrides.sword !== null ? !!this.adminState.weaponOverrides.sword : true);
        const pistolOn = p ? !!p.hasGun : !!this.adminState.weaponOverrides.gun;
        const rifleOn = p ? !!p.hasRifle : !!this.adminState.weaponOverrides.rifle;
        const bombaOn = p && p.hasPowerUp ? p.hasPowerUp('BOMBA_GRITO') : !!this.adminState.powerUps.bombaGrito;
        const lolaOn = p && p.hasPowerUp ? p.hasPowerUp('LOLA_BLASTER') : !!this.adminState.powerUps.lolaBlaster;
        const belceOn = p && p.hasPowerUp ? p.hasPowerUp('BELCESWORD') : !!this.adminState.powerUps.belcesword;

        setToggle('btn-admin-immortal', '🛡️ MODO INMORTAL', immortalOn);
        setToggle('btn-admin-infinite', '♾️ ÍTEMS Y MUNICIÓN INFINITOS', infiniteOn);
        setToggle('btn-admin-weapon-sword', '⚔️ ESPADA', swordOn);
        setToggle('btn-admin-weapon-pistol', '🔫 PISTOLA', pistolOn);
        setToggle('btn-admin-weapon-rifle', '🔥 RIFLE', rifleOn);
        setToggle('btn-admin-pu-bomba', '💣 Bomba Grito', bombaOn);
        setToggle('btn-admin-pu-lola', '⚡ Lola Blaster', lolaOn);
        setToggle('btn-admin-pu-belce', '🟣 Belcesword', belceOn);
    }

    adminTeleportLevel(targetLevel) {
        if (!this.isAdminUnlocked) return;
        this.closeAdminPanel();
        this.setPaused(false);
        this.resetGame(targetLevel === 2 ? 2 : 1);
    }

    adminTeleportBoss(targetLevel) {
        if (!this.isAdminUnlocked) return;
        const lvl = targetLevel === 2 ? 2 : 1;
        this.closeAdminPanel();
        this.setPaused(false);
        this.resetGame(lvl);
        this.enemies = [];
        this.projectiles = [];
        this.puddles = [];
        this.bombs = [];
        this.waveIntermission = false;
        this.waveCooldown = 0;
        this.preBossPrepare = false;
        this.postPepePowerupGate = false;
        this.currentWave = this.maxWaves;
        this.triggerBossEntrance();
        this.updateHUD();
    }

    adminTeleportShop() {
        if (!this.isAdminUnlocked) return;
        this.closeAdminPanel();
        this.setPaused(false);
        if (!this.player || this.state === 'MENU' || this.state === 'GAMEOVER' || this.state === 'VICTORY') {
            this.resetGame(this.level === 2 ? 2 : 1);
        }
        this.enemies = [];
        this.projectiles = [];
        this.puddles = [];
        this.boss = null;
        this.postPepePowerupGate = false;
        this.waveIntermission = false;
        this.waveCooldown = 0;
        this.currentWave = this.maxWaves;
        this.setupPreBossRoom();
        if (this.player && this.shopPos) {
            this.player.x = this.shopPos.x + 65;
            this.player.y = this.shopPos.y + 40;
            this.updateCamera(0, true);
        }
        this.state = 'PLAYING';
        this.updateHUD();
    }

    adminSkipWave() {
        if (!this.isAdminUnlocked) return;
        this.closeAdminPanel();
        this.setPaused(false);
        if (!this.player || this.state === 'MENU' || this.state === 'GAMEOVER' || this.state === 'VICTORY') {
            this.resetGame(this.level === 2 ? 2 : 1);
        }
        this.enemies = [];
        this.projectiles = [];
        this.puddles = [];
        this.waveCooldown = 0;
        this.waveIntermission = false;
        if (!this.boss && !this.preBossPrepare) {
            if (this.currentWave < this.maxWaves) {
                this.currentWave++;
                this.spawnWave(this.currentWave);
            } else {
                this.setupPreBossRoom();
            }
        }
        this.state = 'PLAYING';
        this.updateHUD();
    }

    adminToggleImmortal() {
        if (!this.isAdminUnlocked) return;
        const next = !(this.player ? this.player.isImmortal : this.adminState.isImmortal);
        this.adminState.isImmortal = next;
        if (this.player) this.player.isImmortal = next;
        this.syncAdminPanelUI();
        this.updateHUD();
    }

    adminToggleInfiniteItems() {
        if (!this.isAdminUnlocked) return;
        const next = !(this.player ? this.player.infiniteItems : this.adminState.infiniteItems);
        this.adminState.infiniteItems = next;
        if (this.player) {
            this.player.infiniteItems = next;
            if (next) this.applyAdminStateToPlayer(this.player);
        }
        this.syncAdminPanelUI();
        this.updateHUD();
    }

    adminToggleWeapon(slot) {
        if (!this.isAdminUnlocked) return;
        const p = this.player;
        if (slot === 'sword') {
            const cur = p ? !!p.hasSword : (this.adminState.weaponOverrides.sword !== null ? !!this.adminState.weaponOverrides.sword : true);
            const next = !cur;
            this.adminState.weaponOverrides.sword = next;
            if (p) {
                p.hasSword = next;
                if (!next && p.currentWeapon === 'SWORD') {
                    if (p.hasGun) p.currentWeapon = 'GUN';
                    else if (p.hasRifle) p.currentWeapon = 'RIFLE';
                } else if (next && !p.hasGun && !p.hasRifle) {
                    p.currentWeapon = 'SWORD';
                }
            }
        } else if (slot === 'gun') {
            const cur = p ? !!p.hasGun : !!this.adminState.weaponOverrides.gun;
            const next = !cur;
            this.adminState.weaponOverrides.gun = next;
            if (p) {
                p.hasGun = next;
                p.hasPistol = next;
                if (next) p.currentWeapon = 'GUN';
                else if (p.currentWeapon === 'GUN') p.currentWeapon = p.hasSword ? 'SWORD' : (p.hasRifle ? 'RIFLE' : 'SWORD');
            }
        } else if (slot === 'rifle') {
            const cur = p ? !!p.hasRifle : !!this.adminState.weaponOverrides.rifle;
            const next = !cur;
            this.adminState.weaponOverrides.rifle = next;
            if (p) {
                p.hasRifle = next;
                if (next) p.currentWeapon = 'RIFLE';
                else if (p.currentWeapon === 'RIFLE') p.currentWeapon = p.hasSword ? 'SWORD' : (p.hasGun ? 'GUN' : 'SWORD');
            }
        }
        this.syncAdminPanelUI();
        this.updateHUD();
    }

    adminUnlockAllWeapons() {
        if (!this.isAdminUnlocked) return;
        this.adminState.weaponOverrides = { sword: true, gun: true, rifle: true };
        if (this.player) {
            this.player.hasSword = true;
            this.player.hasGun = true;
            this.player.hasPistol = true;
            this.player.hasRifle = true;
        }
        this.syncAdminPanelUI();
        this.updateHUD();
    }

    adminTogglePowerUp(key) {
        if (!this.isAdminUnlocked) return;
        const field = key === 'BOMBA_GRITO' ? 'bombaGrito' : (key === 'LOLA_BLASTER' ? 'lolaBlaster' : 'belcesword');
        const cur = (this.player && this.player.hasPowerUp)
            ? this.player.hasPowerUp(key)
            : !!this.adminState.powerUps[field];
        const next = !cur;
        this.adminState.powerUps[field] = next;
        if (this.player && this.player.setPowerUpEnabled) {
            this.player.setPowerUpEnabled(key, next);
        }
        this.syncAdminPanelUI();
        this.updateHUD();
    }

    adminEnableAllPowerUps() {
        if (!this.isAdminUnlocked) return;
        this.adminState.powerUps = { bombaGrito: true, lolaBlaster: true, belcesword: true };
        if (this.player && this.player.setPowerUpEnabled) {
            this.player.setPowerUpEnabled('BOMBA_GRITO', true);
            this.player.setPowerUpEnabled('LOLA_BLASTER', true);
            this.player.setPowerUpEnabled('BELCESWORD', true);
        }
        this.syncAdminPanelUI();
        this.updateHUD();
    }

    continueSavedGame() {
        const save = this.getSavedProgress();
        if (!save) return;
        this.level = 2;
        this.initArenaEnvironment();
        const cx = this.arena.x + this.arena.w * 0.5;
        const cy = this.arena.y + this.arena.h * 0.5;
        this.player = new Player(cx, cy);
        this.player.gold = typeof save.gold === 'number' ? save.gold : 0;
        if (save.potions && typeof save.potions === 'object') {
            this.player.potions = {
                heal: Math.min(3, Math.max(0, save.potions.heal || 0)),
                fury: Math.min(3, Math.max(0, save.potions.fury || 0)),
                speed: Math.min(3, Math.max(0, save.potions.speed || 0))
            };
        }
        this.player.hasGun = !!save.hasPistol;
        this.player.hasPistol = !!save.hasPistol;
        this.player.hasRifle = true;
        this.player.currentWeapon = 'RIFLE';
        this.selectedPowerup = save.powerup || null;
        if (save.powerUps && typeof save.powerUps === 'object') {
            this.player.powerUps = {
                bombaGrito: !!save.powerUps.bombaGrito,
                lolaBlaster: !!save.powerUps.lolaBlaster,
                belcesword: !!save.powerUps.belcesword
            };
        } else {
            this.player.powerup = this.selectedPowerup;
        }
        this.resetGame(2);
    }

    quitToMainMenu() {
        if (this.player && ((this.level === 1 && (this.state === 'VICTORY' || this.postPepePowerupGate)) || (this.level === 2 && !this.player.dead))) {
            this.saveProgress();
        }
        this.closeShop();
        this.closePowerupModal();
        this.closeAdminPanel();
        this.closeAdminPasswordModal();
        this.setPaused(false);
        this.runId++; // Invalida cualquier temporizador o callback pendiente
        this.state = 'MENU';
        this.player = null;
        this.enemies = [];
        this.projectiles = [];
        this.puddles = [];
        this.bombs = [];
        this.postPepePowerupGate = false;
        this.isPowerupOpen = false;
        this.pickups = [];
        this.particles = [];
        this.floatingTexts = [];
        this.boss = null;
        this.currentWave = 1;
        this.waveCooldown = 0;
        this.waveIntermission = false;
        this.preBossPrepare = false;
        this.enemiesKilledCount = 0;
        this.gunDropped = false;
        this.shakeTimer = 0;
        this.shakeIntensity = 0;

        if (this.ui) {
            if (this.ui.bossHud) this.ui.bossHud.style.display = 'none';
            if (this.ui.prebossBar) this.ui.prebossBar.classList.add('hidden');
            if (this.ui.waveSkipBar) this.ui.waveSkipBar.classList.add('hidden');
            if (this.ui.powerupGateBar) this.ui.powerupGateBar.classList.add('hidden');
            if (this.ui.powerupScreen) this.ui.powerupScreen.classList.add('hidden');
            if (this.ui.shopScreen) this.ui.shopScreen.classList.add('hidden');
            if (this.ui.gameoverScreen) this.ui.gameoverScreen.classList.add('hidden');
            if (this.ui.victoryScreen) this.ui.victoryScreen.classList.add('hidden');
            if (this.ui.pauseScreen) this.ui.pauseScreen.classList.add('hidden');
            if (this.ui.menuScreen) {
                this.ui.menuScreen.classList.remove('hidden');
                this.showMenuView('main');
            }
        }
        this.updateContinueButtonUI();
    }

    resizeCanvas() {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        this.dpr = dpr;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);

        this.cameraZoom = this.isMobileView ? 0.68 : 1.0;

        this.updateControlPositions();

        if (this.player) {
            this.updateCamera(0, true);
        }
    }

    updateControlPositions() {
        const w = this.width;
        const h = this.height;
        const isMobile = this.isMobileView;

        // Joystick anclado a la esquina inferior izquierda (45px base, 20px stick en móvil)
        const js = this.touchControls.joystick;
        js.radius = isMobile ? 45 : 60;
        js.stickRadius = isMobile ? 20 : 25;
        js.baseX = isMobile ? Math.max(65, Math.min(115, w * 0.15)) : Math.max(90, Math.min(160, w * 0.16));
        js.baseY = isMobile ? Math.max(80, h - 85) : Math.max(120, h - 130);
        if (!js.active) {
            js.stickX = js.baseX;
            js.stickY = js.baseY;
        }

        // Botones de acción anclados a la esquina inferior derecha (-35% en móvil)
        const btn = this.touchControls.buttons;
        btn.attack.r = isMobile ? 35 : 45;
        btn.attack.x = isMobile ? w - 75 : w - 100;
        btn.attack.y = isMobile ? h - 75 : h - 120;

        btn.dash.r = isMobile ? 25 : 32;
        btn.dash.x = isMobile ? w - 155 : w - 210;
        btn.dash.y = isMobile ? h - 65 : h - 90;

        btn.weapon.r = isMobile ? 22 : 30;
        btn.weapon.x = isMobile ? w - 75 : w - 100;
        btn.weapon.y = isMobile ? h - 155 : h - 230;

        // 3 Círculos táctiles de Pociones justo al lado del botón de DASH
        if (btn.potions) {
            const pr = isMobile ? 17 : 22;
            btn.potions.heal.r = pr;
            btn.potions.heal.x = btn.dash.x - (isMobile ? 52 : 68);
            btn.potions.heal.y = btn.dash.y + (isMobile ? 3 : 4);

            btn.potions.fury.r = pr;
            btn.potions.fury.x = btn.dash.x - (isMobile ? 42 : 56);
            btn.potions.fury.y = btn.dash.y - (isMobile ? 42 : 55);

            btn.potions.speed.r = pr;
            btn.potions.speed.x = btn.dash.x + (isMobile ? 4 : 6);
            btn.potions.speed.y = btn.dash.y - (isMobile ? 52 : 68);
        }

        // Botones del HUD en la esquina superior derecha
        btn.pause.w = isMobile ? 36 : 42;
        btn.pause.h = isMobile ? 36 : 42;
        btn.pause.x = isMobile ? w - 48 : w - 55;
        btn.pause.y = isMobile ? 12 : 18;

        btn.fullscreen.w = isMobile ? 36 : 42;
        btn.fullscreen.h = isMobile ? 36 : 42;
        btn.fullscreen.x = isMobile ? w - 92 : w - 105;
        btn.fullscreen.y = isMobile ? 12 : 18;
    }

    toggleFullscreen() {
        const doc = document;
        const docEl = document.documentElement;

        const isFullscreen = !!(doc.fullscreenElement ||
                               doc.webkitFullscreenElement ||
                               doc.mozFullScreenElement ||
                               doc.msFullscreenElement);

        if (!isFullscreen) {
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(() => {});
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            } else if (docEl.mozRequestFullScreen) {
                docEl.mozRequestFullScreen();
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
            }
        } else {
            if (doc.exitFullscreen) {
                doc.exitFullscreen().catch(() => {});
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
            } else if (doc.mozCancelFullScreen) {
                doc.mozCancelFullScreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
        }
    }

    getTouchCanvasPos(touch) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.width / (rect.width || 1);
        const scaleY = this.height / (rect.height || 1);
        return {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY
        };
    }

    getNearestTarget(fromX, fromY, maxRange = 900) {
        let nearest = null;
        let minDist = maxRange;
        const targets = [...this.enemies];
        if (this.boss && !this.boss.dead && (!this.boss.isTargetable || this.boss.isTargetable())) {
            targets.push(this.boss);
        }
        for (const t of targets) {
            if (t.dead) continue;
            const d = MathUtils.dist(fromX, fromY, t.x, t.y);
            if (d < minDist) {
                minDist = d;
                nearest = t;
            }
        }
        return nearest;
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                if (e.code === 'Escape') {
                    this.closeAdminPasswordModal();
                }
                return;
            }

            soundManager.init();
            this.keys[e.code] = true;

            // Victoria: ESPACIO avanza al Nivel 2 (solo tras vencer al jefe del Nivel 1)
            if (e.code === 'Space' && this.state === 'VICTORY' && this.level === 1) {
                e.preventDefault();
                if (!e.repeat) this.goToLevel2();
                return;
            }

            // Reintentar o Recargar Pistola / Rifle de Asalto manualmente con R
            if (e.code === 'KeyR' && !e.repeat) {
                if (this.state === 'GAMEOVER') {
                    this.retryRun();
                } else if (this.state === 'VICTORY') {
                    this.startNewRun();
                } else if (!this.isPaused && !this.isShopOpen && !this.isPowerupOpen && (this.state === 'PLAYING' || this.state === 'BOSS_INTRO') && this.player && !this.player.dead) {
                    if (this.player.currentWeapon === 'GUN') {
                        this.player.startPistolReload(this);
                    } else if (this.player.currentWeapon === 'RIFLE') {
                        this.player.startRifleReload(this);
                    }
                }
            }

            // Pausa (Escape), cerrar tienda/modales o volver al Menú Principal
            if (e.code === 'Escape') {
                const adminPassModal = document.getElementById('admin-password-modal');
                if (adminPassModal && !adminPassModal.classList.contains('hidden')) {
                    this.closeAdminPasswordModal();
                    return;
                }
                if (this.isAdminOpen) {
                    this.closeAdminPanel();
                    return;
                }
                const patchModal = document.getElementById('patch-notes-modal');
                if (patchModal && !patchModal.classList.contains('hidden')) {
                    this.closePatchNotesModal();
                    return;
                }
                const confirmModal = document.getElementById('newgame-confirm-modal');
                if (confirmModal && !confirmModal.classList.contains('hidden')) {
                    this.closeNewGameConfirmModal();
                    return;
                }
                if (this.isShopOpen) {
                    this.closeShop();
                    return;
                }
                if (this.state === 'MENU') {
                    this.showMenuView('main');
                } else if (this.isPaused) {
                    const pauseOptionsView = document.getElementById('pause-options-view');
                    if (pauseOptionsView && !pauseOptionsView.classList.contains('hidden')) {
                        this.showPauseView('main');
                    } else {
                        this.setPaused(false);
                    }
                } else if (this.state === 'PLAYING' || this.state === 'BOSS_INTRO') {
                    this.setPaused(true);
                }
            }

            // Selección / Cambio de arma, Uso de Pociones (4, 5, 6) e Interacción Pre-Jefe (E / T)
            if (!this.isPaused && this.player && !this.player.dead) {
                if (e.code === 'Digit1') {
                    this.player.switchWeapon('SWORD', this);
                } else if (e.code === 'Digit2') {
                    this.player.switchWeapon('GUN', this);
                } else if (e.code === 'Digit3') {
                    this.player.switchWeapon('RIFLE', this);
                } else if (e.code === 'KeyQ') {
                    this.player.toggleWeapon(this);
                } else if ((e.code === 'Digit4' || e.code === 'Numpad4') && !e.repeat) {
                    this.player.usePotion('heal', this);
                } else if ((e.code === 'Digit5' || e.code === 'Numpad5') && !e.repeat) {
                    this.player.usePotion('fury', this);
                } else if ((e.code === 'Digit6' || e.code === 'Numpad6') && !e.repeat) {
                    this.player.usePotion('speed', this);
                } else if (e.code === 'KeyT' && !e.repeat && this.preBossPrepare) {
                    if (this.isShopOpen) this.closeShop();
                    else this.openShop();
                } else if (e.code === 'KeyE' && !e.repeat && this.isNearPowerupGate() && !this.isPowerupOpen) {
                    this.openPowerupModal();
                } else if (e.code === 'KeyE' && !e.repeat && this.isNearWaveGate() && !this.isShopOpen) {
                    this.skipWaveCooldown();
                } else if (e.code === 'KeyE' && !e.repeat && this.preBossPrepare && !this.isShopOpen) {
                    if (this.isNearDancer()) {
                        this.summonBossFromPrep();
                    } else if (this.isNearShop()) {
                        this.openShop();
                    }
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Cambio de arma con rueda del ratón
        window.addEventListener('wheel', (e) => {
            if (!this.isPaused && !this.isShopOpen && this.player && !this.player.dead) {
                this.player.toggleWeapon(this);
            }
        }, { passive: true });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isAnyMenuOpen && this.isAnyMenuOpen()) return;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.width / (rect.width || 1);
            const scaleY = this.height / (rect.height || 1);
            this.mouse.x = (e.clientX - rect.left) * scaleX;
            this.mouse.y = (e.clientY - rect.top) * scaleY;
            const zoom = this.cameraZoom || 1.0;
            this.mouse.worldX = this.mouse.x / zoom + this.camera.x;
            this.mouse.worldY = this.mouse.y / zoom + this.camera.y;
            this.mouse.active = true;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            soundManager.init();
            if (e.button === 0) {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.width / (rect.width || 1);
                const scaleY = this.height / (rect.height || 1);
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;

                // Clic en botón táctil de pausa
                const pb = this.touchControls.buttons.pause;
                if (clickX >= pb.x && clickX <= pb.x + pb.w && clickY >= pb.y && clickY <= pb.y + pb.h) {
                    if (this.state === 'PLAYING' || this.state === 'BOSS_INTRO' || this.isPaused) {
                        this.togglePause();
                        return;
                    }
                }

                // Clic en botón de pantalla completa
                const fsb = this.touchControls.buttons.fullscreen;
                if (clickX >= fsb.x && clickX <= fsb.x + fsb.w && clickY >= fsb.y && clickY <= fsb.y + fsb.h) {
                    this.toggleFullscreen();
                    return;
                }

                if (this.isPaused || this.isShopOpen || this.isPowerupOpen) {
                    return;
                }

                // Interacción por clic en la Puerta Mística de Power-Ups tras vencer a El Pepe
                if (this.postPepePowerupGate && this.powerupGatePos) {
                    const zoom = this.cameraZoom || 1.0;
                    const wx = clickX / zoom + this.camera.x;
                    const wy = clickY / zoom + this.camera.y;
                    if (this.isNearPowerupGate() && MathUtils.dist(wx, wy, this.powerupGatePos.x, this.powerupGatePos.y) <= 105) {
                        this.openPowerupModal();
                        return;
                    }
                }

                // Interacción por clic en la Puerta de Adelantar Oleada durante el interludio
                if (this.isWaveSkipAvailable()) {
                    const zoom = this.cameraZoom || 1.0;
                    const wx = clickX / zoom + this.camera.x;
                    const wy = clickY / zoom + this.camera.y;
                    if (this.isNearWaveGate() && MathUtils.dist(wx, wy, this.waveGatePos.x, this.waveGatePos.y) <= 95) {
                        this.skipWaveCooldown();
                        return;
                    }
                }

                // Interacción por clic en el mundo durante la Sala de Preparación Pre-Jefe
                if (this.preBossPrepare) {
                    const zoom = this.cameraZoom || 1.0;
                    const wx = clickX / zoom + this.camera.x;
                    const wy = clickY / zoom + this.camera.y;
                    if (MathUtils.dist(wx, wy, this.shopPos.x, this.shopPos.y) <= 75) {
                        this.openShop();
                        return;
                    }
                    if (this.isNearDancer() && MathUtils.dist(wx, wy, this.dancerPos.x, this.dancerPos.y - 10) <= 85) {
                        this.summonBossFromPrep();
                        return;
                    }
                }

                this.mouse.down = true;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.down = false;
        });

        // ====================================================================
        // GESTOR TÁCTIL MULTITOUCH INDEPENDIENTE (touch.identifier)
        // ====================================================================
        const handleTouchStart = (e) => {
            soundManager.init();
            if (soundManager.ctx && soundManager.ctx.state === 'suspended') {
                soundManager.ctx.resume().catch(() => {});
            }
            if (!this.isTouchDevice) {
                this.isTouchDevice = true;
                this.cameraZoom = this.isMobileView ? 0.68 : 1.0;
                this.updateControlPositions();
            }
            if (e.cancelable) e.preventDefault();

            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const pos = this.getTouchCanvasPos(t);

                // Botón de Pausa en el HUD (Esquina Superior Derecha)
                const pb = this.touchControls.buttons.pause;
                if (pos.x >= pb.x - 10 && pos.x <= pb.x + pb.w + 10 && pos.y >= pb.y - 10 && pos.y <= pb.y + pb.h + 10) {
                    if (this.state === 'PLAYING' || this.state === 'BOSS_INTRO' || this.isPaused) {
                        this.togglePause();
                        continue;
                    }
                }

                // Botón de Pantalla Completa en el HUD
                const fsb = this.touchControls.buttons.fullscreen;
                if (pos.x >= fsb.x - 10 && pos.x <= fsb.x + fsb.w + 10 && pos.y >= fsb.y - 10 && pos.y <= fsb.y + fsb.h + 10) {
                    this.toggleFullscreen();
                    continue;
                }

                if (this.isPaused || this.isShopOpen || this.isPowerupOpen) {
                    continue;
                }

                if (this.state === 'PLAYING' || this.state === 'BOSS_INTRO') {
                    // Interacción táctil sobre la Puerta Mística de Power-Ups tras El Pepe
                    if (this.postPepePowerupGate && this.powerupGatePos) {
                        const zoom = this.cameraZoom || 1.0;
                        const wx = pos.x / zoom + this.camera.x;
                        const wy = pos.y / zoom + this.camera.y;
                        if (this.isNearPowerupGate() && MathUtils.dist(wx, wy, this.powerupGatePos.x, this.powerupGatePos.y) <= 115) {
                            this.openPowerupModal();
                            continue;
                        }
                    }
                    // 0. Círculos Táctiles de las 3 Pociones (junto al botón de DASH)
                    const potBtns = this.touchControls.buttons.potions;
                    if (potBtns && this.player && !this.player.dead) {
                        let potionHit = false;
                        for (const pType of ['heal', 'fury', 'speed']) {
                            const pBtn = potBtns[pType];
                            if (MathUtils.dist(pos.x, pos.y, pBtn.x, pBtn.y) <= pBtn.r + (this.isMobileView ? 6 : 8)) {
                                pBtn.down = true;
                                pBtn.touchId = t.identifier;
                                if ((this.player.potions[pType] || 0) > 0) {
                                    this.player.usePotion(pType, this);
                                }
                                potionHit = true;
                                break;
                            }
                        }
                        if (potionHit) continue;
                    }

                    // Interacción táctil directa sobre la Puerta de Oleada durante el interludio
                    if (this.isWaveSkipAvailable()) {
                        const zoom = this.cameraZoom || 1.0;
                        const wx = pos.x / zoom + this.camera.x;
                        const wy = pos.y / zoom + this.camera.y;
                        if (this.isNearWaveGate() && MathUtils.dist(wx, wy, this.waveGatePos.x, this.waveGatePos.y) <= 105) {
                            this.skipWaveCooldown();
                            continue;
                        }
                    }

                    // Interacción táctil directa sobre el puesto de Tienda o el Bailarín en el mundo
                    if (this.preBossPrepare) {
                        const zoom = this.cameraZoom || 1.0;
                        const wx = pos.x / zoom + this.camera.x;
                        const wy = pos.y / zoom + this.camera.y;
                        if (MathUtils.dist(wx, wy, this.shopPos.x, this.shopPos.y) <= 75) {
                            this.openShop();
                            continue;
                        }
                        if (this.isNearDancer() && MathUtils.dist(wx, wy, this.dancerPos.x, this.dancerPos.y - 10) <= 90) {
                            this.summonBossFromPrep();
                            continue;
                        }
                    }

                    // 1. Mitad Izquierda de la Pantalla -> Joystick Virtual de Movimiento
                    if (pos.x < this.width * 0.45) {
                        const js = this.touchControls.joystick;
                        if (!js.active) {
                            js.active = true;
                            js.touchId = t.identifier;
                            js.baseX = Math.max(50, Math.min(this.width * 0.40, pos.x));
                            js.baseY = Math.max(70, Math.min(this.height - 50, pos.y));
                            js.stickX = pos.x;
                            js.stickY = pos.y;
                            const dx = pos.x - js.baseX;
                            const dy = pos.y - js.baseY;
                            const d = Math.hypot(dx, dy);
                            if (d > 5) {
                                js.dirX = dx / Math.max(d, js.radius);
                                js.dirY = dy / Math.max(d, js.radius);
                            } else {
                                js.dirX = 0;
                                js.dirY = 0;
                            }
                        }
                        continue;
                    }

                    // 2. Esquina Inferior Derecha -> Botones Táctiles de Acción
                    // Botón de Dash
                    const dashBtn = this.touchControls.buttons.dash;
                    if (MathUtils.dist(pos.x, pos.y, dashBtn.x, dashBtn.y) <= dashBtn.r + (this.isMobileView ? 10 : 14)) {
                        dashBtn.down = true;
                        dashBtn.touchId = t.identifier;
                        if (this.player && !this.player.dead) {
                            this.player.startDash(this.touchControls.joystick.dirX, this.touchControls.joystick.dirY, this);
                        }
                        continue;
                    }

                    // Botón de Cambio de Arma
                    const wepBtn = this.touchControls.buttons.weapon;
                    if (MathUtils.dist(pos.x, pos.y, wepBtn.x, wepBtn.y) <= wepBtn.r + (this.isMobileView ? 10 : 14)) {
                        wepBtn.down = true;
                        wepBtn.touchId = t.identifier;
                        if (this.player && !this.player.dead) {
                            this.player.toggleWeapon(this);
                        }
                        continue;
                    }

                    // Botón Principal de Ataque / Fuego Continuo
                    const atkBtn = this.touchControls.buttons.attack;
                    if (MathUtils.dist(pos.x, pos.y, atkBtn.x, atkBtn.y) <= atkBtn.r + (this.isMobileView ? 14 : 20)) {
                        atkBtn.down = true;
                        atkBtn.touchId = t.identifier;
                        atkBtn.hasDragged = false;
                        this.touchControls.isAttackTouchHeld = true;
                        if (this.player && !this.player.dead) {
                            const nearest = this.getNearestTarget(this.player.x, this.player.y);
                            if (nearest) {
                                this.player.aimAngle = Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
                            } else if (this.touchControls.joystick.dirX !== 0 || this.touchControls.joystick.dirY !== 0) {
                                this.player.aimAngle = Math.atan2(this.touchControls.joystick.dirY, this.touchControls.joystick.dirX);
                            }
                            this.player.startAttack(this);
                        }
                        continue;
                    }
                }
            }
        };

        const handleTouchMove = (e) => {
            if (e.cancelable) e.preventDefault();
            const js = this.touchControls.joystick;
            const atkBtn = this.touchControls.buttons.attack;

            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const pos = this.getTouchCanvasPos(t);

                // Movimiento del Joystick
                if (js.active && t.identifier === js.touchId) {
                    const dx = pos.x - js.baseX;
                    const dy = pos.y - js.baseY;
                    const dist = Math.hypot(dx, dy);
                    if (dist > js.radius) {
                        js.stickX = js.baseX + (dx / dist) * js.radius;
                        js.stickY = js.baseY + (dy / dist) * js.radius;
                    } else {
                        js.stickX = pos.x;
                        js.stickY = pos.y;
                    }
                    if (dist > 5) {
                        js.dirX = dx / Math.max(dist, js.radius);
                        js.dirY = dy / Math.max(dist, js.radius);
                    } else {
                        js.dirX = 0;
                        js.dirY = 0;
                    }
                }

                // Apuntado arrastrando el botón de ataque -> Twin-Stick
                if (atkBtn.down && t.identifier === atkBtn.touchId) {
                    const dx = pos.x - atkBtn.x;
                    const dy = pos.y - atkBtn.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 14) {
                        atkBtn.hasDragged = true;
                        atkBtn.aimAngle = Math.atan2(dy, dx);
                        if (this.player) {
                            this.player.aimAngle = atkBtn.aimAngle;
                        }
                    }
                }
            }
        };

        const handleTouchEnd = (e) => {
            if (e.cancelable) e.preventDefault();
            const js = this.touchControls.joystick;
            const atkBtn = this.touchControls.buttons.attack;
            const dashBtn = this.touchControls.buttons.dash;
            const wepBtn = this.touchControls.buttons.weapon;
            const potBtns = this.touchControls.buttons.potions;

            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];

                if (js.active && t.identifier === js.touchId) {
                    js.active = false;
                    js.touchId = null;
                    js.stickX = js.baseX;
                    js.stickY = js.baseY;
                    js.dirX = 0;
                    js.dirY = 0;
                }

                if (atkBtn.down && t.identifier === atkBtn.touchId) {
                    atkBtn.down = false;
                    atkBtn.touchId = null;
                    atkBtn.hasDragged = false;
                    this.touchControls.isAttackTouchHeld = false;
                }

                if (dashBtn.touchId === t.identifier) {
                    dashBtn.down = false;
                    dashBtn.touchId = null;
                }

                if (wepBtn.touchId === t.identifier) {
                    wepBtn.down = false;
                    wepBtn.touchId = null;
                }

                if (potBtns) {
                    for (const pType of ['heal', 'fury', 'speed']) {
                        if (potBtns[pType].touchId === t.identifier) {
                            potBtns[pType].down = false;
                            potBtns[pType].touchId = null;
                        }
                    }
                }
            }
        };

        this.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        this.canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        window.addEventListener('touchend', handleTouchEnd, { passive: false });
        window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    }

    setupUI() {
        const $ = (id) => document.getElementById(id);
        this.ui = {
            menuScreen: $('menu-screen'), gameoverScreen: $('gameover-screen'), victoryScreen: $('victory-screen'),
            hpBar: $('hp-bar'), hpText: $('hp-text'), dashBar: $('dash-bar'), dashText: $('dash-text'),
            waveCounter: $('wave-counter'), weaponName: $('weapon-name'), weaponHint: $('weapon-hint'),
            buffIndicator: $('buff-indicator'), bossHud: $('boss-hud'), bossHpBar: $('boss-hp-bar'), bossTitle: $('boss-title'),
            gameoverStats: $('gameover-stats'), victoryStats: $('victory-stats'), levelBadge: $('level-badge'),
            victoryTitle: $('victory-title'), victorySubtitle: $('victory-subtitle'), btnNextLevel: $('btn-next-level'),
            pauseScreen: $('pause-screen'),
            goldText: $('gold-text'),
            potCountHeal: $('pot-count-heal'), potCountFury: $('pot-count-fury'), potCountSpeed: $('pot-count-speed'),
            potSlotHeal: $('pot-slot-heal'), potSlotFury: $('pot-slot-fury'), potSlotSpeed: $('pot-slot-speed'),
            prebossBar: $('preboss-bar'), btnOpenShopHud: $('btn-open-shop-hud'), btnSummonBoss: $('btn-summon-boss'),
            waveSkipBar: $('wave-skip-bar'), btnSkipWave: $('btn-skip-wave'),
            powerupGateBar: $('powerup-gate-bar'), btnOpenPowerupGate: $('btn-open-powerup-gate'),
            powerupScreen: $('powerup-screen'),
            shopScreen: $('shop-screen'), shopGoldVal: $('shop-gold-val'),
            shopCountHeal: $('shop-count-heal'), shopCountFury: $('shop-count-fury'), shopCountSpeed: $('shop-count-speed'),
            btnBuyHeal: $('btn-buy-heal'), btnBuyFury: $('btn-buy-fury'), btnBuySpeed: $('btn-buy-speed')
        };

        // Soporte Dual Táctil + Clic para Navegación en Pantallas Superpuestas
        const bindUIButton = (id, action) => {
            const el = $(id);
            if (!el) return;
            const handler = (e) => {
                if (el.disabled || el.classList.contains('btn-locked')) return;
                soundManager.init();
                if (e.cancelable) e.preventDefault();
                el.blur(); // evita que ESPACIO/R reactiven el botón por accidente
                action();
            };
            el.addEventListener('click', handler);
            el.addEventListener('touchstart', handler, { passive: false });
        };

        const uiActions = {
            'btn-start': () => this.handleStartButtonClick(),
            'btn-confirm-newgame': () => this.confirmNewGameFromZero(),
            'btn-cancel-newgame': () => this.closeNewGameConfirmModal(),
            'btn-patch-notes': () => this.openPatchNotesModal(),
            'btn-close-patch-notes': () => this.closePatchNotesModal(),
            'btn-continue': () => this.continueSavedGame(),
            'btn-retry': () => this.retryRun(),
            'btn-gameover-menu': () => this.quitToMainMenu(),
            'btn-play-again': () => this.startNewRun(),
            'btn-victory-menu': () => this.quitToMainMenu(),
            'btn-next-level': () => this.goToLevel2(),
            'btn-open-powerup-gate': () => this.openPowerupModal(),
            'btn-pick-bomba': () => this.selectPowerup('BOMBA_GRITO'),
            'btn-pick-lola': () => this.selectPowerup('LOLA_BLASTER'),
            'btn-pick-belce': () => this.selectPowerup('BELCESWORD'),
            'btn-controls': () => this.showMenuView('controls'),
            'btn-options': () => this.showMenuView('options'),
            'btn-back-controls': () => this.showMenuView('main'),
            'btn-back-options': () => this.showMenuView('main'),
            'btn-resume': () => this.setPaused(false),
            'btn-pause-hud-toggle': () => this.setPaused(false),
            'btn-pause-options': () => this.showPauseView('options'),
            'btn-back-pause-options': () => this.showPauseView('main'),
            'btn-quit-to-menu': () => this.quitToMainMenu(),
            'btn-open-shop-hud': () => this.openShop(),
            'btn-close-shop': () => this.closeShop(),
            'btn-buy-heal': () => this.buyPotion('heal'),
            'btn-buy-fury': () => this.buyPotion('fury'),
            'btn-buy-speed': () => this.buyPotion('speed'),
            'btn-summon-boss': () => this.summonBossFromPrep(),
            'btn-skip-wave': () => this.skipWaveCooldown(),
            'pot-slot-heal': () => { if (!this.isPaused && this.player) this.player.usePotion('heal', this); },
            'pot-slot-fury': () => { if (!this.isPaused && this.player) this.player.usePotion('fury', this); },
            'pot-slot-speed': () => { if (!this.isPaused && this.player) this.player.usePotion('speed', this); },
            'btn-admin-access': () => {
                if (this.isAdminUnlocked) this.openAdminPanel();
                else this.openAdminPasswordModal();
            },
            'btn-admin-floating': () => {
                if (this.isAdminUnlocked) this.openAdminPanel();
            },
            'btn-admin-pass-enter': () => this.submitAdminPassword(),
            'btn-admin-pass-cancel': () => this.closeAdminPasswordModal(),
            'btn-admin-tp-l1': () => this.adminTeleportLevel(1),
            'btn-admin-tp-boss1': () => this.adminTeleportBoss(1),
            'btn-admin-tp-l2': () => this.adminTeleportLevel(2),
            'btn-admin-tp-boss2': () => this.adminTeleportBoss(2),
            'btn-admin-tp-shop': () => this.adminTeleportShop(),
            'btn-admin-skip-wave': () => this.adminSkipWave(),
            'btn-admin-immortal': () => this.adminToggleImmortal(),
            'btn-admin-infinite': () => this.adminToggleInfiniteItems(),
            'btn-admin-weapon-sword': () => this.adminToggleWeapon('sword'),
            'btn-admin-weapon-pistol': () => this.adminToggleWeapon('gun'),
            'btn-admin-weapon-rifle': () => this.adminToggleWeapon('rifle'),
            'btn-admin-unlock-weapons': () => this.adminUnlockAllWeapons(),
            'btn-admin-pu-bomba': () => this.adminTogglePowerUp('BOMBA_GRITO'),
            'btn-admin-pu-lola': () => this.adminTogglePowerUp('LOLA_BLASTER'),
            'btn-admin-pu-belce': () => this.adminTogglePowerUp('BELCESWORD'),
            'btn-admin-pu-all': () => this.adminEnableAllPowerUps(),
            'btn-admin-close': () => this.closeAdminPanel(),
            'btn-admin-lock': () => this.exitAdminMode()
        };
        for (const id in uiActions) bindUIButton(id, uiActions[id]);

        const menuTitle = $('menu-title');
        if (menuTitle) {
            let lastTitleTapAt = 0;
            const handleTitleTap = (e) => {
                if (e.type === 'touchstart') {
                    lastTitleTapAt = Date.now();
                    if (e.cancelable) e.preventDefault();
                } else if (Date.now() - lastTitleTapAt < 350) {
                    return;
                }
                this.registerTitleClick();
            };
            menuTitle.addEventListener('click', handleTitleTap);
            menuTitle.addEventListener('touchstart', handleTitleTap, { passive: false });
        }

        const adminPassInput = $('admin-password-input');
        if (adminPassInput) {
            adminPassInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submitAdminPassword();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeAdminPasswordModal();
                }
            });
        }

        this.syncAdminButtonsVisibility();
        this.syncAdminPanelUI();
        this.updateContinueButtonUI();

        // Control de Volumen General Sincronizado (Menú Principal y Pausa)
        const sliderVolume = $('slider-volume');
        const sliderPauseVolume = $('slider-pause-volume');
        const volumeValText = $('volume-val-text');
        const pauseVolumeValText = $('pause-volume-val-text');

        const updateAllVolumeUI = (pct) => {
            if (sliderVolume) sliderVolume.value = pct;
            if (sliderPauseVolume) sliderPauseVolume.value = pct;
            if (volumeValText) volumeValText.textContent = pct + '%';
            if (pauseVolumeValText) pauseVolumeValText.textContent = pct + '%';
        };

        const currentPct = Math.round(soundManager.masterVolume * 100);
        updateAllVolumeUI(currentPct);

        const handleVolChange = (e) => {
            soundManager.init();
            const pct = parseInt(e.target.value, 10);
            soundManager.setVolume(pct / 100);
            updateAllVolumeUI(pct);
        };

        for (const slider of [sliderVolume, sliderPauseVolume]) {
            if (!slider) continue;
            slider.addEventListener('input', handleVolChange);
            slider.addEventListener('change', handleVolChange);
        }

        // Modo Rendimiento / Gráficos Bajos Sincronizado (Menú Principal y Pausa)
        const lowSpecButtons = [$('btn-toggle-lowspec'), $('btn-toggle-lowspec-pause')];
        const updateLowSpecButtons = () => {
            const on = this.lowSpecMode;
            for (const btn of lowSpecButtons) {
                if (!btn) continue;
                btn.textContent = on ? 'ACTIVADO' : 'DESACTIVADO';
                btn.style.borderColor = on ? '#fbbf24' : '#94a3b8';
                btn.style.color = on ? '#fbbf24' : '#94a3b8';
                btn.style.background = on ? 'rgba(251, 191, 36, 0.2)' : 'transparent';
                btn.style.boxShadow = on ? '0 0 15px rgba(251, 191, 36, 0.4)' : 'none';
            }
        };
        this.updateLowSpecButtons = updateLowSpecButtons;
        updateLowSpecButtons();

        const toggleLowSpecAction = () => {
            this.lowSpecMode = !this.lowSpecMode;
            try {
                localStorage.setItem('pepe_low_spec', this.lowSpecMode ? '1' : '0');
            } catch(e) {}
            updateLowSpecButtons();
            if (this.lowSpecMode && this.particles.length > 35) this.particles.length = 35;
        };
        bindUIButton('btn-toggle-lowspec', toggleLowSpecAction);
        bindUIButton('btn-toggle-lowspec-pause', toggleLowSpecAction);
    }

    initArenaEnvironment() {
        const isL2 = this.level === 2;

        // Dimensiones del mundo: Nivel 1 = 1100x720, Nivel 2 = +15% más grande (1.15x -> 1265x828)
        this.worldW = isL2 ? Math.round(1100 * 1.15) : 1100;
        this.worldH = isL2 ? Math.round(720 * 1.15) : 720;
        this.arena = {
            x: 60,
            y: 60,
            w: this.worldW - 120,
            h: this.worldH - 120
        };

        const ax = this.arena.x;
        const ay = this.arena.y;
        const aw = this.arena.w;
        const ah = this.arena.h;
        // Ubicada a un costado limpio del centro para no tapar el cartel superior ni al bailarín
        this.waveGatePos = { x: ax + aw * 0.5 + 145, y: ay + ah * 0.5 };
        this.powerupGatePos = { x: ax + aw * 0.5, y: ay + ah * 0.5 - 30 };

        if (!isL2) {
            this.pillars = [
                new Pillar(ax + 210, ay + 165, 32, true),
                new Pillar(ax + aw - 210, ay + 165, 32, true),
                new Pillar(ax + 210, ay + ah - 165, 32, true),
                new Pillar(ax + aw - 210, ay + ah - 165, 32, true)
            ];

            // Antorchas con iluminación radial cálida en las paredes estilo Minecraft
            this.torches = [
                { x: ax + 24, y: ay + 24 },
                { x: ax + aw * 0.5, y: ay + 18 },
                { x: ax + aw - 24, y: ay + 24 },
                { x: ax + 24, y: ay + ah - 24 },
                { x: ax + aw * 0.5, y: ay + ah - 18 },
                { x: ax + aw - 24, y: ay + ah - 24 },
                { x: ax + 18, y: ay + ah * 0.5 },
                { x: ax + aw - 18, y: ay + ah * 0.5 }
            ];

            this.spawners = [{ x: ax + aw * 0.5, y: ay + ah * 0.5 }];
        } else {
            // 3 Mob Spawners distribuidos en el mapa compacto (1.15x) del Nivel 2
            this.spawners = [
                { x: ax + aw * 0.5, y: ay + ah * 0.5 },
                { x: ax + aw * 0.22, y: ay + ah * 0.5 },
                { x: ax + aw * 0.78, y: ay + ah * 0.5 }
            ];

            // 6 pilares de cobertura bien distribuidos sin bloquear los spawners
            this.pillars = [
                new Pillar(ax + aw * 0.20, ay + ah * 0.24, 32, true),
                new Pillar(ax + aw * 0.50, ay + ah * 0.22, 32, true),
                new Pillar(ax + aw * 0.80, ay + ah * 0.24, 32, true),
                new Pillar(ax + aw * 0.20, ay + ah * 0.76, 32, true),
                new Pillar(ax + aw * 0.50, ay + ah * 0.78, 32, true),
                new Pillar(ax + aw * 0.80, ay + ah * 0.76, 32, true)
            ];

            // Antorchas perimetrales proporcionales al mapa 1.15x
            this.torches = [];
            for (let i = 0; i <= 4; i++) {
                const tx = ax + 24 + (aw - 48) * (i / 4);
                this.torches.push({ x: tx, y: ay + 20 });
                this.torches.push({ x: tx, y: ay + ah - 20 });
            }
            for (let i = 1; i <= 3; i++) {
                const ty = ay + ah * (i / 4);
                this.torches.push({ x: ax + 18, y: ty });
                this.torches.push({ x: ax + aw - 18, y: ty });
            }
            for (const s of this.spawners) {
                this.torches.push({ x: s.x - 48, y: s.y - 32 });
                this.torches.push({ x: s.x + 48, y: s.y - 32 });
            }
        }

        // Reconstruir el suelo cacheado solo cuando cambia el nivel
        if (!this.dungeonFloorCanvas || this.floorLevel !== this.level) {
            this.floorLevel = this.level;
            this.buildDungeonFloorCanvas();
        }
    }

    buildDungeonFloorCanvas() {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = this.worldW;
        offCanvas.height = this.worldH;
        const fctx = offCanvas.getContext('2d');

        const { x, y, w, h } = this.arena;

        // 1. Fondo exterior abisal oscuro
        fctx.fillStyle = '#06070a';
        fctx.fillRect(0, 0, this.worldW, this.worldH);

        // 2. Muro perimetral exterior de Deepslate (estilo Minecraft Stronghold)
        const wallThickness = 28;
        fctx.fillStyle = '#18191d';
        fctx.fillRect(x - wallThickness, y - wallThickness, w + wallThickness * 2, h + wallThickness * 2);

        const borderBlockSize = 28;
        const borderHash = (bx, by) => {
            let bh = (bx * 374761393 + by * 668265263) ^ 0x5bf03635;
            bh = Math.imul(bh ^ (bh >>> 13), 1274126177);
            return (bh ^ (bh >>> 16)) >>> 0;
        };

        for (let bx = x - wallThickness; bx <= x + w + wallThickness; bx += borderBlockSize) {
            for (let by = y - wallThickness; by <= y + h + wallThickness; by += borderBlockSize) {
                if (bx < x || bx >= x + w || by < y || by >= y + h) {
                    const rnd = (borderHash(Math.floor(bx), Math.floor(by)) % 100) / 100;
                    fctx.fillStyle = rnd > 0.5 ? '#202229' : '#191b22';
                    fctx.fillRect(bx, by, borderBlockSize, borderBlockSize);

                    // Vetas horizontales de pizarra / Deepslate
                    fctx.fillStyle = '#131418';
                    fctx.fillRect(bx, by + borderBlockSize * 0.35, borderBlockSize, 2);
                    fctx.fillRect(bx, by + borderBlockSize * 0.7, borderBlockSize, 2);

                    fctx.strokeStyle = '#0e0f13';
                    fctx.lineWidth = 1.5;
                    fctx.strokeRect(bx, by, borderBlockSize, borderBlockSize);
                }
            }
        }

        // Borde interior de sombra/relieve del muro hacia la arena
        fctx.strokeStyle = '#0a0b0e';
        fctx.lineWidth = 4;
        fctx.strokeRect(x - 2, y - 2, w + 4, h + 4);

        // 3. Suelo de la mazmorra con cuadrícula de bloques texturizados (48x48 píxeles)
        fctx.save();
        fctx.beginPath();
        fctx.rect(x, y, w, h);
        fctx.clip();

        const tileSize = 48;
        const tileHash = (gx, gy) => {
            let th = (gx * 374761393 + gy * 668265263) ^ 0x5bf03635;
            th = Math.imul(th ^ (th >>> 13), 1274126177);
            return (th ^ (th >>> 16)) >>> 0;
        };

        for (let tx = x; tx < x + w; tx += tileSize) {
            for (let ty = y; ty < y + h; ty += tileSize) {
                const tw = Math.min(tileSize, x + w - tx);
                const th = Math.min(tileSize, y + h - ty);
                const hVal = tileHash(Math.floor(tx), Math.floor(ty));
                const roll = (hVal % 1000) / 1000;

                if (roll < 0.60) {
                    // TIPO 1: Stone Bricks (Piedra Labrada de Stronghold)
                    fctx.fillStyle = '#4c4f56';
                    fctx.fillRect(tx, ty, tw, th);

                    fctx.strokeStyle = '#27292e';
                    fctx.lineWidth = 2;
                    fctx.beginPath();
                    // Línea horizontal central
                    fctx.moveTo(tx, ty + 24);
                    fctx.lineTo(tx + tw, ty + 24);
                    // Línea vertical fila superior
                    fctx.moveTo(tx + 24, ty);
                    fctx.lineTo(tx + 24, ty + 24);
                    // Líneas verticales fila inferior (escalonadas)
                    fctx.moveTo(tx, ty + 24);
                    fctx.lineTo(tx, ty + th);
                    fctx.moveTo(tx + 48, ty + 24);
                    fctx.lineTo(tx + 48, ty + th);
                    fctx.stroke();

                    // Bisel / Highlight superior de ladrillos
                    fctx.fillStyle = '#646872';
                    fctx.fillRect(tx + 1, ty + 1, 22, 2);
                    fctx.fillRect(tx + 25, ty + 1, 22, 2);
                    fctx.fillRect(tx + 1, ty + 25, 46, 2);

                    // Sombra inferior de ladrillos
                    fctx.fillStyle = '#323439';
                    fctx.fillRect(tx + 1, ty + 22, 22, 2);
                    fctx.fillRect(tx + 25, ty + 22, 22, 2);
                    fctx.fillRect(tx + 1, ty + 46, 46, 2);

                    // Detalles de textura de piedra
                    fctx.fillStyle = '#3a3c42';
                    fctx.fillRect(tx + 6, ty + 8, 3, 2);
                    fctx.fillRect(tx + 34, ty + 14, 2, 3);
                    fctx.fillRect(tx + 18, ty + 34, 3, 2);
                } else if (roll < 0.85) {
                    // TIPO 2: Mossy Cobblestone (Piedra Musgosa de Dungeon)
                    fctx.fillStyle = '#43464d';
                    fctx.fillRect(tx, ty, tw, th);

                    fctx.strokeStyle = '#23252a';
                    fctx.lineWidth = 2;
                    fctx.strokeRect(tx, ty, tw, th);

                    fctx.beginPath();
                    fctx.moveTo(tx + 14, ty);
                    fctx.lineTo(tx + 12, ty + 22);
                    fctx.lineTo(tx + 34, ty + 20);
                    fctx.lineTo(tx + 36, ty);
                    fctx.moveTo(tx + 12, ty + 22);
                    fctx.lineTo(tx, ty + 32);
                    fctx.moveTo(tx + 34, ty + 20);
                    fctx.lineTo(tx + 48, ty + 30);
                    fctx.moveTo(tx + 24, ty + 21);
                    fctx.lineTo(tx + 22, ty + 48);
                    fctx.stroke();

                    // Píxeles de musgo verde Minecraft en grietas y esquinas
                    fctx.fillStyle = '#4a6b3b'; // Verde musgo
                    fctx.fillRect(tx + 2, ty + 2, 7, 5);
                    fctx.fillRect(tx + 26, ty + 18, 9, 6);
                    fctx.fillRect(tx + 36, ty + 36, 8, 6);
                    fctx.fillRect(tx + 10, ty + 38, 6, 5);

                    fctx.fillStyle = '#38522b'; // Verde musgo oscuro
                    fctx.fillRect(tx + 4, ty + 4, 4, 3);
                    fctx.fillRect(tx + 28, ty + 20, 5, 3);
                    fctx.fillRect(tx + 38, ty + 38, 4, 3);

                    fctx.fillStyle = '#628c48'; // Verde musgo claro
                    fctx.fillRect(tx + 6, ty + 2, 3, 2);
                    fctx.fillRect(tx + 32, ty + 19, 3, 2);
                } else {
                    // TIPO 3: Cracked Stone Bricks (Piedra Agrietada)
                    fctx.fillStyle = '#484b52';
                    fctx.fillRect(tx, ty, tw, th);

                    fctx.strokeStyle = '#27292e';
                    fctx.lineWidth = 2;
                    fctx.beginPath();
                    fctx.moveTo(tx, ty + 24);
                    fctx.lineTo(tx + tw, ty + 24);
                    fctx.moveTo(tx + 24, ty);
                    fctx.lineTo(tx + 24, ty + 24);
                    fctx.moveTo(tx + 12, ty + 24);
                    fctx.lineTo(tx + 12, ty + th);
                    fctx.moveTo(tx + 36, ty + 24);
                    fctx.lineTo(tx + 36, ty + th);
                    fctx.stroke();

                    // Grietas profundas estilo Minecraft
                    fctx.strokeStyle = '#18191c';
                    fctx.lineWidth = 2;
                    fctx.beginPath();
                    fctx.moveTo(tx + 10, ty + 4);
                    fctx.lineTo(tx + 18, ty + 14);
                    fctx.lineTo(tx + 14, ty + 24);
                    fctx.lineTo(tx + 28, ty + 36);
                    fctx.lineTo(tx + 24, ty + 44);
                    fctx.moveTo(tx + 18, ty + 14);
                    fctx.lineTo(tx + 30, ty + 18);
                    fctx.lineTo(tx + 38, ty + 10);
                    fctx.stroke();

                    // Relieve claro junto a la grieta
                    fctx.fillStyle = '#676b75';
                    fctx.fillRect(tx + 19, ty + 13, 2, 2);
                    fctx.fillRect(tx + 29, ty + 35, 2, 2);
                }

                // Borde exterior suave del bloque para marcar la cuadrícula
                fctx.strokeStyle = 'rgba(20, 22, 26, 0.45)';
                fctx.lineWidth = 1;
                fctx.strokeRect(tx, ty, tw, th);
            }
        }

        fctx.restore();

        this.dungeonFloorCanvas = offCanvas;
    }

    // Reinicio centralizado y completo de la partida (nivel 1 desde cero, o nivel 2 conservando al jugador)
    resetGame(targetLevel = 1) {
        this.runId++; // invalida temporizadores pendientes (p. ej. la pantalla de victoria)
        const keepPlayer = targetLevel === 2 && !!this.player;
        this.level = targetLevel;

        this.ui.menuScreen.classList.add('hidden');
        this.ui.gameoverScreen.classList.add('hidden');
        this.ui.victoryScreen.classList.add('hidden');
        if (this.ui.pauseScreen) this.ui.pauseScreen.classList.add('hidden');
        if (this.ui.shopScreen) this.ui.shopScreen.classList.add('hidden');
        if (this.ui.prebossBar) this.ui.prebossBar.classList.add('hidden');
        if (this.ui.waveSkipBar) this.ui.waveSkipBar.classList.add('hidden');
        if (this.ui.powerupGateBar) this.ui.powerupGateBar.classList.add('hidden');
        if (this.ui.powerupScreen) this.ui.powerupScreen.classList.add('hidden');
        this.ui.bossHud.style.display = 'none';

        this.initArenaEnvironment();
        const cx = this.arena.x + this.arena.w * 0.5;
        const cy = this.arena.y + this.arena.h * 0.5;

        if (!keepPlayer) this.player = new Player(cx, cy);
        const p = this.player;

        // Restaurar al jugador: posición, vida y limpieza de efectos de estado
        p.x = cx;
        p.y = cy;
        p.vx = p.vy = 0;
        p.kbVx = p.kbVy = 0;
        p.dead = false;
        p.hitFlash = 0;
        p.invulnTimer = 0;
        p.isDashing = false;
        p.dashTimer = 0;
        p.dashCooldownTimer = 0;
        p.isAttacking = false;
        p.attackTimer = 0;
        p.attackCooldownTimer = 0;
        p.gunCooldownTimer = 0;
        p.pistolAmmo = p.pistolMaxAmmo || 16;
        p.isReloadingPistol = false;
        p.pistolReloadTimer = 0;
        p.rifleCooldownTimer = 0;
        p.rifleAmmo = p.rifleMaxAmmo || 30;
        p.isReloadingRifle = false;
        p.rifleReloadTimer = 0;
        p.muzzleFlash = 0;
        p.rifleRecoil = 0;
        p.damageBoostTimer = 0;
        p.speedBoostTimer = 0;
        p.furyPotionTimer = 0;
        p.speedPotionTimer = 0;
        p.gargoyleHits = 0;
        p.gargoyleHitDecayTimer = 0;
        p.sleepTimer = 0;
        p.sleepImmunityTimer = 0;
        p.poisonTimer = 0;
        p.poisonTickTimer = 0;
        p.poisonBubbleTimer = 0;
        p.weaknessTimer = 0;
        p.weaknessTextCooldown = 0;
        p.belceSwingCount = 0;
        p.activeSwingBelceThird = false;
        p.lolaCharging = false;
        p.lolaChargeTimer = 0;
        p.lolaFireAnimTimer = 0;
        p.lolaMouthTimer = 0;
        p.lolaWaitRelease = false;
        p.wasAttackHeld = false;
        if (targetLevel === 2) {
            if (this.selectedPowerup && p.setPowerUpEnabled) {
                p.setPowerUpEnabled(this.selectedPowerup, true);
            }
        } else {
            p.powerup = null;
        }
        p.scaleX = p.scaleY = 1;
        p.afterimages = [];
        p.slashTrails = [];
        p.hitTargetsInSwing.clear();

        if (targetLevel === 2) this.applyLevel2Powerup();
        if (this.isAdminUnlocked && this.applyAdminStateToPlayer) {
            this.applyAdminStateToPlayer(p);
        }
        p.hp = p.maxHp;

        // Limpiar todos los contenedores activos
        this.enemies = [];
        this.projectiles = [];
        this.puddles = [];
        this.bombs = [];
        this.particles = [];
        this.pickups = [];
        this.floatingTexts = [];
        this.boss = null;

        // Temporizadores y banderas de transición
        this.currentWave = 1;
        this.enemiesKilledCount = 0;
        this.waveCooldown = 0;
        this.waveIntermission = false;
        this.preBossPrepare = false;
        this.postPepePowerupGate = false;
        this.isPowerupOpen = false;
        this.isShopOpen = false;
        this.waveTransitionTimer = 0;
        this.bossIntroTimer = 0;
        this.shakeIntensity = 0;
        this.shakeTimer = 0;
        this.isPaused = false;
        this.gunDropped = false;

        // Entradas: evitar teclas/clics "pegados" tras las pantallas de menú
        this.keys = {};
        this.mouse.down = false;

        this.updateCamera(0, true);
        this.syncMouseWorld();
        this.state = 'PLAYING';

        if (targetLevel === 2) {
            this.floatingTexts.push(new FloatingText(cx, cy - 70, 'NIVEL 2 - MODO POTENCIADO', '#fbbf24', 22, true));
        }

        this.spawnWave(this.currentWave);
        this.updateHUD();
    }

    // Reinicio completo desde el Nivel 1 (menú, victoria y nueva run)
    startNewRun() {
        this.selectedPowerup = null;
        this.resetGame(1);
    }

    // Reintentar al morir: si estaba en Nivel 2, reinicia directamente en el Nivel 2 conservando Power-Up
    retryRun() {
        if (this.level === 2) {
            this.resetGame(2);
        } else {
            this.startNewRun();
        }
    }

    goToLevel2() {
        if (this.state !== 'VICTORY' || this.level !== 1) return;
        this.resetGame(2);
        this.saveProgress();
    }

    // Power-up permanente del jugador al iniciar el Nivel 2 + desbloqueo del Rifle de Asalto
    applyLevel2Powerup() {
        const p = this.player;
        if (!p.powered) {
            p.powered = true;
            p.maxHp = Math.round(100 * 1.15); // +15% sobre la vida base del Nivel 1 (115 HP)
            p.dmgMult = 1.35;                 // +35% daño base en todas las armas
            p.moveSpeedMult = 1.15;           // +15% velocidad de movimiento
        }
        if (!p.hasRifle) {
            p.hasRifle = true;
            p.currentWeapon = 'RIFLE';
        }
    }

    configureVictoryScreen() {
        const isL1 = this.level === 1;
        this.ui.victoryTitle.textContent = isL1 ? '¡VICTORIA ÉPICA!' : '¡MAZMORRA CONQUISTADA!';
        this.ui.victorySubtitle.textContent = isL1
            ? 'EL PEPE MAESTRO HA SIDO DERROTADO'
            : 'RISÍN PEPÍN - EL SEÑOR DE LA RISA HA CAÍDO';
        this.ui.btnNextLevel.style.display = isL1 ? 'inline-block' : 'none';
    }

    spawnWave(waveNum) {
        const isL2 = this.level === 2;
        const hpWave = waveNum + (isL2 ? 2 : 0);
        const chaserCount = isL2 ? (5 + waveNum * 2) : (3 + waveNum * 2);
        const shooterCount = isL2 ? (3 + waveNum) : (1 + waveNum);
        const tankCount = isL2 ? (1 + Math.floor(waveNum * 0.8)) : 0;
        const gargoyleCount = isL2 ? (1 + Math.ceil(waveNum * 0.6)) : 0;
        const villaCount = isL2 ? (1 + Math.floor(waveNum * 0.6)) : 0;

        // Calibración de oro por ronda: entre 3 y 5 bolsas de oro garantizadas en promedio por oleada
        this.waveTotalEnemies = chaserCount + shooterCount + tankCount + gargoyleCount + villaCount;
        this.waveGoldDropped = 0;
        this.waveGoldTarget = MathUtils.randInt(3, 5);

        const spawnPointAwayFromPlayer = () => {
            let sx, sy, tries = 0;
            if (isL2 && this.spawners.length > 0 && Math.random() < 0.65) {
                // Alterna entre Mob Spawners y bordes de la arena en el mapa compacto del Nivel 2
                do {
                    const sp = this.spawners[MathUtils.randInt(0, this.spawners.length - 1)];
                    sx = sp.x + MathUtils.randRange(-40, 40);
                    sy = sp.y + MathUtils.randRange(-40, 40);
                    tries++;
                } while (MathUtils.dist(sx, sy, this.player.x, this.player.y) < 210 && tries < 25);
                if (MathUtils.dist(sx, sy, this.player.x, this.player.y) >= 180) {
                    return { x: sx, y: sy };
                }
            }
            tries = 0;
            do {
                sx = MathUtils.randRange(this.arena.x + 45, this.arena.x + this.arena.w - 45);
                sy = MathUtils.randRange(this.arena.y + 45, this.arena.y + this.arena.h - 45);
                tries++;
            } while (MathUtils.dist(sx, sy, this.player.x, this.player.y) < (isL2 ? 210 : 230) && tries < 25);
            return { x: sx, y: sy };
        };

        for (let i = 0; i < chaserCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'CHASER', hpWave, this.level));
            this.spawnParticles(pt.x, pt.y, 10, '#f43f5e', 110, true);
        }

        for (let i = 0; i < shooterCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'SHOOTER', hpWave, this.level));
            this.spawnParticles(pt.x, pt.y, 10, '#a855f7', 110, true);
        }

        for (let i = 0; i < tankCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'TANK', hpWave, this.level));
            this.spawnParticles(pt.x, pt.y, 16, '#f97316', 140, true);
        }

        for (let i = 0; i < gargoyleCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'GARGOYLE', hpWave, this.level));
            this.spawnParticles(pt.x, pt.y, 12, '#c084fc', 130, true);
        }

        for (let i = 0; i < villaCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'VILLA', hpWave, this.level));
            this.spawnParticles(pt.x, pt.y, 14, '#39ff14', 135, true);
        }

        this.floatingTexts.push(new FloatingText(this.camera.x + this.width * 0.5, this.camera.y + this.height * 0.3, `¡OLEADA ${waveNum}!`, '#00f5d4', 24, true));
    }

    onEnemyKilled(enemy) {
        this.enemiesKilledCount++;
        const killCol = enemy.archetype === 'VILLA'
            ? '#39ff14'
            : (enemy.archetype === 'TANK' ? '#f97316' : (enemy.archetype === 'GARGOYLE' ? '#c084fc' : (enemy.archetype === 'CHASER' ? '#f43f5e' : '#a855f7')));
        this.spawnParticles(enemy.x, enemy.y, 18, killCol, 190, true);

        // Drop calibrado de moneda/bolsa de oro recolectable (promedio 3 a 5 de oro por ronda)
        if (enemy.shouldDropGold && enemy.shouldDropGold(this)) {
            this.waveGoldDropped = (this.waveGoldDropped || 0) + 1;
            const gx = MathUtils.clamp(enemy.x + MathUtils.randRange(-14, 14), this.arena.x + 24, this.arena.x + this.arena.w - 24);
            const gy = MathUtils.clamp(enemy.y + MathUtils.randRange(-14, 14), this.arena.y + 24, this.arena.y + this.arena.h - 24);
            this.pickups.push(new ItemPickup(gx, gy, 'gold'));
        }

        // Condición Estricta de Drop de Pistola:
        // Solo si el jugador NO la ha desbloqueado Y NO hay ya una pistola tirada en el suelo
        const playerHasGun = this.player && this.player.hasGun;
        const gunOnGround = this.pickups.some(p => p instanceof GunPickup && !p.dead);

        // Rifle de Asalto: 100% de drop al caer el primer Tanque (sin duplicados: misma regla estricta que la pistola)
        const rifleOnGround = this.pickups.some(p => p instanceof GunPickup && p.kind === 'RIFLE' && !p.dead);
        if (enemy.archetype === 'TANK' && this.player && !this.player.hasRifle && !rifleOnGround) {
            this.pickups.push(new GunPickup(enemy.x, enemy.y, 'RIFLE'));
            this.floatingTexts.push(new FloatingText(enemy.x, enemy.y - 25, '¡DROP DE RIFLE DE ASALTO!', '#fbbf24', 16, true));
        } else if (enemy.archetype === 'SHOOTER' && !playerHasGun && !gunOnGround) {
            this.gunDropped = true;
            this.pickups.push(new GunPickup(enemy.x, enemy.y));
            this.floatingTexts.push(new FloatingText(enemy.x, enemy.y - 25, '¡DROP DE PISTOLA!', '#38bdf8', 16, true));
        } else {
            // Probabilidad normal de soltar un orbe de curación o mejora temporal (Espíritu Roguelike)
            if (Math.random() < 0.32) {
                const roll = Math.random();
                let type = 'HEAL';
                if (roll > 0.5 && roll <= 0.78) type = 'FURY';
                else if (roll > 0.78) type = 'HASTE';
                this.pickups.push(new PickupOrb(enemy.x, enemy.y, type));
            }
        }
    }

    // Configura la Sala de Preparación Pre-Jefe al terminar la Ronda 5 (sin límite de tiempo)
    setupPreBossRoom() {
        this.preBossPrepare = true;
        this.isShopOpen = false;
        this.waveCooldown = 0;

        // Colocar puesto de tienda y muñeco bailarín cerca del jugador / centro de la arena
        const cx = this.arena.x + this.arena.w * 0.5;
        const cy = this.arena.y + this.arena.h * 0.5;
        const refX = this.player ? MathUtils.clamp(this.player.x, this.arena.x + 240, this.arena.x + this.arena.w - 240) : cx;
        const refY = this.player ? MathUtils.clamp(this.player.y, this.arena.y + 180, this.arena.y + this.arena.h - 180) : cy;

        this.shopPos = { x: refX - 145, y: refY - 25 };
        this.dancerPos = { x: refX + 145, y: refY - 15 };

        this.spawnParticles(this.shopPos.x, this.shopPos.y, 28, '#ffd700', 160, true);
        this.spawnParticles(this.dancerPos.x, this.dancerPos.y, 28, '#00f0ff', 160, true);
        this.floatingTexts.push(new FloatingText(refX, refY - 75, '¡TIENDA ABIERTA! PREPÁRATE ANTES DEL JEFE', '#ffd700', 20, true));
        soundManager.playPickup();
    }

    isNearDancer() {
        if (!this.preBossPrepare || !this.player || this.player.dead) return false;
        return MathUtils.dist(this.player.x, this.player.y, this.dancerPos.x, this.dancerPos.y) < 110;
    }

    isNearShop() {
        if (!this.preBossPrepare || !this.player || this.player.dead) return false;
        return MathUtils.dist(this.player.x, this.player.y, this.shopPos.x, this.shopPos.y) < 120;
    }

    isWaveSkipAvailable() {
        return this.state === 'PLAYING'
            && !this.isPaused
            && this.waveIntermission
            && !this.preBossPrepare
            && !this.boss
            && this.waveCooldown > 0
            && this.currentWave < this.maxWaves;
    }

    isNearWaveGate() {
        if (!this.isWaveSkipAvailable() || !this.player || this.player.dead || !this.waveGatePos) return false;
        return MathUtils.dist(this.player.x, this.player.y, this.waveGatePos.x, this.waveGatePos.y) < 110;
    }

    skipWaveCooldown() {
        if (!this.isWaveSkipAvailable()) return;
        this.waveCooldown = 0;
        this.waveIntermission = false;
        if (this.waveGatePos) {
            this.spawnParticles(this.waveGatePos.x, this.waveGatePos.y, 26, '#00f5d4', 170, true);
        }
        if (this.currentWave < this.maxWaves) {
            this.currentWave++;
            this.spawnWave(this.currentWave);
        } else {
            this.setupPreBossRoom();
        }
        soundManager.playPickup();
        this.updateHUD();
    }

    openShop() {
        if (!this.preBossPrepare || this.state !== 'PLAYING' || this.isPaused) return;
        this.isShopOpen = true;
        this.mouse.down = false;
        if (this.touchControls) {
            this.touchControls.isAttackTouchHeld = false;
            this.touchControls.joystick.active = false;
            this.touchControls.joystick.dirX = 0;
            this.touchControls.joystick.dirY = 0;
        }
        this.syncShopUI();
        if (this.ui && this.ui.shopScreen) {
            this.ui.shopScreen.classList.remove('hidden');
        }
    }

    closeShop() {
        this.isShopOpen = false;
        if (this.ui && this.ui.shopScreen) {
            this.ui.shopScreen.classList.add('hidden');
        }
    }

    syncShopUI() {
        if (!this.player || !this.ui) return;
        const gold = this.player.gold || 0;
        const pots = this.player.potions || { heal: 0, fury: 0, speed: 0 };
        const maxS = this.player.maxPotionStack || 3;

        if (this.ui.shopGoldVal) this.ui.shopGoldVal.textContent = gold;
        if (this.ui.shopCountHeal) this.ui.shopCountHeal.textContent = `${pots.heal}/${maxS}`;
        if (this.ui.shopCountFury) this.ui.shopCountFury.textContent = `${pots.fury}/${maxS}`;
        if (this.ui.shopCountSpeed) this.ui.shopCountSpeed.textContent = `${pots.speed}/${maxS}`;

        const items = [
            { btn: this.ui.btnBuyHeal, count: pots.heal, cost: 3 },
            { btn: this.ui.btnBuyFury, count: pots.fury, cost: 5 },
            { btn: this.ui.btnBuySpeed, count: pots.speed, cost: 4 }
        ];
        for (const it of items) {
            if (!it.btn) continue;
            const full = it.count >= maxS;
            const canAfford = gold >= it.cost;
            const disabled = full || !canAfford;
            it.btn.disabled = disabled;
            it.btn.classList.toggle('btn-disabled', disabled);
            if (full) {
                it.btn.textContent = `LLENO (${maxS}/${maxS})`;
            } else if (!canAfford) {
                it.btn.textContent = `SIN ORO (${it.cost} ORO)`;
            } else {
                it.btn.textContent = `COMPRAR (${it.cost} ORO)`;
            }
        }
    }

    buyPotion(type) {
        if (!this.player || !this.preBossPrepare) return false;
        const costs = { heal: 3, fury: 5, speed: 4 };
        const cost = costs[type];
        if (!cost) return false;
        const maxS = this.player.maxPotionStack || 3;
        if ((this.player.potions[type] || 0) >= maxS) return false;
        if ((this.player.gold || 0) < cost) return false;

        this.player.gold -= cost;
        this.player.potions[type] = (this.player.potions[type] || 0) + 1;
        soundManager.playPickup();
        this.syncShopUI();
        this.updateHUD();
        return true;
    }

    summonBossFromPrep() {
        if (!this.preBossPrepare || !this.isNearDancer()) return;
        this.closeShop();
        this.preBossPrepare = false;
        this.waveIntermission = false;
        this.waveCooldown = 0;
        if (this.ui && this.ui.prebossBar) this.ui.prebossBar.classList.add('hidden');
        this.triggerBossEntrance();
    }

    startBossFight() {
        this.triggerBossEntrance();
    }

    triggerBossEntrance() {
        this.state = 'BOSS_INTRO';
        this.bossIntroElapsed = 0;
        this.bossIntroMaxTime = 3.5;
        this.bossIntroTimer = 3.5;
        this.bossIntroStepFlags = {
            laugh2: false,
            jumpStarted: false,
            slamDone: false,
            doorHit1: false,
            doorHit2: false,
            doorHit3: false,
            doorBurst: false
        };
        this.bossIntroDoorScaleX = 1;
        this.bossIntroDoorScaleY = 1;
        this.bossIntroDebris = [];
        this.bossIntroRocks = [];

        // Limpiar proyectiles/charcos y bloquear acciones del jugador (Fix balas congeladas en Intro)
        this.projectiles = [];
        this.puddles = [];
        if (this.ui && this.ui.waveSkipBar) this.ui.waveSkipBar.classList.add('hidden');
        this.mouse.down = false;
        if (this.touchControls) {
            this.touchControls.isAttackTouchHeld = false;
        }
        if (this.player) {
            this.player.isAttacking = false;
            this.player.isDashing = false;
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.kbVx = 0;
            this.player.kbVy = 0;
            this.player.sleepTimer = 0;
            this.player.gargoyleHits = 0;
            this.player.poisonTimer = 0;
            this.player.poisonTickTimer = 0;
            this.player.weaknessTimer = 0;
        }

        const cx = Number.isFinite(this.arena.x + this.arena.w * 0.5) ? (this.arena.x + this.arena.w * 0.5) : 550;
        const ay = Number.isFinite(this.arena.y) ? this.arena.y : 60;
        const ah = Number.isFinite(this.arena.h) ? this.arena.h : 600;
        this.bossIntroAnchorX = cx;
        this.bossIntroAnchorY = ay + 135;
        this.bossIntroLandX = cx;
        this.bossIntroLandY = ay + 235;

        if (this.player) {
            this.player.x = cx;
            this.player.y = Math.min(ay + ah - 90, this.bossIntroLandY + 155);
            this.player.aimAngle = -Math.PI * 0.5;
            this.updateCamera(0, true);
        }

        // Instanciar al jefe con coordenadas numéricas válidas dentro de la arena desde el fotograma 0
        if (this.level === 1) {
            this.boss = new Boss(this.bossIntroLandX, this.bossIntroLandY, 1);
            soundManager.playBossRoar();
            if (soundManager.playElPepe) soundManager.playElPepe();
            this.addScreenShake(4, 0.3);
        } else {
            this.boss = new Boss(this.bossIntroLandX, this.bossIntroLandY, 2);
            if (soundManager.playClownLaugh8Bit) soundManager.playClownLaugh8Bit();
            this.addScreenShake(3, 0.25);
        }

        // Ocultar temporalmente #boss-hud durante la escena de video; se activa al pasar a PLAYING
        if (this.ui && this.ui.bossHud) {
            this.ui.bossHud.style.display = 'none';
        }
        if (this.ui && this.ui.bossTitle) {
            this.ui.bossTitle.textContent = this.level === 2
                ? 'RISÍN PEPÍN - EL SEÑOR DE LA RISA'
                : 'EL PEPE MAESTRO - SEÑOR DE LA MAZMORRA';
        }
        if (this.ui && this.ui.waveCounter) {
            this.ui.waveCounter.textContent = 'JEFE FINAL';
            this.ui.waveCounter.style.color = '#ef4444';
        }
    }

    onBossDefeated(boss) {
        if (this.level === 1) {
            if (soundManager.playPepeMuerte) soundManager.playPepeMuerte();
        } else {
            if (soundManager.playRisinMuerte) soundManager.playRisinMuerte();
        }
        this.addScreenShake(20, 0.8);
        this.spawnParticles(boss.x, boss.y, 90, '#fbbf24', 350, true);
        this.spawnParticles(boss.x, boss.y, 60, '#ef4444', 280, true);
        this.projectiles = [];
        this.puddles = [];
        if (this.ui && this.ui.bossHud) {
            this.ui.bossHud.style.display = 'none';
        }

        if (this.level === 1) {
            this.saveProgress();
            const runId = this.runId;
            setTimeout(() => {
                if (runId !== this.runId || this.state === 'GAMEOVER') return;
                this.spawnPowerupGate();
            }, 900);
            return;
        }

        const runId = this.runId;
        setTimeout(() => {
            if (runId !== this.runId || this.state === 'GAMEOVER') return; // ignorar si se reinició la partida
            this.state = 'VICTORY';
            this.configureVictoryScreen();
            this.ui.victoryStats.textContent = `Esbirros Abatidos: ${this.enemiesKilledCount} | Salud Restante: ${this.player.hp}/${this.player.maxHp}`;
            this.ui.victoryScreen.classList.remove('hidden');
        }, 900);
    }

    spawnPowerupGate() {
        this.postPepePowerupGate = true;
        this.isPowerupOpen = false;
        const ax = this.arena.x;
        const ay = this.arena.y;
        const aw = this.arena.w;
        const ah = this.arena.h;
        this.powerupGatePos = { x: ax + aw * 0.5, y: ay + ah * 0.5 - 30 };
        this.spawnParticles(this.powerupGatePos.x, this.powerupGatePos.y, 40, '#ffd700', 210, true);
        this.spawnParticles(this.powerupGatePos.x, this.powerupGatePos.y, 28, '#a855f7', 175, true);
        this.floatingTexts.push(new FloatingText(this.powerupGatePos.x, this.powerupGatePos.y - 68, '¡PUERTA DE PODER ABIERTA! ELIGE TU POWER-UP', '#ffd700', 19, true));
        soundManager.playPickup();
        this.updateHUD();
    }

    isNearPowerupGate() {
        if (!this.postPepePowerupGate || this.state !== 'PLAYING' || !this.player || this.player.dead || !this.powerupGatePos) return false;
        return MathUtils.dist(this.player.x, this.player.y, this.powerupGatePos.x, this.powerupGatePos.y) < 115;
    }

    openPowerupModal() {
        if (!this.postPepePowerupGate || this.state !== 'PLAYING' || this.isPaused) return;
        this.isPowerupOpen = true;
        this.mouse.down = false;
        if (this.touchControls) {
            this.touchControls.isAttackTouchHeld = false;
            this.touchControls.joystick.active = false;
            this.touchControls.joystick.dirX = 0;
            this.touchControls.joystick.dirY = 0;
        }
        if (this.ui && this.ui.powerupGateBar) this.ui.powerupGateBar.classList.add('hidden');
        if (this.ui && this.ui.powerupScreen) this.ui.powerupScreen.classList.remove('hidden');
    }

    closePowerupModal() {
        this.isPowerupOpen = false;
        if (this.ui && this.ui.powerupScreen) this.ui.powerupScreen.classList.add('hidden');
    }

    selectPowerup(choice) {
        if (!choice) return;
        this.selectedPowerup = choice;
        if (this.player && this.player.setPowerUpEnabled) {
            this.player.setPowerUpEnabled(choice, true);
        } else if (this.player) {
            this.player.powerup = choice;
        }
        this.postPepePowerupGate = false;
        this.closePowerupModal();
        this.saveProgress();
        this.resetGame(2);
        const labelMap = {
            BOMBA_GRITO: '¡POWER-UP: BOMBA GRITO!',
            LOLA_BLASTER: '¡POWER-UP: LOLA BLASTER!',
            BELCESWORD: '¡POWER-UP: BELCESWORD!'
        };
        if (this.player) {
            this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 102, labelMap[choice] || '¡POWER-UP EQUIPADO!', '#00f5d4', 20, true));
        }
        soundManager.playPickup();
    }

    onPlayerDeath() {
        if (soundManager.playMuerteOxxo) soundManager.playMuerteOxxo();
        this.addScreenShake(16, 0.5);
        this.spawnParticles(this.player.x, this.player.y, 45, '#ef4444', 250, true);
        this.state = 'GAMEOVER';
        this.ui.gameoverStats.textContent = `Caíste en la Oleada ${this.currentWave} | Enemigos derrotados: ${this.enemiesKilledCount}`;
        this.ui.gameoverScreen.classList.remove('hidden');
    }

    addScreenShake(intensity, duration) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this.shakeTimer = Math.max(this.shakeTimer, duration);
    }

    spawnParticles(x, y, count, color, maxSpeed, glow = false) {
        if (this.lowSpecMode && this.particles.length >= 35) return;
        const finalCount = this.lowSpecMode ? Math.max(1, Math.round(count * 0.4)) : count;
        const actualGlow = this.lowSpecMode ? false : glow;
        for (let i = 0; i < finalCount; i++) {
            if (this.lowSpecMode && this.particles.length >= 35) break;
            const angle = Math.random() * Math.PI * 2;
            const speed = MathUtils.randRange(25, maxSpeed);
            const radius = MathUtils.randRange(2, 5.5);
            const life = MathUtils.randRange(0.25, 0.65);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                radius, color, life, 0.9, actualGlow
            ));
        }
    }

    update(dt) {
        this.globalTime += dt;

        // Actualizar Screen Shake
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dt;
            if (this.shakeTimer <= 0) this.shakeIntensity = 0;
        }

        // Ahorro de CPU/GPU: Evitar generar partículas ambientales si hay menús, modales o pausa activos
        const inMenuOrPaused = this.state === 'MENU' || this.isPaused || this.isAdminOpen || (this.isAnyMenuOpen && this.isAnyMenuOpen());
        if (!inMenuOrPaused) {
            // Chispas y humo ambiental de las antorchas (Minecraft Voxel Particles)
            const torchChance = this.lowSpecMode ? 0.14 : 0.35;
            if ((!this.lowSpecMode || this.particles.length < 35) && Math.random() < torchChance) {
                const t = this.torches[MathUtils.randInt(0, this.torches.length - 1)];
                const isSmoke = Math.random() < 0.28;
                this.particles.push(new Particle(
                    t.x + MathUtils.randRange(-3, 3),
                    t.y - 10 + MathUtils.randRange(-2, 2),
                    MathUtils.randRange(-10, 10),
                    MathUtils.randRange(-40, -18),
                    MathUtils.randRange(1.8, 3.2),
                    isSmoke ? '#52525b' : (Math.random() < 0.6 ? '#f97316' : '#fde047'),
                    isSmoke ? 0.55 : 0.42,
                    0.96,
                    this.lowSpecMode ? false : !isSmoke,
                    true // isSquare: true
                ));
            }

            // Chispas de fuego pixeladas del Mob Spawner central
            const spawnerChance = this.lowSpecMode ? 0.12 : 0.3;
            if ((!this.lowSpecMode || this.particles.length < 35) && this.state === 'PLAYING' && Math.random() < spawnerChance) {
                const spSel = this.spawners[MathUtils.randInt(0, this.spawners.length - 1)];
                const spawnerX = spSel.x;
                const spawnerY = spSel.y;
                this.particles.push(new Particle(
                    spawnerX + MathUtils.randRange(-14, 14),
                    spawnerY + MathUtils.randRange(-14, 14),
                    MathUtils.randRange(-18, 18),
                    MathUtils.randRange(-35, -12),
                    MathUtils.randRange(1.8, 3.4),
                    Math.random() < 0.55 ? '#ea580c' : '#facc15',
                    0.48,
                    0.95,
                    this.lowSpecMode ? false : true,
                    true // isSquare: true
                ));
            }
        }

        // Límite estricto de partículas en modo bajo rendimiento
        if (this.lowSpecMode && this.particles.length > 35) {
            this.particles.length = 35;
        }

        if (this.state === 'MENU' || this.state === 'GAMEOVER' || this.state === 'VICTORY') {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update(dt);
                if (this.particles[i].life <= 0) this.particles.splice(i, 1);
            }
            return;
        }

        if (this.state === 'BOSS_INTRO') {
            if (this.isAdminOpen) {
                this.updateHUD();
                return;
            }
            this.projectiles = [];
            const maxT = Number.isFinite(this.bossIntroMaxTime) && this.bossIntroMaxTime > 0 ? this.bossIntroMaxTime : 3.5;
            if (!Number.isFinite(this.bossIntroTimer)) this.bossIntroTimer = maxT;
            this.bossIntroTimer -= dt;
            this.bossIntroElapsed = MathUtils.clamp(maxT - Math.max(0, this.bossIntroTimer), 0, maxT);
            const t = this.bossIntroElapsed;
            const flags = this.bossIntroStepFlags || (this.bossIntroStepFlags = {});

            try {
                if (this.player) {
                    this.player.update(dt, this);
                }

                if (this.level === 1 && this.boss) {
                    // Coordenadas de arena siempre numéricas y válidas
                    this.boss.x = Number.isFinite(this.bossIntroLandX) ? this.bossIntroLandX : (this.arena.x + this.arena.w * 0.5);
                    this.boss.y = Number.isFinite(this.bossIntroLandY) ? this.bossIntroLandY : (this.arena.y + 235);
                    this.boss.jumpHeight = 0;
                    this.boss.animTime += dt;
                    this.boss.scaleX = MathUtils.lerp(this.boss.scaleX || 1, 1, Math.min(1, dt * 12));
                    this.boss.scaleY = MathUtils.lerp(this.boss.scaleY || 1, 1, Math.min(1, dt * 12));

                    if (t >= 1.1 && t < 2.3) {
                        // 1.1s a 2.3s: Salto Épico desde lo alto de la torre
                        if (!flags.jumpStarted) {
                            flags.jumpStarted = true;
                            soundManager.playBossRoar();
                            this.boss.triggerSquash(0.75, 1.32);
                        }
                    } else if (t >= 2.3) {
                        // 2.3s a 3.5s: Aterrizaje sísmico frente al jugador y título "EL PEPE MAESTRO"
                        if (!flags.slamDone) {
                            flags.slamDone = true;
                            this.boss.triggerSquash(1.42, 0.62);
                            soundManager.playBossSlam();
                            this.addScreenShake(16, 0.65);
                            this.bossIntroRocks = [];
                            for (let i = 0; i < 14; i++) {
                                const ang = MathUtils.randRange(-Math.PI * 0.92, -Math.PI * 0.08);
                                const spd = MathUtils.randRange(140, 340);
                                this.bossIntroRocks.push({
                                    x: MathUtils.randRange(-28, 28),
                                    y: MathUtils.randRange(-8, 6),
                                    vx: Math.cos(ang) * spd,
                                    vy: Math.sin(ang) * spd,
                                    rot: Math.random() * Math.PI * 2,
                                    vrot: MathUtils.randRange(-8, 8),
                                    r: MathUtils.randRange(5, 12),
                                    col: i % 2 === 0 ? '#64748b' : '#475569'
                                });
                            }
                        }
                        if (this.bossIntroRocks && this.bossIntroRocks.length > 0) {
                            for (const rk of this.bossIntroRocks) {
                                rk.x += rk.vx * dt;
                                rk.y += rk.vy * dt;
                                rk.vy += 520 * dt;
                                rk.rot += rk.vrot * dt;
                            }
                        }
                    }
                } else if (this.level === 2 && this.boss) {
                    this.boss.x = Number.isFinite(this.bossIntroLandX) ? this.bossIntroLandX : (this.arena.x + this.arena.w * 0.5);
                    this.boss.y = Number.isFinite(this.bossIntroLandY) ? this.bossIntroLandY : (this.arena.y + 235);
                    this.boss.jumpHeight = 0;
                    this.boss.animTime += dt;
                    this.boss.scaleX = MathUtils.lerp(this.boss.scaleX || 1, 1, Math.min(1, dt * 12));
                    this.boss.scaleY = MathUtils.lerp(this.boss.scaleY || 1, 1, Math.min(1, dt * 12));

                    // Amortiguación de escala de la puerta tras golpes
                    this.bossIntroDoorScaleX = MathUtils.lerp(this.bossIntroDoorScaleX || 1, 1, Math.min(1, dt * 10));
                    this.bossIntroDoorScaleY = MathUtils.lerp(this.bossIntroDoorScaleY || 1, 1, Math.min(1, dt * 10));

                    if (t >= 0.62 && !flags.laugh2) {
                        flags.laugh2 = true;
                        if (soundManager.playClownLaugh8Bit) soundManager.playClownLaugh8Bit();
                    }
                    // 1.2s a 2.4s: 3 golpes brutales desde adentro de la puerta
                    if (t >= 1.25 && !flags.doorHit1) {
                        flags.doorHit1 = true;
                        if (soundManager.playDoorBang) soundManager.playDoorBang();
                        this.addScreenShake(9, 0.18);
                        this.bossIntroDoorScaleX = 1.22;
                        this.bossIntroDoorScaleY = 0.85;
                    }
                    if (t >= 1.65 && !flags.doorHit2) {
                        flags.doorHit2 = true;
                        if (soundManager.playDoorBang) soundManager.playDoorBang();
                        this.addScreenShake(11, 0.18);
                        this.bossIntroDoorScaleX = 1.25;
                        this.bossIntroDoorScaleY = 0.83;
                    }
                    if (t >= 2.05 && !flags.doorHit3) {
                        flags.doorHit3 = true;
                        if (soundManager.playDoorBang) soundManager.playDoorBang();
                        this.addScreenShake(13, 0.2);
                        this.bossIntroDoorScaleX = 1.28;
                        this.bossIntroDoorScaleY = 0.80;
                    }
                    // 2.4s a 3.5s: La puerta vuela en pedazos y sale Risín Pepín
                    if (t >= 2.4 && !flags.doorBurst) {
                        flags.doorBurst = true;
                        soundManager.playBossSlam();
                        if (soundManager.playClownLaugh8Bit) soundManager.playClownLaugh8Bit();
                        this.addScreenShake(16, 0.6);
                        this.boss.triggerSquash(1.32, 0.72);
                        this.bossIntroDebris = [];
                        for (let i = 0; i < 16; i++) {
                            const ang = MathUtils.randRange(-Math.PI * 0.85, Math.PI * 0.85);
                            const spd = MathUtils.randRange(180, 420);
                            this.bossIntroDebris.push({
                                x: MathUtils.randRange(-45, 45),
                                y: MathUtils.randRange(-70, 50),
                                vx: Math.cos(ang) * spd * (i % 2 === 0 ? 1 : -1),
                                vy: Math.sin(ang) * spd - 90,
                                rot: Math.random() * Math.PI * 2,
                                vrot: MathUtils.randRange(-10, 10),
                                w: MathUtils.randRange(16, 36),
                                h: MathUtils.randRange(8, 16),
                                color: i % 3 === 0 ? '#334155' : (i % 2 === 0 ? '#78350f' : '#451a03')
                            });
                        }
                    }
                    if (this.bossIntroDebris && this.bossIntroDebris.length > 0) {
                        for (const d of this.bossIntroDebris) {
                            d.x += d.vx * dt;
                            d.y += d.vy * dt;
                            d.vy += 420 * dt;
                            d.rot += d.vrot * dt;
                        }
                    }
                }
            } catch (introErr) {
                console.error('Error recuperado en update BOSS_INTRO:', introErr);
            }

            if (this.bossIntroTimer <= 0) {
                this.bossIntroTimer = 0;
                const cx = Number.isFinite(this.bossIntroLandX) ? this.bossIntroLandX : (this.arena.x + this.arena.w * 0.5);
                const ly = Number.isFinite(this.bossIntroLandY) ? this.bossIntroLandY : (this.arena.y + 235);
                if (this.boss) {
                    this.boss.x = cx;
                    this.boss.y = ly;
                    this.boss.jumpHeight = 0;
                    this.boss.scaleX = 1;
                    this.boss.scaleY = 1;
                }
                if (this.player) {
                    this.player.x = cx;
                    this.player.y = Math.min(this.arena.y + this.arena.h - 90, ly + 155);
                    this.player.aimAngle = -Math.PI * 0.5;
                }
                if (this.ui && this.ui.bossHud) {
                    this.ui.bossHud.style.display = 'block';
                }
                this.state = 'PLAYING';
                this.updateCamera(0, true);
            }
        } else if (this.state === 'PLAYING') {
            if (this.isPowerupOpen || this.isAdminOpen) {
                this.updateHUD();
                return;
            }
            this.player.update(dt, this);

            // Actualizar Pilares
            for (const p of this.pillars) p.update(dt);

            // Actualizar Bombas Grito plantadas por Dash
            for (let i = this.bombs.length - 1; i >= 0; i--) {
                this.bombs[i].update(dt, this);
                if (this.bombs[i].dead) this.bombs.splice(i, 1);
            }

            // Actualizar Charcos Debilitadores (Risín Pepín)
            for (let i = this.puddles.length - 1; i >= 0; i--) {
                this.puddles[i].update(dt, this);
                if (this.puddles[i].dead) this.puddles.splice(i, 1);
            }

            // Actualizar Orbes de Botín
            for (let i = this.pickups.length - 1; i >= 0; i--) {
                this.pickups[i].update(dt, this.player, this);
                if (this.pickups[i].dead) this.pickups.splice(i, 1);
            }

            // Actualizar Enemigos
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                this.enemies[i].update(dt, this);
                if (this.enemies[i].dead) this.enemies.splice(i, 1);
            }

            // Actualizar Jefe si está activo
            if (this.boss && !this.boss.dead) {
                this.boss.update(dt, this);
            }

            // Actualizar Proyectiles
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                this.projectiles[i].update(dt, this);
                if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
            }

            // Control de progresión de Oleadas: 10s de descanso en rondas 1-4; Sala Pre-Jefe sin límite tras Ronda 5
            if (this.enemies.length === 0 && !this.boss && !this.postPepePowerupGate && this.state === 'PLAYING') {
                if (!this.waveIntermission) {
                    this.waveIntermission = true;
                    if (this.currentWave >= this.maxWaves) {
                        this.setupPreBossRoom();
                    } else {
                        this.preBossPrepare = false;
                        this.waveCooldown = 10.0;
                    }
                } else if (!this.preBossPrepare) {
                    this.waveCooldown -= dt;
                    if (this.waveCooldown <= 0) {
                        this.waveIntermission = false;
                        this.waveCooldown = 0;
                        if (this.currentWave < this.maxWaves) {
                            this.currentWave++;
                            this.spawnWave(this.currentWave);
                        } else {
                            this.setupPreBossRoom();
                        }
                    }
                }
            }
        }

        // Actualizar Partículas y Textos Flotantes
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].update(dt);
            if (this.floatingTexts[i].life <= 0) this.floatingTexts.splice(i, 1);
        }

        this.updateHUD();
    }

    updateHUD() {
        if (!this.player) return;
        const hpPct = MathUtils.clamp((this.player.hp / this.player.maxHp) * 100, 0, 100);
        if (this.ui.levelBadge) this.ui.levelBadge.style.display = (this.level === 2 && this.player.powered) ? 'block' : 'none';
        this.ui.hpBar.style.width = `${hpPct}%`;
        this.ui.hpText.textContent = `${this.player.hp} / ${this.player.maxHp}`;
        if (this.ui.goldText) this.ui.goldText.textContent = `${this.player.gold || 0}`;

        // Actualizar inventario de las 3 Pociones en el HUD ([4], [5], [6])
        if (this.player.potions) {
            const pots = this.player.potions;
            if (this.ui.potCountHeal) this.ui.potCountHeal.textContent = `x${pots.heal || 0}`;
            if (this.ui.potCountFury) this.ui.potCountFury.textContent = `x${pots.fury || 0}`;
            if (this.ui.potCountSpeed) this.ui.potCountSpeed.textContent = `x${pots.speed || 0}`;
            if (this.ui.potSlotHeal) this.ui.potSlotHeal.style.opacity = (pots.heal || 0) > 0 ? '1' : '0.45';
            if (this.ui.potSlotFury) this.ui.potSlotFury.style.opacity = (pots.fury || 0) > 0 ? '1' : '0.45';
            if (this.ui.potSlotSpeed) this.ui.potSlotSpeed.style.opacity = (pots.speed || 0) > 0 ? '1' : '0.45';
        }

        // Barra inferior de interacción durante la fase Pre-Jefe (Tienda y Bailarín)
        if (this.ui.prebossBar) {
            const showBar = this.preBossPrepare && this.state === 'PLAYING' && !this.isShopOpen && !this.isPaused;
            this.ui.prebossBar.classList.toggle('hidden', !showBar);
            if (showBar && this.ui.btnSummonBoss) {
                this.ui.btnSummonBoss.textContent = this.level === 2
                    ? '[E / TOCAR AQUÍ]: ¡IR A POR RISÍN PEPÍN!'
                    : '[E / TOCAR AQUÍ]: ¡IR A POR EL PEPE!';
                this.ui.btnSummonBoss.classList.toggle('hidden', !this.isNearDancer());
            }
        }

        // Botón emergente para adelantar la oleada junto a la Puerta de Oleada
        if (this.ui.waveSkipBar) {
            const showSkip = this.isNearWaveGate() && !this.isShopOpen && !this.isPowerupOpen;
            this.ui.waveSkipBar.classList.toggle('hidden', !showSkip);
        }

        // Botón emergente para abrir el Santuario de Power-Ups tras vencer a El Pepe
        if (this.ui.powerupGateBar) {
            const showPowerGate = this.isNearPowerupGate() && !this.isPowerupOpen && !this.isPaused;
            this.ui.powerupGateBar.classList.toggle('hidden', !showPowerGate);
        }

        const dashReadyPct = this.player.dashCooldownTimer <= 0
            ? 100
            : (1 - this.player.dashCooldownTimer / this.player.dashCooldown) * 100;
        this.ui.dashBar.style.width = `${dashReadyPct}%`;
        this.ui.dashText.textContent = this.player.dashCooldownTimer <= 0 ? 'LISTO' : 'RECARGANDO';

        if (!this.boss) {
            if (this.postPepePowerupGate) {
                this.ui.waveCounter.textContent = 'SANTUARIO DE POWER-UP';
                this.ui.waveCounter.style.color = '#ffd700';
            } else if (this.preBossPrepare) {
                this.ui.waveCounter.textContent = `PREPARACIÓN PRE-JEFE (5 / ${this.maxWaves})`;
                this.ui.waveCounter.style.color = '#ffd700';
            } else {
                this.ui.waveCounter.textContent = `OLEADA: ${this.currentWave} / ${this.maxWaves}`;
                this.ui.waveCounter.style.color = '#00f5d4';
            }
        }

        // Indicador de Arma en el HUD
        if (this.ui.weaponName) {
            const hasBelce = this.player.hasPowerUp ? this.player.hasPowerUp('BELCESWORD') : this.player.powerup === 'BELCESWORD';
            const hasLola = this.player.hasPowerUp ? this.player.hasPowerUp('LOLA_BLASTER') : this.player.powerup === 'LOLA_BLASTER';
            const swordBaseName = hasBelce ? 'BELCESWORD' : 'ESPADA';
            const gunBaseName = hasLola ? 'LOLA BLASTER' : 'PISTOLA';

            if (this.player.currentWeapon === 'RIFLE') {
                if (this.player.isReloadingRifle) {
                    this.ui.weaponName.textContent = '[3] RIFLE (RECARGANDO...)';
                } else {
                    this.ui.weaponName.textContent = `[3] RIFLE (${this.player.infiniteItems ? '∞' : this.player.rifleAmmo + '/' + this.player.rifleMaxAmmo})`;
                }
                this.ui.weaponName.style.color = '#fbbf24';
            } else if (this.player.currentWeapon === 'GUN') {
                if (this.player.isReloadingPistol) {
                    this.ui.weaponName.textContent = `[2] ${gunBaseName} (RECARGANDO...)`;
                } else {
                    this.ui.weaponName.textContent = `[2] ${gunBaseName} (${this.player.infiniteItems ? '∞' : this.player.pistolAmmo + '/' + this.player.pistolMaxAmmo})`;
                }
                this.ui.weaponName.style.color = hasLola ? '#00f5d4' : '#38bdf8';
            } else {
                this.ui.weaponName.textContent = `[1] ${swordBaseName}`;
                this.ui.weaponName.style.color = hasBelce ? '#c084fc' : '#00f5d4';
            }
            if (this.ui.weaponHint) {
                const cw = this.player.currentWeapon;
                const slot = (n, label, owned, key) => {
                    const active = cw === key;
                    const color = !owned ? '#475569' : (active ? '#00f5d4' : '#94a3b8');
                    const border = active ? '1px solid #00f5d4' : '1px solid #334155';
                    return `<span style="display:inline-block;margin-right:4px;padding:1px 5px;border:${border};color:${color};opacity:${owned ? 1 : 0.5};text-shadow:2px 2px 4px rgba(0,0,0,0.95);background:rgba(15,23,42,0.45);border-radius:2px;">${n}:${label}${owned ? '' : ' 🔒'}</span>`;
                };
                const pistolLabel = this.player.hasGun
                    ? (this.player.isReloadingPistol ? `${gunBaseName} (RECARGANDO...)` : `${gunBaseName} (${this.player.infiniteItems ? '∞' : this.player.pistolAmmo + '/' + this.player.pistolMaxAmmo})`)
                    : gunBaseName;
                const rifleLabel = this.player.hasRifle
                    ? (this.player.isReloadingRifle ? 'RIFLE (RECARGANDO...)' : `RIFLE (${this.player.infiniteItems ? '∞' : this.player.rifleAmmo + '/' + this.player.rifleMaxAmmo})`)
                    : 'RIFLE';
                this.ui.weaponHint.innerHTML =
                    slot(1, swordBaseName, this.player.hasSword !== false, 'SWORD') +
                    slot(2, pistolLabel, this.player.hasGun, 'GUN') +
                    slot(3, rifleLabel, this.player.hasRifle, 'RIFLE') + ' [Q]';
            }
        }

        // Indicador de mejoras activas (Orbes, Pociones, Admin y estado de sueño / veneno / debilidad)
        const buffs = [];
        if (this.player.isImmortal) buffs.push('🛡️ INMORTAL');
        if (this.player.infiniteItems) buffs.push('♾️ INFINITO');
        if (this.player.sleepTimer > 0) buffs.push(`💤 ¡DORMIDO! (${this.player.sleepTimer.toFixed(1)}s)`);
        if (this.player.poisonTimer > 0) buffs.push(`☠️ ENVENENADO (${this.player.poisonTimer.toFixed(1)}s)`);
        if (this.player.weaknessTimer > 0) buffs.push(`🧪 DAÑO -10% (${this.player.weaknessTimer.toFixed(1)}s)`);
        if (this.player.furyPotionTimer > 0) buffs.push(`POCIÓN FURIA +30% (${this.player.furyPotionTimer.toFixed(1)}s)`);
        if (this.player.speedPotionTimer > 0) buffs.push(`POCIÓN VEL +30% (${this.player.speedPotionTimer.toFixed(1)}s)`);
        if (this.player.damageBoostTimer > 0) buffs.push(`FURIA (${this.player.damageBoostTimer.toFixed(1)}s)`);
        if (this.player.speedBoostTimer > 0) buffs.push(`PRISA (${this.player.speedBoostTimer.toFixed(1)}s)`);
        this.ui.buffIndicator.textContent = buffs.join(' | ');

        // Actualizar Barra del Jefe
        if (this.boss && !this.boss.dead) {
            const bossPct = MathUtils.clamp((this.boss.hp / this.boss.maxHp) * 100, 0, 100);
            this.ui.bossHpBar.style.width = `${bossPct}%`;
            if (this.boss.enraged) {
                this.ui.bossTitle.textContent = this.level === 2 ? 'RISÍN PEPÍN - ¡RISA DESCONTROLADA!' : 'EL PEPE MAESTRO - ¡ENFURECIDO!';
                this.ui.bossTitle.style.color = '#fbbf24';
            } else {
                this.ui.bossTitle.textContent = this.level === 2 ? 'RISÍN PEPÍN - EL SEÑOR DE LA RISA' : 'EL PEPE MAESTRO - SEÑOR DE LA MAZMORRA';
                this.ui.bossTitle.style.color = '#fca5a5';
            }
        }
    }

    drawArenaDungeon(ctx) {
        const { x, y, w, h } = this.arena;

        // 1. Dibujar el fondo abisal y el suelo de la mazmorra
        const zoom = this.cameraZoom || 1.0;
        const viewW = this.width / zoom;
        const viewH = this.height / zoom;
        ctx.fillStyle = '#06070a';
        ctx.fillRect(this.camera.x - 200, this.camera.y - 200, viewW + 400, viewH + 400);

        if (this.dungeonFloorCanvas) {
            ctx.drawImage(this.dungeonFloorCanvas, 0, 0);
        } else {
            ctx.fillStyle = '#4c4f56';
            ctx.fillRect(x, y, w, h);
        }

        // 2. Mob Spawner en el Centro de la Arena (Minecraft Dungeon Mob Spawner)
        for (const sp of this.spawners) {
        const spawnerX = sp.x;
        const spawnerY = sp.y;
        const sSize = 46;
        const hs = sSize * 0.5;

        // Sombra proyectada del Spawner
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(spawnerX - hs + 4, spawnerY - hs + 6, sSize, sSize);

        // Fondo interior oscuro / vacío del spawner
        ctx.fillStyle = '#0a0a0d';
        ctx.fillRect(spawnerX - hs, spawnerY - hs, sSize, sSize);

        // Resplandor ardiente interno
        const fireGrad = ctx.createRadialGradient(spawnerX, spawnerY, 2, spawnerX, spawnerY, hs * 0.9);
        fireGrad.addColorStop(0, 'rgba(251, 146, 60, 0.45)');
        fireGrad.addColorStop(0.6, 'rgba(234, 88, 12, 0.18)');
        fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = fireGrad;
        ctx.fillRect(spawnerX - hs, spawnerY - hs, sSize, sSize);

        // Miniatura giratoria dentro del Spawner (Mini figura/llama procedural)
        ctx.save();
        ctx.translate(spawnerX, spawnerY);
        ctx.rotate(this.globalTime * 2.8);

        ctx.fillStyle = '#ea580c';
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-5, -5, 10, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -3, 2, 2);
        ctx.fillRect(2, -3, 2, 2);
        ctx.restore();

        // Jaula de barrotes de hierro (Iron Spawner Cage)
        ctx.strokeStyle = '#181818';
        ctx.lineWidth = 3;
        ctx.strokeRect(spawnerX - hs, spawnerY - hs, sSize, sSize);

        // Rejilla de barrotes horizontales y verticales
        ctx.strokeStyle = '#25262b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let offset = -hs + 9; offset < hs; offset += 9) {
            ctx.moveTo(spawnerX + offset, spawnerY - hs);
            ctx.lineTo(spawnerX + offset, spawnerY + hs);
            ctx.moveTo(spawnerX - hs, spawnerY + offset);
            ctx.lineTo(spawnerX + hs, spawnerY + offset);
        }
        ctx.stroke();

        // Esquinas reforzadas de metal oscuro y remaches
        ctx.fillStyle = '#373a40';
        const crSize = 6;
        ctx.fillRect(spawnerX - hs, spawnerY - hs, crSize, crSize);
        ctx.fillRect(spawnerX + hs - crSize, spawnerY - hs, crSize, crSize);
        ctx.fillRect(spawnerX - hs, spawnerY + hs - crSize, crSize, crSize);
        ctx.fillRect(spawnerX + hs - crSize, spawnerY + hs - crSize, crSize, crSize);

        ctx.fillStyle = '#686d76';
        ctx.fillRect(spawnerX - hs + 1, spawnerY - hs + 1, 2, 2);
        ctx.fillRect(spawnerX + hs - crSize + 1, spawnerY - hs + 1, 2, 2);
        ctx.fillRect(spawnerX - hs + 1, spawnerY + hs - crSize + 1, 2, 2);
        ctx.fillRect(spawnerX + hs - crSize + 1, spawnerY + hs - crSize + 1, 2, 2);

        }

        // 3. Antorchas de Madera en Paredes e Iluminación Radial Cálida
        const cam = this.camera;
        for (const t of this.torches) {
            if (t.x < cam.x - 220 || t.x > cam.x + this.width + 220 || t.y < cam.y - 220 || t.y > cam.y + this.height + 220) continue;
            const flicker = Math.sin(this.globalTime * 10 + t.x * 0.1) * 6 + Math.cos(this.globalTime * 18 + t.y * 0.1) * 4;
            const lightRadius = 145 + flicker;

            // Iluminación cálida radial dinámica en baldosas cercanas (modo ahorro activo con menús/pausa o bajo rendimiento)
            const inMenuOrPaused = this.state === 'MENU' || this.isPaused || this.isAdminOpen || (this.isAnyMenuOpen && this.isAnyMenuOpen());
            if (this.lowSpecMode || inMenuOrPaused) {
                if (this.offscreenLightCanvas) {
                    const r = 145;
                    ctx.drawImage(this.offscreenLightCanvas, t.x - r, t.y - 4 - r, r * 2, r * 2);
                } else {
                    ctx.fillStyle = 'rgba(255, 170, 60, 0.08)';
                    ctx.beginPath();
                    ctx.arc(t.x, t.y - 4, 140, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                const grad = ctx.createRadialGradient(t.x, t.y - 4, 3, t.x, t.y - 4, lightRadius);
                grad.addColorStop(0, 'rgba(255, 170, 60, 0.24)');
                grad.addColorStop(0.35, 'rgba(234, 88, 12, 0.10)');
                grad.addColorStop(0.7, 'rgba(234, 88, 12, 0.03)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(t.x, t.y - 4, lightRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Mango de madera rectangular (#8b5a2b)
            ctx.fillStyle = '#8b5a2b';
            ctx.fillRect(t.x - 3, t.y - 2, 6, 14);
            ctx.fillStyle = '#5c3a1e';
            ctx.fillRect(t.x + 1, t.y - 2, 2, 14);

            // Carbón superior oscuro
            ctx.fillStyle = '#262626';
            ctx.fillRect(t.x - 4, t.y - 6, 8, 4);
            ctx.fillStyle = '#171717';
            ctx.fillRect(t.x + 1, t.y - 6, 3, 4);

            // Cubo de fuego pixelado amarillo/naranja con textura
            const fy = Math.sin(this.globalTime * 14 + t.x) * 1.5;
            ctx.fillStyle = '#ea580c';
            ctx.fillRect(t.x - 4, t.y - 13 + fy, 8, 8);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(t.x - 3, t.y - 12 + fy, 6, 6);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(t.x - 1, t.y - 10 + fy, 3, 3);
        }
    }

    drawFortniteDancerAt(ctx, cx, cy) {
        // 1. Foco de luz disco / neón en el suelo bajo la silueta
        ctx.save();
        const spotRadius = 88 + Math.sin(this.globalTime * 8) * 8;
        const spotGrad = ctx.createRadialGradient(cx, cy + 42, 6, cx, cy + 42, spotRadius);
        spotGrad.addColorStop(0, 'rgba(0, 240, 255, 0.40)');
        spotGrad.addColorStop(0.45, 'rgba(168, 85, 247, 0.22)');
        spotGrad.addColorStop(0.8, 'rgba(236, 72, 153, 0.08)');
        spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = spotGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 42, spotRadius, spotRadius * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Silueta Humanoide Articulada ejecutando "The Floss" a 120 BPM
        const phase = this.globalTime * Math.PI * 4;
        const hipSway = Math.sin(phase) * 18;
        const bounce = Math.abs(Math.sin(phase * 2)) * 3;
        const armSwingAngle = -Math.sin(phase) * 1.18;

        ctx.save();
        ctx.translate(cx, cy);

        ctx.fillStyle = '#10121a';
        ctx.strokeStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 15;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const leftFootX = -18;
        const rightFootX = 18;
        const floorY = 42;
        const pelvisX = hipSway;
        const pelvisY = 15 - bounce;

        // Pierna Izquierda
        const leftKneeX = (leftFootX + pelvisX) * 0.5 - 4;
        const leftKneeY = (floorY + pelvisY) * 0.5 + 2;
        ctx.beginPath();
        ctx.moveTo(pelvisX - 6, pelvisY);
        ctx.lineTo(leftKneeX, leftKneeY);
        ctx.lineTo(leftFootX, floorY);
        ctx.stroke();

        // Pierna Derecha
        const rightKneeX = (rightFootX + pelvisX) * 0.5 + 4;
        const rightKneeY = (floorY + pelvisY) * 0.5 + 2;
        ctx.beginPath();
        ctx.moveTo(pelvisX + 6, pelvisY);
        ctx.lineTo(rightKneeX, rightKneeY);
        ctx.lineTo(rightFootX, floorY);
        ctx.stroke();

        // Pies
        ctx.fillRect(leftFootX - 8, floorY - 2, 14, 5);
        ctx.strokeRect(leftFootX - 8, floorY - 2, 14, 5);
        ctx.fillRect(rightFootX - 6, floorY - 2, 14, 5);
        ctx.strokeRect(rightFootX - 6, floorY - 2, 14, 5);

        // Torso
        const chestX = -hipSway * 0.35;
        const chestY = -13 - bounce;
        ctx.beginPath();
        ctx.moveTo(pelvisX - 8, pelvisY);
        ctx.lineTo(pelvisX + 8, pelvisY);
        ctx.lineTo(chestX + 11, chestY);
        ctx.lineTo(chestX - 11, chestY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cabeza
        const headX = -hipSway * 0.2;
        const headY = chestY - 18;
        ctx.beginPath();
        ctx.arc(headX, headY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Brazos articulados
        const leftShoulderX = chestX - 12;
        const rightShoulderX = chestX + 12;
        const shoulderY = chestY + 2;

        const arm1Angle = Math.PI * 0.5 + armSwingAngle;
        const leftElbowX = leftShoulderX + Math.cos(arm1Angle) * 16;
        const leftElbowY = shoulderY + Math.sin(arm1Angle) * 16;
        const leftHandX = leftElbowX + Math.cos(arm1Angle + 0.12) * 16;
        const leftHandY = leftElbowY + Math.sin(arm1Angle + 0.12) * 16;

        ctx.beginPath();
        ctx.moveTo(leftShoulderX, shoulderY);
        ctx.lineTo(leftElbowX, leftElbowY);
        ctx.lineTo(leftHandX, leftHandY);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(leftHandX, leftHandY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const arm2Angle = Math.PI * 0.5 + armSwingAngle;
        const rightElbowX = rightShoulderX + Math.cos(arm2Angle) * 16;
        const rightElbowY = shoulderY + Math.sin(arm2Angle) * 16;
        const rightHandX = rightElbowX + Math.cos(arm2Angle - 0.12) * 16;
        const rightHandY = rightElbowY + Math.sin(arm2Angle - 0.12) * 16;

        ctx.beginPath();
        ctx.moveTo(rightShoulderX, shoulderY);
        ctx.lineTo(rightElbowX, rightElbowY);
        ctx.lineTo(rightHandX, rightHandY);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rightHandX, rightHandY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // 3. Notas musicales y destellos flotantes alrededor de la silueta
        const musicalIcons = ['♪', '♫', '♩', '✦', '★', '♫'];
        for (let i = 0; i < musicalIcons.length; i++) {
            const rot = (i / musicalIcons.length) * Math.PI * 2 + this.globalTime * 1.6;
            const radiusOffset = 54 + Math.sin(this.globalTime * 4 + i) * 12;
            const ix = cx + Math.cos(rot) * radiusOffset;
            const progress = ((this.globalTime * 28 + i * 22) % 60) / 60;
            const iy = cy + Math.sin(rot) * (radiusOffset * 0.45) - progress * 45;
            const alpha = MathUtils.clamp(1 - progress, 0.15, 1);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = i % 2 === 0 ? '#00f0ff' : '#f43f5e';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 10;
            ctx.font = '900 18px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(musicalIcons[i], ix, iy);
            ctx.restore();
        }
    }

    drawFortniteInterlude(ctx) {
        const zoom = this.cameraZoom || 1.0;
        const viewW = this.width / zoom;
        const viewH = this.height / zoom;
        const cx = this.camera.x + viewW * 0.5;
        const cy = this.camera.y + viewH * 0.5;

        this.drawFortniteDancerAt(ctx, cx, cy);

        // Cartel grande en pantalla: "¡RONDA COMPLETADA! SIGUIENTE RONDA EN: X.Xs"
        ctx.save();
        const bannerY = Math.max(this.arena.y, this.camera.y) + 75;
        const bw = 560;
        const bh = 68;

        ctx.fillStyle = 'rgba(8, 12, 22, 0.88)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 18;
        ctx.fillRect(cx - bw * 0.5, bannerY - bh * 0.5, bw, bh);
        ctx.strokeRect(cx - bw * 0.5, bannerY - bh * 0.5, bw, bh);

        ctx.font = '900 23px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 12;
        ctx.fillText('¡RONDA COMPLETADA!', cx, bannerY - 13);

        const timerText = `SIGUIENTE RONDA EN: ${Math.max(0, this.waveCooldown).toFixed(1)}s`;
        ctx.font = '900 16px "Courier New", monospace';
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 8;
        ctx.fillText(timerText, cx, bannerY + 15);
        ctx.restore();

        // Puerta interactiva en la parte superior central para adelantar la oleada
        this.drawWaveSkipGate(ctx);
    }

    drawWaveSkipGate(ctx) {
        if (!this.waveGatePos || !this.isWaveSkipAvailable()) return;
        const gx = this.waveGatePos.x;
        const gy = this.waveGatePos.y;
        const near = this.isNearWaveGate();
        const pulse = 0.72 + Math.sin(this.globalTime * 6) * 0.28;

        ctx.save();
        ctx.translate(gx, gy);

        // Aura mágica en el suelo frente a la puerta
        const floorGlow = ctx.createRadialGradient(0, 10, 6, 0, 10, 74);
        floorGlow.addColorStop(0, near ? 'rgba(0, 245, 212, 0.42)' : 'rgba(56, 189, 248, 0.24)');
        floorGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = floorGlow;
        ctx.beginPath();
        ctx.ellipse(0, 12, 74, 34, 0, 0, Math.PI * 2);
        ctx.fill();

        // Arco de piedra de la Puerta de Oleada
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = near ? '#00f5d4' : '#64748b';
        ctx.lineWidth = near ? 3 : 2;
        ctx.beginPath();
        ctx.roundRect(-34, -34, 68, 56, [24, 24, 4, 4]);
        ctx.fill();
        ctx.stroke();

        // Portal energético interior
        const portalGrad = ctx.createLinearGradient(0, -24, 0, 18);
        portalGrad.addColorStop(0, `rgba(0, 245, 212, ${0.85 * pulse})`);
        portalGrad.addColorStop(0.55, `rgba(16, 185, 129, ${0.75 * pulse})`);
        portalGrad.addColorStop(1, 'rgba(6, 78, 59, 0.9)');
        ctx.fillStyle = portalGrad;
        ctx.beginPath();
        ctx.roundRect(-22, -24, 44, 42, [16, 16, 2, 2]);
        ctx.fill();

        // Símbolo de avance rápido (>>) dentro del portal
        ctx.fillStyle = '#ecfeff';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('>>', 0, -3);

        // Etiqueta superior fija
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 3;
        const headerLabel = `PUERTA DE OLEADA (${this.currentWave + 1}/${this.maxWaves})`;
        ctx.strokeText(headerLabel, 0, -45);
        ctx.fillStyle = '#67e8f9';
        ctx.fillText(headerLabel, 0, -45);

        // Prompt interactivo
        const promptText = near
            ? '[E / TOCAR AQUÍ]: ADELANTAR OLEADA (SKIP)'
            : 'ACÉRCATE PARA ADELANTAR OLEADA';
        ctx.font = near ? 'bold 12px "Courier New", monospace' : 'bold 10px "Courier New", monospace';
        ctx.strokeText(promptText, 0, 36);
        ctx.fillStyle = near ? '#fbbf24' : '#94a3b8';
        ctx.fillText(promptText, 0, 36);

        ctx.restore();
    }

    drawPowerupGate(ctx) {
        if (!this.postPepePowerupGate || !this.powerupGatePos) return;
        const gx = this.powerupGatePos.x;
        const gy = this.powerupGatePos.y;
        const near = this.isNearPowerupGate();
        const pulse = 0.72 + Math.sin(this.globalTime * 5.5) * 0.28;

        ctx.save();
        ctx.translate(gx, gy);

        // Aura dorada/arcana sobre el suelo
        const glow = ctx.createRadialGradient(0, 14, 10, 0, 14, 98);
        glow.addColorStop(0, near ? 'rgba(255, 215, 0, 0.48)' : 'rgba(168, 85, 247, 0.32)');
        glow.addColorStop(0.6, 'rgba(0, 245, 212, 0.16)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(0, 16, 98, 44, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pilares y arco místico dorado
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = near ? '#ffd700' : '#a855f7';
        ctx.lineWidth = near ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.roundRect(-44, -52, 88, 76, [36, 36, 6, 6]);
        ctx.fill();
        ctx.stroke();

        // Núcleo de energía cósmica
        const portalGrad = ctx.createLinearGradient(0, -40, 0, 20);
        portalGrad.addColorStop(0, `rgba(251, 191, 36, ${0.9 * pulse})`);
        portalGrad.addColorStop(0.5, `rgba(168, 85, 247, ${0.85 * pulse})`);
        portalGrad.addColorStop(1, 'rgba(0, 245, 212, 0.78)');
        ctx.fillStyle = portalGrad;
        ctx.beginPath();
        ctx.roundRect(-30, -38, 60, 58, [26, 26, 4, 4]);
        ctx.fill();

        // Símbolo estelar central
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 14;
        ctx.font = 'bold 22px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', 0, -9);

        // Letrero visible siempre
        ctx.shadowBlur = 0;
        ctx.font = '900 13px "Courier New", monospace';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 3.5;
        const title = 'PUERTA DE PODER - ACÉRCATE [E / TOCAR]';
        ctx.strokeText(title, 0, -68);
        ctx.fillStyle = '#ffd700';
        ctx.fillText(title, 0, -68);

        if (near) {
            const sub = '[E / TOCAR AQUÍ]: ELEGIR POWER-UP PARA NIVEL 2';
            ctx.font = '900 12px "Courier New", monospace';
            ctx.strokeText(sub, 0, 40);
            ctx.fillStyle = '#00f5d4';
            ctx.fillText(sub, 0, 40);
        }

        ctx.restore();
    }

    drawPreBossRoom(ctx) {
        const sx = this.shopPos.x;
        const sy = this.shopPos.y;
        const dx = this.dancerPos.x;
        const dy = this.dancerPos.y;
        const nearShop = this.isNearShop();
        const nearDancer = this.isNearDancer();

        // 1. PUESTO DE LA TIENDA DE POCIONES
        ctx.save();
        ctx.translate(sx, sy);

        // Alfombra / Aura dorada en el suelo bajo la tienda
        const shopGlow = ctx.createRadialGradient(0, 22, 6, 0, 22, 78);
        shopGlow.addColorStop(0, 'rgba(255, 215, 0, 0.32)');
        shopGlow.addColorStop(0.6, 'rgba(168, 85, 247, 0.16)');
        shopGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shopGlow;
        ctx.beginPath();
        ctx.ellipse(0, 26, 78, 36, 0, 0, Math.PI * 2);
        ctx.fill();

        // Postes de madera laterales del puesto
        ctx.fillStyle = '#5c3a1e';
        ctx.strokeStyle = '#1e1b18';
        ctx.lineWidth = 2;
        ctx.fillRect(-46, -36, 7, 66);
        ctx.strokeRect(-46, -36, 7, 66);
        ctx.fillRect(39, -36, 7, 66);
        ctx.strokeRect(39, -36, 7, 66);

        // Mercader místico detrás del mostrador
        ctx.fillStyle = '#311042';
        ctx.beginPath();
        ctx.arc(0, -10, 14, Math.PI, 0, false);
        ctx.lineTo(14, 6);
        ctx.lineTo(-14, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Ojos brillantes del mercader
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-5, -13, 3, 3);
        ctx.fillRect(2, -13, 3, 3);

        // Mostrador de madera robusta
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#271206';
        ctx.lineWidth = 2;
        ctx.fillRect(-50, 4, 100, 26);
        ctx.strokeRect(-50, 4, 100, 26);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(-52, 0, 104, 7);
        ctx.strokeRect(-52, 0, 104, 7);

        // Los 3 frascos/botellas de poción expuestos sobre el mostrador + bolsita de oro
        drawPotionFlask(ctx, -28, -5, 9.5, '#4ade80', 'heal');
        drawPotionFlask(ctx, -4, -5, 9.5, '#f97316', 'fury');
        drawPotionFlask(ctx, 20, -5, 9.5, '#38bdf8', 'speed');
        drawGoldBagIcon(ctx, 38, -3, 7.5);

        // Toldo superior a rayas (púrpura y dorado)
        const stripes = 5;
        const awningW = 108;
        const stripeW = awningW / stripes;
        for (let i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#7e22ce' : '#eab308';
            ctx.fillRect(-awningW * 0.5 + i * stripeW, -46, stripeW, 14);
            ctx.strokeRect(-awningW * 0.5 + i * stripeW, -46, stripeW, 14);
        }

        // Letrero flotante: "TIENDA DE POCIONES"
        const bob = Math.sin(this.globalTime * 4) * 3;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = nearShop ? '#00f5d4' : '#ffd700';
        ctx.lineWidth = 2;
        ctx.shadowColor = nearShop ? '#00f5d4' : '#ffd700';
        ctx.shadowBlur = 12;
        ctx.fillRect(-82, -80 + bob, 164, 24);
        ctx.strokeRect(-82, -80 + bob, 164, 24);

        ctx.shadowBlur = 0;
        ctx.font = '900 12px "Courier New", monospace';
        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TIENDA DE POCIONES', 0, -68 + bob);

        if (nearShop) {
            ctx.fillStyle = 'rgba(6, 10, 20, 0.92)';
            ctx.strokeStyle = '#00f5d4';
            ctx.lineWidth = 1.5;
            ctx.fillRect(-92, 36, 184, 20);
            ctx.strokeRect(-92, 36, 184, 20);
            ctx.fillStyle = '#00f5d4';
            ctx.font = '900 10.5px "Courier New", monospace';
            ctx.fillText('[T / E / CLICK]: ABRIR TIENDA', 0, 46);
        }
        ctx.restore();

        // 2. MUÑECO AZUL BAILANDO FORTNITE PARA INVOCAR A EL PEPE MAESTRO
        this.drawFortniteDancerAt(ctx, dx, dy);

        ctx.save();
        const dBob = Math.sin(this.globalTime * 5) * 3;
        if (nearDancer) {
            const pw = 268;
            const ph = 28;
            const py = dy - 74 + dBob;
            ctx.fillStyle = 'rgba(8, 15, 30, 0.95)';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2.2;
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 16;
            ctx.fillRect(dx - pw * 0.5, py, pw, ph);
            ctx.strokeRect(dx - pw * 0.5, py, pw, ph);

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#00f0ff';
            ctx.font = '900 11.5px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('[E / TOCAR AQUÍ]: ¡IR A POR EL PEPE!', dx, py + ph * 0.5);
        } else {
            const pw = 210;
            const ph = 22;
            const py = dy - 70 + dBob;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.fillRect(dx - pw * 0.5, py, pw, ph);
            ctx.strokeRect(dx - pw * 0.5, py, pw, ph);

            ctx.fillStyle = '#38bdf8';
            ctx.font = '900 10.5px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ACÉRCATE PARA INVOCAR AL JEFE', dx, py + ph * 0.5);
        }
        ctx.restore();

        // 3. Cartel informativo superior en cámara
        ctx.save();
        const zoom = this.cameraZoom || 1.0;
        const viewW = this.width / zoom;
        const camCx = this.camera.x + viewW * 0.5;
        const bannerY = Math.max(this.arena.y, this.camera.y) + 58;
        const bw = 610;
        const bh = 54;

        ctx.fillStyle = 'rgba(8, 12, 22, 0.88)';
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 14;
        ctx.fillRect(camCx - bw * 0.5, bannerY - bh * 0.5, bw, bh);
        ctx.strokeRect(camCx - bw * 0.5, bannerY - bh * 0.5, bw, bh);

        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 17px "Courier New", monospace';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('¡5 RONDAS COMPLETADAS! SALA DE PREPARACIÓN', camCx, bannerY - 10);
        ctx.font = '900 12px "Courier New", monospace';
        ctx.fillStyle = '#00f0ff';
        ctx.fillText('COMPRA POCIONES EN LA TIENDA Y ACÉRCATE AL BAILARÍN PARA PELEAR', camCx, bannerY + 11);
        ctx.restore();
    }

    drawBossIntroWorld(ctx) {
        this.drawBossIntroCutscene(ctx);
    }

    drawBossIntroCutscene(ctx) {
        const W = Number.isFinite(this.width) && this.width > 0 ? this.width : 960;
        const H = Number.isFinite(this.height) && this.height > 0 ? this.height : 640;
        const t = Number.isFinite(this.bossIntroElapsed) ? this.bossIntroElapsed : 0;
        const barH = Math.round(H * 0.105);

        const drawBossActorAt = (sx, sy, scale, lookX, lookY) => {
            if (!this.boss) return;
            const prevX = this.boss.x;
            const prevY = this.boss.y;
            const prevJump = this.boss.jumpHeight;
            const prevState = this.boss.state;
            ctx.save();
            try {
                ctx.translate(sx, sy);
                ctx.scale(scale, scale);
                this.boss.x = 0;
                this.boss.y = 0;
                this.boss.jumpHeight = 0;
                this.boss.state = 'IDLE';
                const relPlayer = {
                    x: (lookX - sx) / (scale || 1),
                    y: (lookY - sy) / (scale || 1)
                };
                this.boss.draw(ctx, relPlayer);
            } catch (e) {
            } finally {
                this.boss.x = prevX;
                this.boss.y = prevY;
                this.boss.jumpHeight = prevJump;
                this.boss.state = prevState;
                ctx.restore();
            }
        };

        const drawPlayerActorAt = (sx, sy, scale, aimAngle) => {
            if (!this.player) return;
            const prevX = this.player.x;
            const prevY = this.player.y;
            const prevAim = this.player.aimAngle;
            ctx.save();
            try {
                ctx.translate(sx, sy);
                ctx.scale(scale, scale);
                this.player.x = 0;
                this.player.y = 0;
                this.player.aimAngle = aimAngle;
                this.player.draw(ctx);
            } catch (e) {
            } finally {
                this.player.x = prevX;
                this.player.y = prevY;
                this.player.aimAngle = prevAim;
                ctx.restore();
            }
        };

        ctx.save();
        try {
            if (this.level === 1) {
                // =========================================================================
                // ESCENA DE VIDEO NIVEL 1: "EL PEPE MAESTRO" (TORRE NOCTURNA + SALTO ÉPICO)
                // =========================================================================
                const groundY = Math.round(H * 0.76);
                const towerX = Math.round(W * 0.22);
                const towerW = Math.round(Math.min(165, W * 0.17));
                const towerTopY = Math.round(H * 0.29);
                const landX = Math.round(W * 0.49);
                const landY = groundY - 22;
                const playerX = Math.round(W * 0.75);
                const playerY = groundY - 18;

                // 1. Cielo nocturno dramático de tormenta
                const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
                skyGrad.addColorStop(0, '#050811');
                skyGrad.addColorStop(0.55, '#0f172a');
                skyGrad.addColorStop(1, '#1e1b4b');
                ctx.fillStyle = skyGrad;
                ctx.fillRect(0, 0, W, H);

                // Destello de relámpago al aterrizar (2.3s - 2.55s)
                if (t >= 2.3 && t < 2.58) {
                    const flashA = MathUtils.clamp(1 - (t - 2.3) / 0.28, 0, 1) * 0.38;
                    ctx.fillStyle = `rgba(254, 240, 138, ${flashA})`;
                    ctx.fillRect(0, 0, W, H);
                }

                // Luna llena con halo místico
                const moonX = W * 0.80;
                const moonY = H * 0.24;
                const moonGlow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 110);
                moonGlow.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
                moonGlow.addColorStop(0.5, 'rgba(251, 191, 36, 0.14)');
                moonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = moonGlow;
                ctx.beginPath();
                ctx.arc(moonX, moonY, 110, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fef08a';
                ctx.beginPath();
                ctx.arc(moonX, moonY, 34, 0, Math.PI * 2);
                ctx.fill();

                // Nubes oscuras en movimiento
                ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
                for (let i = 0; i < 5; i++) {
                    const cx = ((i * 230 + t * (28 + i * 6)) % (W + 260)) - 130;
                    const cy = H * (0.18 + (i % 3) * 0.08);
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, 85, 22, 0, 0, Math.PI * 2);
                    ctx.ellipse(cx + 42, cy + 6, 64, 18, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 2. Suelo de piedra de la fortaleza
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(0, groundY, W, H - groundY);
                ctx.strokeStyle = '#090d16';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, groundY);
                ctx.lineTo(W, groundY);
                ctx.stroke();

                // Bloques del pavimento
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2;
                for (let gx = 0; gx < W; gx += 56) {
                    ctx.beginPath();
                    ctx.moveTo(gx, groundY);
                    ctx.lineTo(gx - 18, H);
                    ctx.stroke();
                }

                // 3. Imponente Torre de piedra alta con almenas a la izquierda
                const tLeft = towerX - towerW * 0.5;
                const tH = groundY - towerTopY;
                ctx.fillStyle = '#1e293b';
                ctx.strokeStyle = '#090d16';
                ctx.lineWidth = 3.5;
                ctx.fillRect(tLeft, towerTopY, towerW, tH);
                ctx.strokeRect(tLeft, towerTopY, towerW, tH);

                // Sillería horizontal y vertical de la torre
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 1.8;
                for (let ry = towerTopY + 24; ry < groundY; ry += 24) {
                    ctx.beginPath();
                    ctx.moveTo(tLeft, ry);
                    ctx.lineTo(tLeft + towerW, ry);
                    ctx.stroke();
                    const shift = ((Math.round((ry - towerTopY) / 24)) % 2) * 22;
                    for (let rx = tLeft + 26 + shift; rx < tLeft + towerW - 10; rx += 44) {
                        ctx.beginPath();
                        ctx.moveTo(rx, ry - 24);
                        ctx.lineTo(rx, ry);
                        ctx.stroke();
                    }
                }

                // Ventana arqueada oscura y antorchas en la torre
                ctx.fillStyle = '#06080e';
                ctx.beginPath();
                ctx.arc(towerX, towerTopY + tH * 0.42, 18, Math.PI, 0);
                ctx.lineTo(towerX + 18, towerTopY + tH * 0.42 + 34);
                ctx.lineTo(towerX - 18, towerTopY + tH * 0.42 + 34);
                ctx.closePath();
                ctx.fill();

                for (const txOff of [-towerW * 0.32, towerW * 0.32]) {
                    const fx = towerX + txOff;
                    const fy = towerTopY + 55;
                    ctx.fillStyle = '#ea580c';
                    ctx.beginPath();
                    ctx.arc(fx, fy, 7 + Math.sin(t * 20) * 1.8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#fde047';
                    ctx.beginPath();
                    ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Cornisa superior y 5 almenas (battlements)
                const battW = towerW + 24;
                const battLeft = towerX - battW * 0.5;
                ctx.fillStyle = '#334155';
                ctx.strokeStyle = '#090d16';
                ctx.lineWidth = 3;
                ctx.fillRect(battLeft, towerTopY - 12, battW, 16);
                ctx.strokeRect(battLeft, towerTopY - 12, battW, 16);

                const merlonCount = 5;
                const merlonW = Math.round(battW / (merlonCount * 1.45));
                const merlonStep = (battW - merlonW) / (merlonCount - 1);
                for (let m = 0; m < merlonCount; m++) {
                    const mx = battLeft + m * merlonStep;
                    ctx.fillRect(mx, towerTopY - 30, merlonW, 18);
                    ctx.strokeRect(mx, towerTopY - 30, merlonW, 18);
                }

                // 4. Jugador (player.png) esperando en la parte inferior derecha mirando hacia la torre / jefe
                const lookTargetX = t < 1.1 ? towerX : landX;
                const lookTargetY = t < 1.1 ? (towerTopY - 40) : landY;
                const playerAim = Math.atan2(lookTargetY - playerY, lookTargetX - playerX);
                drawPlayerActorAt(playerX, playerY, 1.35, playerAim);

                // 5. Secuencia de El Pepe Maestro (3 fases en 3.5s)
                const startBx = towerX + 8;
                const startBy = towerTopY - 44;

                if (t < 1.1) {
                    // Fase 1 (0.0s - 1.1s): Asomándose amenazante en lo alto de la torre
                    const spot = ctx.createRadialGradient(startBx, startBy, 10, startBx, startBy, 115);
                    spot.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
                    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = spot;
                    ctx.beginPath();
                    ctx.arc(startBx, startBy, 115, 0, Math.PI * 2);
                    ctx.fill();

                    const peerBob = Math.sin(t * 8) * 3;
                    drawBossActorAt(startBx, startBy + peerBob, 1.18, playerX, playerY);
                } else if (t < 2.3) {
                    // Fase 2 (1.1s - 2.3s): Salto parabólico épico desde la torre hacia el suelo frente al jugador
                    const prog = MathUtils.clamp((t - 1.1) / 1.2, 0, 1);
                    const arcHeight = Math.sin(prog * Math.PI) * (H * 0.27);
                    const curBx = MathUtils.lerp(startBx, landX, prog);
                    const curBy = MathUtils.lerp(startBy, landY, prog) - arcHeight;
                    const curScale = MathUtils.lerp(1.18, 1.42, prog);

                    // Sombra creciente en el punto de aterrizaje
                    const shR = MathUtils.lerp(18, 62, prog);
                    ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + prog * 0.45})`;
                    ctx.beginPath();
                    ctx.ellipse(landX, groundY + 4, shR, shR * 0.38, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Estelas de velocidad en el arco parabólico
                    for (let s = 1; s <= 4; s++) {
                        const tp = Math.max(0, prog - s * 0.065);
                        const tx = MathUtils.lerp(startBx, landX, tp);
                        const ty = MathUtils.lerp(startBy, landY, tp) - Math.sin(tp * Math.PI) * (H * 0.27);
                        ctx.fillStyle = s % 2 === 0 ? `rgba(251, 191, 36, ${0.32 - s * 0.06})` : `rgba(239, 68, 68, ${0.32 - s * 0.06})`;
                        ctx.beginPath();
                        ctx.arc(tx, ty, 38 - s * 5, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    drawBossActorAt(curBx, curBy, curScale, playerX, playerY);
                } else {
                    // Fase 3 (2.3s - 3.5s): Aterrizaje sísmico frente al jugador, grietas, rocas y título
                    const impactElapsed = t - 2.3;
                    ctx.strokeStyle = '#090d16';
                    ctx.lineWidth = 3.5;
                    for (let i = 0; i < 7; i++) {
                        const ang = -Math.PI + (i / 6) * Math.PI;
                        ctx.beginPath();
                        ctx.moveTo(landX, groundY + 2);
                        ctx.lineTo(landX + Math.cos(ang) * 95, groundY + 6 + Math.abs(Math.sin(ang)) * 28);
                        ctx.stroke();
                    }

                    // Onda expansiva de polvo/energía en el suelo
                    if (impactElapsed < 0.75) {
                        const waveP = impactElapsed / 0.75;
                        ctx.strokeStyle = `rgba(251, 191, 36, ${1 - waveP})`;
                        ctx.lineWidth = 5 * (1 - waveP) + 1;
                        ctx.beginPath();
                        ctx.ellipse(landX, groundY + 4, 30 + waveP * 170, 12 + waveP * 42, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }

                    // Rocas/escombros levantados al caer
                    if (this.bossIntroRocks && this.bossIntroRocks.length > 0) {
                        for (const rk of this.bossIntroRocks) {
                            ctx.save();
                            ctx.translate(landX + rk.x, groundY + rk.y);
                            ctx.rotate(rk.rot);
                            ctx.fillStyle = rk.col;
                            ctx.strokeStyle = '#090d16';
                            ctx.lineWidth = 1.5;
                            ctx.fillRect(-rk.r, -rk.r * 0.7, rk.r * 2, rk.r * 1.4);
                            ctx.strokeRect(-rk.r, -rk.r * 0.7, rk.r * 2, rk.r * 1.4);
                            ctx.restore();
                        }
                    }

                    drawBossActorAt(landX, landY, 1.42, playerX, playerY);
                }
            } else {
                // =========================================================================
                // ESCENA DE VIDEO NIVEL 2: "RISÍN PEPÍN" (SALÓN OSCURO + PUERTA MISTERIOSA)
                // =========================================================================
                const floorY = Math.round(H * 0.75);
                const doorCx = Math.round(W * 0.50);
                const doorCy = Math.round(H * 0.50);
                const doorW = 148;
                const doorH = 210;
                const playerX = Math.round(W * 0.74);
                const playerY = floorY - 14;
                const burst = t >= 2.4;

                // 1. Salón oscuro en perspectiva frontal
                const wallGrad = ctx.createLinearGradient(0, 0, 0, floorY);
                wallGrad.addColorStop(0, '#04050a');
                wallGrad.addColorStop(0.6, '#110c1d');
                wallGrad.addColorStop(1, '#1e132a');
                ctx.fillStyle = wallGrad;
                ctx.fillRect(0, 0, W, H);

                // Columnas laterales del salón
                ctx.fillStyle = '#0f172a';
                ctx.strokeStyle = '#05070c';
                ctx.lineWidth = 3;
                for (const colX of [W * 0.14, W * 0.86]) {
                    ctx.fillRect(colX - 28, barH, 56, floorY - barH);
                    ctx.strokeRect(colX - 28, barH, 56, floorY - barH);
                    // Antorchas del salón
                    const ty = H * 0.38;
                    ctx.fillStyle = '#ff0055';
                    ctx.beginPath();
                    ctx.arc(colX, ty, 8 + Math.sin(t * 22) * 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#00f5d4';
                    ctx.beginPath();
                    ctx.arc(colX, ty, 3.8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                }

                // Suelo del salón en perspectiva
                ctx.fillStyle = '#141824';
                ctx.fillRect(0, floorY, W, H - floorY);
                ctx.strokeStyle = '#07090f';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, floorY);
                ctx.lineTo(W, floorY);
                ctx.stroke();

                // 2. Gran Puerta antigua de madera y hierro en el centro
                ctx.save();
                ctx.translate(doorCx, doorCy);

                // Marco monumental de piedra
                ctx.fillStyle = '#1e293b';
                ctx.strokeStyle = '#090d16';
                ctx.lineWidth = 4;
                ctx.fillRect(-doorW * 0.5 - 22, -doorH * 0.5 - 22, doorW + 44, doorH + 26);
                ctx.strokeRect(-doorW * 0.5 - 22, -doorH * 0.5 - 22, doorW + 44, doorH + 26);

                // Hueco abisal interior de la puerta
                ctx.fillStyle = '#040409';
                ctx.fillRect(-doorW * 0.5, -doorH * 0.5, doorW, doorH);

                if (!burst) {
                    // Sacudida y abombamiento de la puerta (1.2s a 2.4s: 3 golpes brutales)
                    const shakeAmp = t >= 1.2 ? 6.5 : 1.5;
                    const shakeX = Math.sin(t * 62) * shakeAmp;
                    const shakeY = t >= 1.2 ? Math.cos(t * 54) * 3.0 : 0;
                    ctx.save();
                    ctx.translate(shakeX, shakeY);
                    ctx.scale(this.bossIntroDoorScaleX || 1, this.bossIntroDoorScaleY || 1);

                    // Hojas de madera antigua oscura
                    ctx.fillStyle = '#451a03';
                    ctx.strokeStyle = '#1c0a00';
                    ctx.lineWidth = 3.5;
                    ctx.fillRect(-doorW * 0.5, -doorH * 0.5, doorW, doorH);
                    ctx.strokeRect(-doorW * 0.5, -doorH * 0.5, doorW, doorH);

                    // Tablones verticales
                    ctx.strokeStyle = '#271206';
                    ctx.lineWidth = 2.5;
                    for (const px of [-doorW * 0.25, 0, doorW * 0.25]) {
                        ctx.beginPath();
                        ctx.moveTo(px, -doorH * 0.5);
                        ctx.lineTo(px, doorH * 0.5);
                        ctx.stroke();
                    }

                    // Bandas y remaches de hierro pesado
                    ctx.fillStyle = '#334155';
                    ctx.fillRect(-doorW * 0.5, -doorH * 0.32, doorW, 14);
                    ctx.fillRect(-doorW * 0.5, doorH * 0.16, doorW, 14);
                    ctx.fillStyle = '#fbbf24';
                    ctx.beginPath();
                    ctx.arc(-14, 0, 6, 0, Math.PI * 2);
                    ctx.arc(14, 0, 6, 0, Math.PI * 2);
                    ctx.fill();

                    // Grietas luminosas y ondas de choque en los 3 golpes (1.2s a 2.4s)
                    if (t >= 1.2) {
                        ctx.strokeStyle = '#ff0055';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(-24, -55); ctx.lineTo(6, -15); ctx.lineTo(-12, 32);
                        if (t >= 1.65) {
                            ctx.moveTo(28, -62); ctx.lineTo(-8, -10); ctx.lineTo(22, 48);
                        }
                        if (t >= 2.05) {
                            ctx.moveTo(-48, -18); ctx.lineTo(46, 12);
                        }
                        ctx.stroke();
                    }
                    ctx.restore();

                    // Textos vibrantes "JAJAJA", "HIHIHI" flotando detrás/alrededor de la puerta
                    const laughs = [
                        { txt: 'JAJAJA', x: -doorW * 0.72, y: -doorH * 0.38, col: '#ff0055', sz: 20 },
                        { txt: 'HIHIHI', x: doorW * 0.74, y: -doorH * 0.32, col: '#00f5d4', sz: 19 },
                        { txt: 'JIJIJI', x: 0, y: -doorH * 0.62, col: '#fbbf24', sz: 21 },
                        { txt: 'JAJAJA!', x: -doorW * 0.68, y: doorH * 0.10, col: '#a855f7', sz: 18 }
                    ];
                    ctx.textAlign = 'center';
                    for (let i = 0; i < laughs.length; i++) {
                        const lb = laughs[i];
                        const ox = lb.x + Math.sin(t * 36 + i * 1.9) * 6;
                        const oy = lb.y + Math.cos(t * 30 + i * 1.4) * 5;
                        ctx.font = `900 ${lb.sz}px "Courier New", monospace`;
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 4;
                        ctx.strokeText(lb.txt, ox, oy);
                        ctx.fillStyle = lb.col;
                        ctx.fillText(lb.txt, ox, oy);
                    }
                } else {
                    // 2.4s a 3.5s: La puerta vuela en pedazos y emana aura carmesí/eléctrica
                    const portalGlow = ctx.createRadialGradient(0, 0, 12, 0, 0, doorW * 0.95);
                    portalGlow.addColorStop(0, 'rgba(255, 0, 85, 0.55)');
                    portalGlow.addColorStop(0.55, 'rgba(0, 245, 212, 0.22)');
                    portalGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = portalGlow;
                    ctx.beginPath();
                    ctx.arc(0, 0, doorW * 0.95, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                // Risín Pepín (risinpepin.png) emergiendo frente a la cámara al romperse la puerta (2.4s a 3.5s)
                if (burst) {
                    const emergeP = MathUtils.clamp((t - 2.4) / 0.35, 0, 1);
                    const bossScale = MathUtils.lerp(0.95, 1.42, emergeP);
                    const bossY = MathUtils.lerp(doorCy + 10, floorY - 26, emergeP);
                    drawBossActorAt(doorCx, bossY, bossScale, playerX, playerY);
                }

                // Pedazos de madera y hierro volando por la escena
                if (burst && this.bossIntroDebris && this.bossIntroDebris.length > 0) {
                    for (const d of this.bossIntroDebris) {
                        ctx.save();
                        ctx.translate(doorCx + d.x, doorCy + d.y);
                        ctx.rotate(d.rot);
                        ctx.fillStyle = d.color;
                        ctx.strokeStyle = '#090d16';
                        ctx.lineWidth = 2;
                        ctx.fillRect(-d.w * 0.5, -d.h * 0.5, d.w, d.h);
                        ctx.strokeRect(-d.w * 0.5, -d.h * 0.5, d.w, d.h);
                        ctx.restore();
                    }
                }

                // Jugador (player.png) expectante frente a la puerta
                const pAim = Math.atan2((floorY - 30) - playerY, doorCx - playerX);
                drawPlayerActorAt(playerX, playerY, 1.35, pAim);
            }

            // Franjas de cine negras arriba y abajo (Letterbox)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, W, barH);
            ctx.fillRect(0, H - barH, W, barH);

            const isL2 = this.level === 2;
            ctx.strokeStyle = isL2 ? '#ff0055' : '#fbbf24';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, barH);
            ctx.lineTo(W, barH);
            ctx.moveTo(0, H - barH);
            ctx.lineTo(W, H - barH);
            ctx.stroke();

            // Indicador superior de escena de video
            ctx.fillStyle = '#94a3b8';
            ctx.font = '900 12px "Courier New", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('▶ ESCENA CINEMÁTICA', 18, Math.round(barH * 0.62));

            // Título gigante del Jefe en la fase final (2.3s+ en Nivel 1, 2.4s+ en Nivel 2)
            const showBannerAt = isL2 ? 2.4 : 2.3;
            if (t >= showBannerAt) {
                const fadeIn = MathUtils.clamp((t - showBannerAt) / 0.22, 0, 1);
                const fadeOut = MathUtils.clamp((this.bossIntroTimer || 0) / 0.2, 0, 1);
                const alpha = Math.max(0.15, Math.min(fadeIn, fadeOut));
                const accent = isL2 ? '#ff0055' : '#ef4444';
                const titleColor = isL2 ? '#00f5d4' : '#fbbf24';
                const bossTitle = isL2 ? 'RISIN PEPIN' : 'EL PEPE MAESTRO';
                const bannerY = Math.round(barH + 18);
                const bannerH = 96;

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
                ctx.fillRect(0, bannerY, W, bannerH);

                ctx.strokeStyle = accent;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, bannerY);
                ctx.lineTo(W, bannerY);
                ctx.moveTo(0, bannerY + bannerH);
                ctx.lineTo(W, bannerY + bannerH);
                ctx.stroke();

                ctx.textAlign = 'center';
                ctx.fillStyle = accent;
                ctx.font = '900 16px "Courier New", monospace';
                ctx.fillText(
                    isL2 ? '¡EL SEÑOR DE LA RISA HA IRRUMPIDO!' : '¡EL SEÑOR DE LA MAZMORRA HA DESCENDIDO!',
                    W * 0.5,
                    bannerY + 32
                );

                ctx.fillStyle = titleColor;
                ctx.font = '900 36px "Courier New", monospace';
                ctx.shadowBlur = 18;
                ctx.shadowColor = accent;
                ctx.fillText(bossTitle, W * 0.5, bannerY + 74);
                ctx.restore();
            }
        } catch (cutsceneErr) {
            console.error('Error recuperado en drawBossIntroCutscene:', cutsceneErr);
        } finally {
            ctx.restore();
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.save();

        const inMenuOrPaused = this.state === 'MENU' || this.isPaused || this.isAdminOpen || (this.isAnyMenuOpen && this.isAnyMenuOpen());
        if (inMenuOrPaused || this.lowSpecMode) {
            ctx.shadowBlur = 0;
        }

        // Soporte de Alta Densidad de Píxeles (Retina / HD)
        if (this.dpr && this.dpr !== 1) {
            ctx.scale(this.dpr, this.dpr);
        }

        // Limpiar el fondo completo de la pantalla lógica
        ctx.fillStyle = '#06070a';
        ctx.fillRect(0, 0, this.width, this.height);

        // Aplicar Screen Shake de cámara (estrictamente omitido durante pausa para evitar vibración)
        if (!this.isPaused && this.shakeTimer > 0 && this.shakeIntensity > 0) {
            const dx = MathUtils.randRange(-this.shakeIntensity, this.shakeIntensity);
            const dy = MathUtils.randRange(-this.shakeIntensity, this.shakeIntensity);
            ctx.translate(dx, dy);
        }

        // Si estamos en BOSS_INTRO, renderizar la Escena Cinemática Tipo Video a pantalla completa
        if (this.state === 'BOSS_INTRO') {
            this.drawBossIntroCutscene(ctx);
        } else {
            // 1. Nivel y Iluminación de Antorchas (espacio de mundo con cámara dinámica y zoom dinámico en móviles)
            ctx.save();
            const zoom = this.cameraZoom || 1.0;
            ctx.scale(zoom, zoom);
            ctx.translate(-this.camera.x, -this.camera.y);
            this.drawArenaDungeon(ctx);

            if (this.state !== 'MENU') {
                // 1.5. Charcos Debilitadores en el suelo (Risín Pepín) y Bombas Grito
                for (const puddle of this.puddles) puddle.draw(ctx);
                for (const bomb of this.bombs) bomb.draw(ctx);

                // 2. Orbes de Botín
                for (const item of this.pickups) item.draw(ctx);

                // 3. Pilares de cobertura/destructibles
                for (const pillar of this.pillars) pillar.draw(ctx);

                // 3.5. Sala de Preparación Pre-Jefe (Tienda de Pociones y Muñeco Azul Bailarín)
                if (this.preBossPrepare && !this.boss) {
                    this.drawPreBossRoom(ctx);
                }

                // 3.6. Puerta Mística de Power-Ups tras vencer a El Pepe (Nivel 1)
                if (this.postPepePowerupGate) {
                    this.drawPowerupGate(ctx);
                }

                // 4. Enemigos
                for (const enemy of this.enemies) enemy.draw(ctx, this.player);

                // 5. Jefe Final ("El Pepe Maestro" o "Risín Pepín")
                if (this.boss && !this.boss.dead) {
                    this.boss.draw(ctx, this.player);
                }

                // 6. Jugador y Espada
                if (this.player && !this.player.dead) {
                    this.player.draw(ctx);
                }

                // 7. Proyectiles
                for (const proj of this.projectiles) proj.draw(ctx);

                // 7.5. Interludio entre rondas 1 a 4 (Silueta bailando Fortnite con cuenta regresiva de 10s)
                if (this.waveIntermission && !this.preBossPrepare && this.waveCooldown > 0) {
                    this.drawFortniteInterlude(ctx);
                }
            }

            // 8. Sistema de Partículas y Números de Daño Flotantes
            for (const p of this.particles) p.draw(ctx);
            for (const ft of this.floatingTexts) ft.draw(ctx);

            ctx.restore(); // fin del espacio de mundo
        }

        // 9.5. Botones del HUD (Pausa + Pantalla Completa)
        if (this.state === 'PLAYING' || this.state === 'BOSS_INTRO' || this.isPaused) {
            this.drawHUDButtons(ctx);
        }

        // 9.6. Controles Táctiles Virtuales en Móviles (Joystick + Botones de Acción)
        if (this.isTouchDevice && (this.state === 'PLAYING' || this.state === 'BOSS_INTRO') && !this.isPaused) {
            this.drawTouchControls(ctx);
        }

        // 10. Superposición de Pausa (Manejada interactivamente vía HTML por #pause-screen)
        if (this.isPaused) {
            // Fondo tenue de respaldo en el canvas durante pausa
            ctx.save();
            ctx.fillStyle = 'rgba(6, 8, 14, 0.5)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.restore();
        }

        ctx.restore();
    }

    drawHUDButtons(ctx) {
        ctx.save();
        const isMobile = this.isMobileView;

        // Marco redondeado con brillo compartido por los botones del HUD
        const frame = (b, color) => {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.strokeStyle = color;
            ctx.lineWidth = isMobile ? 2 : 2.5;
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 6);
            else ctx.rect(b.x, b.y, b.w, b.h);
            ctx.fill();
            ctx.stroke();
        };

        // 1. Botón de Pausa en el HUD (Esquina Superior Derecha)
        const pb = this.touchControls.buttons.pause;
        ctx.save();
        frame(pb, this.isPaused ? '#ef4444' : '#00f5d4');
        ctx.fillStyle = this.isPaused ? '#ef4444' : '#00f5d4';
        ctx.shadowBlur = 0;
        const pBarW = Math.max(3, Math.round(pb.w * 0.12));
        const pBarH = Math.round(pb.h * 0.52);
        const pBarY = pb.y + Math.round((pb.h - pBarH) * 0.5);
        ctx.fillRect(pb.x + Math.round(pb.w * 0.28), pBarY, pBarW, pBarH);
        ctx.fillRect(pb.x + Math.round(pb.w * 0.60), pBarY, pBarW, pBarH);
        ctx.restore();

        // 2. Botón de Pantalla Completa (HUD junto a Pausa)
        const fsb = this.touchControls.buttons.fullscreen;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        ctx.save();
        frame(fsb, isFs ? '#fbbf24' : '#00f5d4');
        ctx.shadowBlur = 0;
        const fcx = fsb.x + fsb.w * 0.5;
        const fcy = fsb.y + fsb.h * 0.5;
        const s = Math.round(fsb.w * 0.22);
        const cOff = Math.round(s * 0.55);
        ctx.beginPath();
        if (!isFs) {
            // Cuatro esquinas expandiéndose: [  ]
            ctx.moveTo(fcx - s, fcy - s + cOff); ctx.lineTo(fcx - s, fcy - s); ctx.lineTo(fcx - s + cOff, fcy - s);
            ctx.moveTo(fcx + s - cOff, fcy - s); ctx.lineTo(fcx + s, fcy - s); ctx.lineTo(fcx + s, fcy - s + cOff);
            ctx.moveTo(fcx - s, fcy + s - cOff); ctx.lineTo(fcx - s, fcy + s); ctx.lineTo(fcx - s + cOff, fcy + s);
            ctx.moveTo(fcx + s - cOff, fcy + s); ctx.lineTo(fcx + s, fcy + s); ctx.lineTo(fcx + s, fcy + s - cOff);
        } else {
            // Cuatro esquinas contrayéndose hacia adentro
            ctx.moveTo(fcx - s + cOff, fcy - s); ctx.lineTo(fcx - s + cOff, fcy - s + cOff); ctx.lineTo(fcx - s, fcy - s + cOff);
            ctx.moveTo(fcx + s - cOff, fcy - s); ctx.lineTo(fcx + s, fcy - s + cOff); ctx.lineTo(fcx + s, fcy - s + cOff);
            ctx.moveTo(fcx - s + cOff, fcy + s); ctx.lineTo(fcx - s + cOff, fcy + s - cOff); ctx.lineTo(fcx - s, fcy + s - cOff);
            ctx.moveTo(fcx + s - cOff, fcy + s); ctx.lineTo(fcx + s, fcy + s - cOff); ctx.lineTo(fcx + s, fcy + s - cOff);
        }
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    drawTouchControls(ctx) {
        ctx.save();
        const isMobile = this.isMobileView;

        // 1. Joystick Virtual de Movimiento (Mitad Izquierda)
        const js = this.touchControls.joystick;
        const bx = js.baseX;
        const by = js.baseY;

        // Base circular semitransparente (radio: 45px en móvil, 60px en desktop)
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, js.radius, 0, Math.PI * 2);
        ctx.fillStyle = js.active ? 'rgba(15, 23, 42, 0.65)' : 'rgba(15, 23, 42, 0.40)';
        ctx.fill();
        ctx.lineWidth = isMobile ? 2 : 2.5;
        ctx.strokeStyle = js.active ? '#00f5d4' : 'rgba(0, 245, 212, 0.35)';
        if (js.active) {
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#00f5d4';
        }
        ctx.stroke();

        // Guías de dirección dentro de la base
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 1.5;
        const gLen = Math.round(js.radius * 0.58);
        ctx.moveTo(bx - gLen, by); ctx.lineTo(bx + gLen, by);
        ctx.moveTo(bx, by - gLen); ctx.lineTo(bx, by + gLen);
        ctx.stroke();

        // Stick interno (radio: 20px en móvil, 25px en desktop) que sigue el dedo hasta el borde
        const sx = js.active ? js.stickX : bx;
        const sy = js.active ? js.stickY : by;
        ctx.beginPath();
        ctx.arc(sx, sy, js.stickRadius, 0, Math.PI * 2);
        ctx.fillStyle = js.active ? 'rgba(0, 245, 212, 0.85)' : 'rgba(0, 245, 212, 0.30)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();

        // 2. Botón de Cambio de Arma (radio: 22px en móvil, 30px en desktop)
        const wb = this.touchControls.buttons.weapon;
        ctx.save();
        ctx.beginPath();
        ctx.arc(wb.x, wb.y, wb.r, 0, Math.PI * 2);
        ctx.fillStyle = wb.down ? 'rgba(251, 191, 36, 0.55)' : 'rgba(15, 23, 42, 0.78)';
        ctx.fill();
        ctx.lineWidth = isMobile ? 2 : 2.5;
        ctx.strokeStyle = '#fbbf24';
        ctx.shadowBlur = wb.down ? 16 : 8;
        ctx.shadowColor = '#fbbf24';
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let wepIcon = '⚔';
        if (this.player) {
            if (this.player.currentWeapon === 'GUN') wepIcon = '🔫';
            else if (this.player.currentWeapon === 'RIFLE') wepIcon = '⚡';
        }
        ctx.font = isMobile ? '16px sans-serif' : '22px sans-serif';
        ctx.fillText(wepIcon, wb.x, wb.y - (isMobile ? 1 : 2));
        ctx.font = isMobile ? 'bold 7.5px "Courier New", monospace' : 'bold 9px "Courier New", monospace';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('ARMA', wb.x, wb.y + (isMobile ? 12 : 17));
        ctx.restore();

        // 3. Botón de Dash (radio: 25px en móvil, 32px en desktop) con enfriamiento visual progresivo
        const db = this.touchControls.buttons.dash;
        ctx.save();
        const dashCd = this.player ? this.player.dashCooldown : 1.05;
        const dashCdTimer = this.player ? this.player.dashCooldownTimer : 0;
        const dashReady = dashCdTimer <= 0;
        const dashPct = dashReady ? 1 : Math.max(0, 1 - (dashCdTimer / dashCd));

        ctx.beginPath();
        ctx.arc(db.x, db.y, db.r, 0, Math.PI * 2);
        ctx.fillStyle = db.down ? 'rgba(0, 245, 212, 0.55)' : 'rgba(15, 23, 42, 0.78)';
        ctx.fill();
        ctx.lineWidth = isMobile ? 2 : 2.5;
        ctx.strokeStyle = dashReady ? '#00f5d4' : '#475569';
        if (dashReady) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#00f5d4';
        }
        ctx.stroke();

        // Relleno visual de Cooldown
        if (!dashReady) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(db.x, db.y);
            ctx.arc(db.x, db.y, db.r - 2, -Math.PI / 2 + dashPct * Math.PI * 2, -Math.PI / 2 + Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(db.x, db.y, db.r, -Math.PI / 2, -Math.PI / 2 + dashPct * Math.PI * 2);
            ctx.lineWidth = isMobile ? 2.5 : 3.5;
            ctx.strokeStyle = '#00f5d4';
            ctx.stroke();
            ctx.restore();
        }

        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = isMobile ? '17px sans-serif' : '24px sans-serif';
        ctx.fillText('⚡', db.x, db.y - (isMobile ? 1 : 2));
        ctx.font = isMobile ? 'bold 7.5px "Courier New", monospace' : 'bold 9px "Courier New", monospace';
        ctx.fillStyle = dashReady ? '#00f5d4' : '#94a3b8';
        ctx.fillText('DASH', db.x, db.y + (isMobile ? 13 : 18));
        ctx.restore();

        // 3.5. 3 Círculos Táctiles de Pociones justo al lado de DASH (Verde=Vida, Naranja=Furia, Azul=Velocidad)
        const potBtns = this.touchControls.buttons.potions;
        if (potBtns) {
            const pots = (this.player && this.player.potions) ? this.player.potions : { heal: 0, fury: 0, speed: 0 };
            for (const pType of ['heal', 'fury', 'speed']) {
                const pb = potBtns[pType];
                const count = pots[pType] || 0;
                ctx.save();
                ctx.globalAlpha = count > 0 ? 0.96 : 0.36;
                ctx.beginPath();
                ctx.arc(pb.x, pb.y, pb.r, 0, Math.PI * 2);
                ctx.fillStyle = pb.down ? 'rgba(255, 255, 255, 0.28)' : 'rgba(15, 23, 42, 0.85)';
                ctx.fill();
                ctx.lineWidth = isMobile ? 1.8 : 2.2;
                ctx.strokeStyle = count > 0 ? pb.color : '#475569';
                if (count > 0) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = pb.color;
                }
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Icono/Skin de la poción correspondiente (central.png, smirnoff.png, vive100.png)
                drawPotionFlask(ctx, pb.x, pb.y - (isMobile ? 2 : 3), isMobile ? 8.5 : 11.0, pb.color, pType);

                // Número de cargas disponibles (0 a 3)
                ctx.font = isMobile ? '900 8.5px "Courier New", monospace' : '900 10px "Courier New", monospace';
                ctx.fillStyle = count > 0 ? '#ffffff' : '#94a3b8';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${count}`, pb.x, pb.y + pb.r - (isMobile ? 4.5 : 5.5));
                ctx.restore();
            }
        }

        // 4. Botón Principal de Ataque / Fuego Continuo (radio: 35px en móvil, 45px en desktop)
        const ab = this.touchControls.buttons.attack;
        ctx.save();
        const atkHeld = this.touchControls.isAttackTouchHeld;
        let atkColor = '#ef4444';
        if (this.player) {
            if (this.player.currentWeapon === 'SWORD') atkColor = '#00f5d4';
            else if (this.player.currentWeapon === 'GUN') atkColor = '#38bdf8';
            else if (this.player.currentWeapon === 'RIFLE') atkColor = '#fbbf24';
        }

        ctx.beginPath();
        ctx.arc(ab.x, ab.y, ab.r, 0, Math.PI * 2);
        if (atkHeld) {
            if (this.player && this.player.currentWeapon === 'SWORD') ctx.fillStyle = 'rgba(0, 245, 212, 0.45)';
            else if (this.player && this.player.currentWeapon === 'GUN') ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
            else if (this.player && this.player.currentWeapon === 'RIFLE') ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
            else ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
        } else {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        }
        ctx.fill();
        ctx.lineWidth = isMobile ? 2.5 : 3.5;
        ctx.strokeStyle = atkColor;
        ctx.shadowBlur = atkHeld ? 22 : 10;
        ctx.shadowColor = atkColor;
        ctx.stroke();

        // Indicador de apuntado por arrastre (Twin-Stick) o Auto-Aim
        if (ab.down && ab.hasDragged) {
            const dragLen = Math.round(ab.r * 0.72);
            const px = ab.x + Math.cos(ab.aimAngle) * dragLen;
            const py = ab.y + Math.sin(ab.aimAngle) * dragLen;
            ctx.beginPath();
            ctx.moveTo(ab.x, ab.y);
            ctx.lineTo(px, py);
            ctx.lineWidth = isMobile ? 2.5 : 3.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(px, py, isMobile ? 4.5 : 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        } else {
            ctx.shadowBlur = 0;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = isMobile ? '20px sans-serif' : '28px sans-serif';
            ctx.fillText('🎯', ab.x, ab.y - (isMobile ? 3 : 4));
            ctx.font = isMobile ? '900 8px "Courier New", monospace' : '900 10px "Courier New", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('ATACAR', ab.x, ab.y + (isMobile ? 15 : 20));
        }
        ctx.restore();

        ctx.restore();
    }

    // Cámara suave centrada en el jugador con soporte de zoom dinámico en móviles
    updateCamera(dt, snap = false) {
        const p = this.player;
        let targetX = 0;
        let targetY = 0;

        const zoom = this.cameraZoom || 1.0;
        const viewW = this.width / zoom;
        const viewH = this.height / zoom;

        if (viewW >= this.worldW) {
            targetX = (this.worldW - viewW) * 0.5;
        } else if (p) {
            const maxX = this.worldW - viewW;
            targetX = MathUtils.clamp(p.x - viewW * 0.5, 0, maxX);
        }

        if (viewH >= this.worldH) {
            targetY = (this.worldH - viewH) * 0.5;
        } else if (p) {
            const maxY = this.worldH - viewH;
            targetY = MathUtils.clamp(p.y - viewH * 0.5, 0, maxY);
        }

        const k = snap ? 1 : 1 - Math.exp(-7 * (Number.isFinite(dt) ? dt : 0.016));
        if (!Number.isFinite(this.camera.x)) this.camera.x = 0;
        if (!Number.isFinite(this.camera.y)) this.camera.y = 0;
        if (!Number.isFinite(targetX)) targetX = 0;
        if (!Number.isFinite(targetY)) targetY = 0;
        this.camera.x += (targetX - this.camera.x) * k;
        this.camera.y += (targetY - this.camera.y) * k;
    }

    syncMouseWorld() {
        if (this.isAnyMenuOpen && this.isAnyMenuOpen()) return;
        const zoom = this.cameraZoom || 1.0;
        this.mouse.worldX = this.mouse.x / zoom + this.camera.x;
        this.mouse.worldY = this.mouse.y / zoom + this.camera.y;
    }

    loop(timestamp) {
        // Reprogramar SIEMPRE primero (una única vez por frame): el bucle nunca se detiene
        // ni se duplica, aunque update()/draw() lancen una excepción.
        requestAnimationFrame((t) => this.loop(t));

        // Cálculo estricto de deltaTime limitado a 0.05s para evitar saltos por pérdida de foco
        const rawDt = (timestamp - this.lastTime) / 1000;
        const dt = Math.min(0.05, Math.max(0.0001, rawDt));
        this.lastTime = timestamp;

        try {
            this.syncMouseWorld();
            if (!this.isPaused && !this.isAdminOpen) {
                this.update(dt);
                this.updateCamera(dt);
                this.syncMouseWorld();
            }
            this.draw();
        } catch (err) {
            console.error('Error en el bucle principal (recuperado):', err);
            if (this.ctx.reset) this.ctx.reset();
            else this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
