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
        this.pillars = [];
        this.pickups = [];
        this.particles = [];
        this.floatingTexts = [];
        this.torches = [];
        this.boss = null;

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

    quitToMainMenu() {
        this.closeShop();
        this.setPaused(false);
        this.runId++; // Invalida cualquier temporizador o callback pendiente
        this.state = 'MENU';
        this.player = null;
        this.enemies = [];
        this.projectiles = [];
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
            if (this.ui.shopScreen) this.ui.shopScreen.classList.add('hidden');
            if (this.ui.gameoverScreen) this.ui.gameoverScreen.classList.add('hidden');
            if (this.ui.victoryScreen) this.ui.victoryScreen.classList.add('hidden');
            if (this.ui.pauseScreen) this.ui.pauseScreen.classList.add('hidden');
            if (this.ui.menuScreen) {
                this.ui.menuScreen.classList.remove('hidden');
                this.showMenuView('main');
            }
        }
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
            soundManager.init();
            this.keys[e.code] = true;

            // Victoria: ESPACIO avanza al Nivel 2 (solo tras vencer al jefe del Nivel 1)
            if (e.code === 'Space' && this.state === 'VICTORY' && this.level === 1) {
                e.preventDefault();
                if (!e.repeat) this.goToLevel2();
                return;
            }

            // Reintentar
            if (e.code === 'KeyR' && !e.repeat && (this.state === 'GAMEOVER' || this.state === 'VICTORY')) {
                this.startNewRun();
            }

            // Pausa (Escape), cerrar tienda o volver al Menú Principal
            if (e.code === 'Escape') {
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

                if (this.isPaused || this.isShopOpen) {
                    return;
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

                if (this.isPaused || this.isShopOpen) {
                    continue;
                }

                if (this.state === 'PLAYING' || this.state === 'BOSS_INTRO') {
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
            shopScreen: $('shop-screen'), shopGoldVal: $('shop-gold-val'),
            shopCountHeal: $('shop-count-heal'), shopCountFury: $('shop-count-fury'), shopCountSpeed: $('shop-count-speed'),
            btnBuyHeal: $('btn-buy-heal'), btnBuyFury: $('btn-buy-fury'), btnBuySpeed: $('btn-buy-speed')
        };

        // Soporte Dual Táctil + Clic para Navegación en Pantallas Superpuestas
        const bindUIButton = (id, action) => {
            const el = $(id);
            if (!el) return;
            const handler = (e) => {
                soundManager.init();
                if (e.cancelable) e.preventDefault();
                el.blur(); // evita que ESPACIO/R reactiven el botón por accidente
                action();
            };
            el.addEventListener('click', handler);
            el.addEventListener('touchstart', handler, { passive: false });
        };

        const uiActions = {
            'btn-start': () => this.startNewRun(),
            'btn-retry': () => this.startNewRun(),
            'btn-play-again': () => this.startNewRun(),
            'btn-next-level': () => this.goToLevel2(),
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
            'pot-slot-heal': () => { if (!this.isPaused && this.player) this.player.usePotion('heal', this); },
            'pot-slot-fury': () => { if (!this.isPaused && this.player) this.player.usePotion('fury', this); },
            'pot-slot-speed': () => { if (!this.isPaused && this.player) this.player.usePotion('speed', this); }
        };
        for (const id in uiActions) bindUIButton(id, uiActions[id]);

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

        // Dimensiones del mundo: Nivel 1 = 1100x720, Nivel 2 = 2200x1500 (cámara dinámica)
        this.worldW = isL2 ? 2200 : 1100;
        this.worldH = isL2 ? 1500 : 720;
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
            // Múltiples Mob Spawners distribuidos por el mapa expandido
            this.spawners = [
                { x: ax + aw * 0.5, y: ay + ah * 0.5 },
                { x: ax + aw * 0.2, y: ay + ah * 0.27 },
                { x: ax + aw * 0.8, y: ay + ah * 0.27 },
                { x: ax + aw * 0.2, y: ay + ah * 0.73 },
                { x: ax + aw * 0.8, y: ay + ah * 0.73 }
            ];

            // Más pilares destructibles / de cobertura en rejilla, lejos de los spawners
            this.pillars = [];
            const cols = [0.1, 0.36, 0.64, 0.9];
            const rows = [0.12, 0.5, 0.88];
            const pillarSpots = [];
            for (const cx of cols) for (const cy of rows) pillarSpots.push([cx, cy]);
            pillarSpots.push([0.5, 0.22], [0.5, 0.78], [0.08, 0.32], [0.92, 0.32], [0.08, 0.68], [0.92, 0.68]);
            for (const [fx, fy] of pillarSpots) {
                const px = ax + aw * fx;
                const py = ay + ah * fy;
                if (this.spawners.some(s => MathUtils.dist(px, py, s.x, s.y) < 130)) continue;
                this.pillars.push(new Pillar(px, py, 32, true));
            }

            // Muchas más antorchas a lo largo de los muros perimetrales
            this.torches = [];
            for (let i = 0; i <= 8; i++) {
                const tx = ax + 24 + (aw - 48) * (i / 8);
                this.torches.push({ x: tx, y: ay + 20 });
                this.torches.push({ x: tx, y: ay + ah - 20 });
            }
            const stepsY = 5;
            for (let i = 1; i < stepsY; i++) {
                const ty = ay + ah * (i / stepsY);
                this.torches.push({ x: ax + 18, y: ty });
                this.torches.push({ x: ax + aw - 18, y: ty });
            }
            // Antorchas interiores junto a los spawners
            for (const s of this.spawners) {
                this.torches.push({ x: s.x - 52, y: s.y - 34 });
                this.torches.push({ x: s.x + 52, y: s.y - 34 });
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
        p.rifleCooldownTimer = 0;
        p.muzzleFlash = 0;
        p.rifleRecoil = 0;
        p.damageBoostTimer = 0;
        p.speedBoostTimer = 0;
        p.furyPotionTimer = 0;
        p.speedPotionTimer = 0;
        p.scaleX = p.scaleY = 1;
        p.afterimages = [];
        p.slashTrails = [];
        p.hitTargetsInSwing.clear();

        if (targetLevel === 2) this.applyLevel2Powerup();
        p.hp = p.maxHp;

        // Limpiar todos los contenedores activos
        this.enemies = [];
        this.projectiles = [];
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

    // Reinicio completo desde el Nivel 1 (botones y tecla R)
    startNewRun() {
        this.resetGame(1);
    }

    goToLevel2() {
        if (this.state !== 'VICTORY' || this.level !== 1) return;
        this.resetGame(2);
    }

    // Power-up permanente del jugador al iniciar el Nivel 2 + desbloqueo del Rifle de Asalto
    applyLevel2Powerup() {
        const p = this.player;
        if (!p.powered) {
            p.powered = true;
            p.maxHp = Math.round(p.maxHp * 1.5); // +50% vida máxima
            p.dmgMult = 1.35;                    // +35% daño base en todas las armas
            p.moveSpeedMult = 1.15;              // +15% velocidad de movimiento
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
            : 'EL PEPE MAESTRO (NIVEL 2) HA CAÍDO';
        this.ui.btnNextLevel.style.display = isL1 ? 'inline-block' : 'none';
    }

    spawnWave(waveNum) {
        const isL2 = this.level === 2;
        const hpWave = waveNum + (isL2 ? 2 : 0);
        const chaserCount = (isL2 ? 4 : 3) + waveNum * 2;
        const shooterCount = (isL2 ? 2 : 1) + waveNum;
        const tankCount = isL2 ? waveNum : 0;

        // Calibración de oro por ronda: entre 3 y 5 bolsas de oro garantizadas en promedio por oleada
        this.waveTotalEnemies = chaserCount + shooterCount + tankCount;
        this.waveGoldDropped = 0;
        this.waveGoldTarget = MathUtils.randInt(3, 5);

        const spawnPointAwayFromPlayer = () => {
            let sx, sy, tries = 0;
            if (isL2 && this.spawners.length > 0) {
                // En el mapa grande, las hordas emergen de los Mob Spawners
                do {
                    const sp = this.spawners[MathUtils.randInt(0, this.spawners.length - 1)];
                    sx = sp.x + MathUtils.randRange(-40, 40);
                    sy = sp.y + MathUtils.randRange(-40, 40);
                    tries++;
                } while (MathUtils.dist(sx, sy, this.player.x, this.player.y) < 300 && tries < 25);
                return { x: sx, y: sy };
            }
            do {
                sx = MathUtils.randRange(this.arena.x + 45, this.arena.x + this.arena.w - 45);
                sy = MathUtils.randRange(this.arena.y + 45, this.arena.y + this.arena.h - 45);
                tries++;
            } while (MathUtils.dist(sx, sy, this.player.x, this.player.y) < 230 && tries < 25);
            return { x: sx, y: sy };
        };

        for (let i = 0; i < chaserCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'CHASER', hpWave));
            this.spawnParticles(pt.x, pt.y, 10, '#f43f5e', 110, true);
        }

        for (let i = 0; i < shooterCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'SHOOTER', hpWave));
            this.spawnParticles(pt.x, pt.y, 10, '#a855f7', 110, true);
        }

        for (let i = 0; i < tankCount; i++) {
            const pt = spawnPointAwayFromPlayer();
            this.enemies.push(new Enemy(pt.x, pt.y, 'TANK', hpWave));
            this.spawnParticles(pt.x, pt.y, 16, '#f97316', 140, true);
        }

        this.floatingTexts.push(new FloatingText(this.camera.x + this.width * 0.5, this.camera.y + this.height * 0.3, `¡OLEADA ${waveNum}!`, '#00f5d4', 24, true));
    }

    onEnemyKilled(enemy) {
        this.enemiesKilledCount++;
        this.spawnParticles(enemy.x, enemy.y, 18, enemy.archetype === 'TANK' ? '#f97316' : (enemy.archetype === 'CHASER' ? '#f43f5e' : '#a855f7'), 190, true);

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

    triggerBossEntrance() {
        this.state = 'BOSS_INTRO';
        this.bossIntroTimer = 2.6;
        this.addScreenShake(12, 2.4);
        this.projectiles = [];

        // Instanciar a El Pepe Maestro en la parte superior central
        this.boss = new Boss(this.arena.x + this.arena.w * 0.5, this.arena.y + 130, this.level);
        this.spawnParticles(this.boss.x, this.boss.y, 50, '#fbbf24', 260, true);

        this.ui.bossHud.style.display = 'block';
        this.ui.waveCounter.textContent = 'JEFE FINAL';
        this.ui.waveCounter.style.color = '#ef4444';
    }

    onBossDefeated(boss) {
        this.addScreenShake(20, 0.8);
        this.spawnParticles(boss.x, boss.y, 90, '#fbbf24', 350, true);
        this.spawnParticles(boss.x, boss.y, 60, '#ef4444', 280, true);
        this.projectiles = [];

        const runId = this.runId;
        setTimeout(() => {
            if (runId !== this.runId || this.state === 'GAMEOVER') return; // ignorar si se reinició la partida
            this.state = 'VICTORY';
            this.configureVictoryScreen();
            this.ui.victoryStats.textContent = `Esbirros Abatidos: ${this.enemiesKilledCount} | Salud Restante: ${this.player.hp}/${this.player.maxHp}`;
            this.ui.victoryScreen.classList.remove('hidden');
        }, 900);
    }

    onPlayerDeath() {
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
            this.bossIntroTimer -= dt;
            this.player.update(dt, this);
            if (this.bossIntroTimer <= 0) {
                this.state = 'PLAYING';
            }
        } else if (this.state === 'PLAYING') {
            this.player.update(dt, this);

            // Actualizar Pilares
            for (const p of this.pillars) p.update(dt);

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
            if (this.enemies.length === 0 && !this.boss && this.state === 'PLAYING') {
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
                this.ui.btnSummonBoss.classList.toggle('hidden', !this.isNearDancer());
            }
        }

        const dashReadyPct = this.player.dashCooldownTimer <= 0
            ? 100
            : (1 - this.player.dashCooldownTimer / this.player.dashCooldown) * 100;
        this.ui.dashBar.style.width = `${dashReadyPct}%`;
        this.ui.dashText.textContent = this.player.dashCooldownTimer <= 0 ? 'LISTO' : 'RECARGANDO';

        if (!this.boss) {
            if (this.preBossPrepare) {
                this.ui.waveCounter.textContent = `PREPARACIÓN PRE-JEFE (5 / ${this.maxWaves})`;
                this.ui.waveCounter.style.color = '#ffd700';
            } else {
                this.ui.waveCounter.textContent = `OLEADA: ${this.currentWave} / ${this.maxWaves}`;
                this.ui.waveCounter.style.color = '#00f5d4';
            }
        }

        // Indicador de Arma en el HUD
        if (this.ui.weaponName) {
            if (this.player.currentWeapon === 'RIFLE') {
                this.ui.weaponName.textContent = '[3] RIFLE DE ASALTO';
                this.ui.weaponName.style.color = '#fbbf24';
            } else if (this.player.currentWeapon === 'GUN') {
                this.ui.weaponName.textContent = '[2] PISTOLA';
                this.ui.weaponName.style.color = '#38bdf8';
            } else {
                this.ui.weaponName.textContent = '[1] ESPADA';
                this.ui.weaponName.style.color = '#00f5d4';
            }
            if (this.ui.weaponHint) {
                const cw = this.player.currentWeapon;
                const slot = (n, label, owned, key) => {
                    const active = cw === key;
                    const color = !owned ? '#475569' : (active ? '#00f5d4' : '#94a3b8');
                    const border = active ? '1px solid #00f5d4' : '1px solid #334155';
                    return `<span style="display:inline-block;margin-right:4px;padding:1px 5px;border:${border};color:${color};opacity:${owned ? 1 : 0.5};text-shadow:2px 2px 4px rgba(0,0,0,0.95);background:rgba(15,23,42,0.45);border-radius:2px;">${n}:${label}${owned ? '' : ' 🔒'}</span>`;
                };
                this.ui.weaponHint.innerHTML =
                    slot(1, 'ESPADA', true, 'SWORD') +
                    slot(2, 'PISTOLA', this.player.hasGun, 'GUN') +
                    slot(3, 'RIFLE', this.player.hasRifle, 'RIFLE') + ' [Q]';
            }
        }

        // Indicador de mejoras activas (Orbes y Pociones)
        const buffs = [];
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
                this.ui.bossTitle.textContent = this.level === 2 ? 'EL PEPE MAESTRO (NIVEL 2) - ¡ENFURECIDO!' : 'EL PEPE MAESTRO - ¡ENFURECIDO!';
                this.ui.bossTitle.style.color = '#fbbf24';
            } else {
                this.ui.bossTitle.textContent = this.level === 2 ? 'EL PEPE MAESTRO (NIVEL 2) - SEÑOR SUPREMO' : 'EL PEPE MAESTRO - SEÑOR DE LA MAZMORRA';
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

            // Iluminación cálida radial dinámica en baldosas cercanas
            if (this.lowSpecMode) {
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

        // Los 3 frascos de poción expuestos sobre el mostrador + bolsita de oro
        drawPotionFlask(ctx, -28, -5, 8.5, '#4ade80');
        drawPotionFlask(ctx, -4, -5, 8.5, '#f97316');
        drawPotionFlask(ctx, 20, -5, 8.5, '#38bdf8');
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

    draw() {
        const ctx = this.ctx;
        ctx.save();

        if (this.lowSpecMode) {
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

        // 1. Nivel y Iluminación de Antorchas (espacio de mundo con cámara dinámica y zoom dinámico en móviles)
        ctx.save();
        const zoom = this.cameraZoom || 1.0;
        ctx.scale(zoom, zoom);
        ctx.translate(-this.camera.x, -this.camera.y);
        this.drawArenaDungeon(ctx);

        if (this.state !== 'MENU') {
            // 2. Orbes de Botín
            for (const item of this.pickups) item.draw(ctx);

            // 3. Pilares de cobertura/destructibles
            for (const pillar of this.pillars) pillar.draw(ctx);

            // 3.5. Sala de Preparación Pre-Jefe (Tienda de Pociones y Muñeco Azul Bailarín)
            if (this.preBossPrepare && !this.boss) {
                this.drawPreBossRoom(ctx);
            }

            // 4. Enemigos
            for (const enemy of this.enemies) enemy.draw(ctx, this.player);

            // 5. Jefe Final ("El Pepe Maestro")
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

        // 9. Aviso Cinemático durante BOSS_INTRO
        if (this.state === 'BOSS_INTRO') {
            ctx.save();
            const alpha = MathUtils.clamp(Math.sin((this.bossIntroTimer / 2.6) * Math.PI) * 1.4, 0, 1);
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.65})`;
            ctx.fillRect(0, this.height * 0.36, this.width, 130);

            ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, this.height * 0.36);
            ctx.lineTo(this.width, this.height * 0.36);
            ctx.moveTo(0, this.height * 0.36 + 130);
            ctx.lineTo(this.width, this.height * 0.36 + 130);
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
            ctx.font = '900 18px "Courier New", monospace';
            ctx.fillText('¡ADVERTENCIA: PRESENCIA ABISAL DETECTADA!', this.width * 0.5, this.height * 0.36 + 44);

            ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
            ctx.font = '900 36px "Courier New", monospace';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ef4444';
            ctx.fillText('EL PEPE MAESTRO', this.width * 0.5, this.height * 0.36 + 92);
            ctx.restore();
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

                // Icono del frasco de pócima del color correspondiente
                drawPotionFlask(ctx, pb.x, pb.y - (isMobile ? 2 : 3), isMobile ? 7.2 : 9.2, pb.color);

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

        const k = snap ? 1 : 1 - Math.exp(-7 * dt);
        this.camera.x += (targetX - this.camera.x) * k;
        this.camera.y += (targetY - this.camera.y) * k;
    }

    syncMouseWorld() {
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
            if (!this.isPaused) {
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
