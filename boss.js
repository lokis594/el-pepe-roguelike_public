/**
 * ============================================================================
 * CLASE JEFE FINAL: "EL PEPE MAESTRO" (NIVEL 1) & "RISÍN PEPÍN" (NIVEL 2)
 * ============================================================================
 */
class Boss extends Entity {
    constructor(x, y) {
        const isL2 = arguments[2] === 2;
        const pepeBaseHp = 950;
        const maxHp = isL2 ? Math.round(pepeBaseHp * 1.5) : pepeBaseHp; // Risín Pepín: 1.5x la vida de El Pepe
        super(x, y, 42 * (isL2 ? 1.28 : 1), maxHp);
        this.level = isL2 ? 2 : 1;
        this.isRisin = isL2;
        this.sizeScale = isL2 ? 1.28 : 1;
        this.enraged = false;

        // Nivel 1 (El Pepe): +5% velocidad y +5% daño. Nivel 2 (Risín Pepín): 1.5x poder base y velocidad ágil
        this.pepeSpeedBuff = 1.05;
        this.pepeDmgBuff = 1.05;
        this.baseSpeed = isL2 ? (135 * 1.05 * 1.22) : (135 * this.pepeSpeedBuff);
        this.dmgMult = isL2 ? (this.pepeDmgBuff * 1.5) : this.pepeDmgBuff;

        // Máquina de Estados Finitos (FSM)
        // Estados: 'IDLE' | 'CHARGE_TELEGRAPH' | 'CHARGE_DASH' | 'SPIRAL_CAST' | 'JUMP_ASCEND' | 'JUMP_AIR' | 'JUMP_SLAM'
        // Estados exclusivos de Risín Pepín: 'WORD_BARRAGE' | 'LAUGH_LASER_TELEGRAPH' | 'LAUGH_LASER_FIRE'
        this.state = 'IDLE';
        this.stateTimer = 1.3;
        this.attackIndex = 0;

        // Estado 1: Embestida Maestra
        this.chargeAngle = 0;
        this.chargeTargetX = x;
        this.chargeTargetY = y;

        // Estado 2: Espiral Arcana / Bombardeo de Palabras Dañinas
        this.spiralAngle = 0;
        this.spiralShotTimer = 0;
        this.wordList = ['JAJAJA', 'XD', 'JIJIJI', 'LMAO', 'AHAJAJA'];
        this.wordBurstCount = 0;

        // Estado Láser de Risa Descontrolada ("Risa Láser")
        this.laserAngle = 0;
        this.laserLength = 1050;
        this.laserDamageTick = 0;

        // Estado 3: Salto Sísmico
        this.jumpHeight = 0; // Elevación fuera de la pantalla
        this.shadowScale = 1;
        this.shockwaves = [];
    }

    isTargetable() {
        return this.state !== 'JUMP_AIR';
    }

    getSpeedMultiplier() {
        return (this.enraged ? 1.35 : 1.0) * (this.level === 1 ? this.pepeSpeedBuff : 1.12);
    }

    takeDamage(amount, sourceX, sourceY, kbForce, isCrit, game) {
        if (this.dead || !this.isTargetable()) return;
        this.hp = Math.max(0, this.hp - amount);
        this.hitFlash = 0.1;
        // El jefe tiene resistencia al knockback pero lo siente ligeramente
        this.applyKnockback(sourceX, sourceY, kbForce * 0.18);
        this.triggerSquash(1.16, 0.86);

        soundManager.playEnemyHit();

        const color = isCrit ? '#fbbf24' : '#fca5a5';
        game.floatingTexts.push(new FloatingText(this.x, this.y - this.radius, isCrit ? `${amount}!!` : `${amount}`, color, 17, isCrit));
        game.spawnParticles(this.x, this.y, 10, this.enraged ? '#fbbf24' : '#ef4444', 180, true);

        // Comprobar transición a Fase Enfurecida (< 50% HP)
        if (!this.enraged && this.hp <= this.maxHp * 0.5 && this.hp > 0) {
            this.enraged = true;
            game.addScreenShake(14, 0.55);
            game.spawnParticles(this.x, this.y, 45, '#fbbf24', 280, true);
            game.floatingTexts.push(new FloatingText(this.x, this.y - 60, '¡FASE ENFURECIDA!', '#fbbf24', 22, true));
        }

        if (this.hp <= 0) {
            this.dead = true;
            game.onBossDefeated(this);
        }
    }

    transitionToNextAttack(game) {
        const patterns = this.isRisin
            ? ['WORD_BARRAGE', 'LAUGH_LASER_TELEGRAPH', 'JUMP_ASCEND', 'CHARGE_TELEGRAPH']
            : ['CHARGE_TELEGRAPH', 'SPIRAL_CAST', 'JUMP_ASCEND'];
        const chosen = patterns[this.attackIndex % patterns.length];
        this.attackIndex++;

        const speedMult = this.getSpeedMultiplier();

        if (chosen === 'WORD_BARRAGE') {
            this.state = 'WORD_BARRAGE';
            this.stateTimer = this.enraged ? 3.2 : 2.8;
            this.spiralShotTimer = 0.1;
            this.wordBurstCount = 0;
            if (soundManager.playRisinLaugh) soundManager.playRisinLaugh();
        } else if (chosen === 'LAUGH_LASER_TELEGRAPH') {
            this.state = 'LAUGH_LASER_TELEGRAPH';
            this.stateTimer = 0.7; // Telegraph de 0.7s con textos "JAJAJAJA!" vibrando
            this.vx = 0;
            this.vy = 0;
            this.laserAngle = Math.atan2(game.player.y - this.y, game.player.x - this.x);
            if (soundManager.playRisinLaugh) soundManager.playRisinLaugh();
        } else if (chosen === 'CHARGE_TELEGRAPH') {
            this.state = 'CHARGE_TELEGRAPH';
            this.stateTimer = 0.6; // Exactamente 0.6 segundos de advertencia (telegraph)
            this.vx = 0;
            this.vy = 0;
            this.chargeAngle = Math.atan2(game.player.y - this.y, game.player.x - this.x);
            soundManager.playBossRoar();
        } else if (chosen === 'SPIRAL_CAST') {
            this.state = 'SPIRAL_CAST';
            this.stateTimer = this.enraged ? 3.2 : 2.8;
            this.spiralShotTimer = 0;
        } else if (chosen === 'JUMP_ASCEND') {
            this.state = 'JUMP_ASCEND';
            this.stateTimer = 0.35 / speedMult;
            this.vx = 0;
            this.vy = 0;
            this.triggerSquash(0.65, 1.45);
        }
    }

    update(dt, game) {
        const player = game.player;
        const speedMult = this.getSpeedMultiplier();
        this.stateTimer -= dt;

        // Actualizar ondas expansivas activas del Salto Sísmico
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.radius += sw.speed * dt;

            // 1, 2, 3: Colisión de Anillo Hueco (solo en el borde activo entre sw.radius - 18 y sw.radius + 18)
            const alreadyHit = sw.waveHitPlayer || sw.hitPlayer;
            if (!alreadyHit && !player.dead) {
                const d = MathUtils.dist(sw.x, sw.y, player.x, player.y);
                if (d >= sw.radius - 18 && d <= sw.radius + 18) {
                    // 1. Respeto Estricto a los I-Frames del Dash / Invulnerabilidad
                    const isPlayerInvulnerable = player.isDashing || player.invulnTimer > 0 || player.invulnerable;
                    if (isPlayerInvulnerable) {
                        // El daño recibido es 0 y se marca para no recibir daño repetido
                        sw.waveHitPlayer = true;
                        sw.hitPlayer = true;
                    } else {
                        const baseWaveDmg = this.enraged ? 15 : 13;
                        const waveDamage = Math.round(baseWaveDmg * this.dmgMult);
                        const hit = player.takeDamage(waveDamage, sw.x, sw.y, 280, game);
                        if (hit) {
                            // 3. Golpe Único por Salto
                            sw.waveHitPlayer = true;
                            sw.hitPlayer = true;
                        }
                    }
                }
            }

            if (sw.radius >= sw.maxRadius) {
                this.shockwaves.splice(i, 1);
            }
        }

        switch (this.state) {
            case 'IDLE': {
                // Persecución imponente hacia el jugador entre ataques
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                const moveSpeed = this.baseSpeed * speedMult;
                this.vx = Math.cos(angle) * moveSpeed;
                this.vy = Math.sin(angle) * moveSpeed;

                if (this.stateTimer <= 0) {
                    this.transitionToNextAttack(game);
                }
                break;
            }

            case 'CHARGE_TELEGRAPH': {
                // Sigue ligeramente al jugador los primeros 0.25s y luego fija ángulo
                if (this.stateTimer > 0.35) {
                    this.chargeAngle = Math.atan2(player.y - this.y, player.x - this.x);
                }
                this.vx = 0;
                this.vy = 0;

                if (this.stateTimer <= 0) {
                    this.state = 'CHARGE_DASH';
                    this.stateTimer = 0.52;
                    this.triggerSquash(1.4, 0.65);
                    game.addScreenShake(6, 0.15);
                }
                break;
            }

            case 'CHARGE_DASH': {
                const dashSpeed = 760 * speedMult;
                this.vx = Math.cos(this.chargeAngle) * dashSpeed;
                this.vy = Math.sin(this.chargeAngle) * dashSpeed;

                // Dejar partículas ardientes al embestir
                if (Math.random() < 0.7) {
                    game.spawnParticles(this.x, this.y, 2, this.enraged ? '#fbbf24' : '#ef4444', 90, true);
                }

                if (this.stateTimer <= 0) {
                    this.vx = 0;
                    this.vy = 0;
                    // En fase enfurecida puede encadenar una segunda embestida rápida
                    if (this.enraged && Math.random() < 0.5) {
                        this.state = 'CHARGE_TELEGRAPH';
                        this.stateTimer = 0.6;
                        this.chargeAngle = Math.atan2(player.y - this.y, player.x - this.x);
                    } else {
                        this.state = 'IDLE';
                        this.stateTimer = this.enraged ? 0.75 : 1.25;
                    }
                }
                break;
            }

            case 'SPIRAL_CAST': {
                // Se desplaza hacia el centro de la arena y dispara anillo rotatorio Bullet Hell
                const centerX = game.arena.x + game.arena.w * 0.5;
                const centerY = game.arena.y + game.arena.h * 0.5;
                const distToCenter = MathUtils.dist(this.x, this.y, centerX, centerY);

                if (distToCenter > 18) {
                    const a = Math.atan2(centerY - this.y, centerX - this.x);
                    this.vx = Math.cos(a) * 280 * speedMult;
                    this.vy = Math.sin(a) * 280 * speedMult;
                } else {
                    this.vx = 0;
                    this.vy = 0;
                }

                this.spiralAngle += (this.enraged ? 3.4 : 2.4) * dt;
                this.spiralShotTimer -= dt;

                if (this.spiralShotTimer <= 0) {
                    this.spiralShotTimer = (this.enraged ? 0.11 : 0.16) / (this.level === 1 ? this.pepeSpeedBuff : 1);
                    const arms = this.enraged ? 6 : 4;
                    const projSpeed = (this.enraged ? 265 : 215) * (this.level === 1 ? this.pepeSpeedBuff : 1);
                    const projDmg = Math.round(14 * this.dmgMult);
                    for (let i = 0; i < arms; i++) {
                        const a = this.spiralAngle + (i * Math.PI * 2) / arms;
                        game.projectiles.push(new Projectile(
                            this.x + Math.cos(a) * 30,
                            this.y + Math.sin(a) * 30,
                            Math.cos(a) * projSpeed,
                            Math.sin(a) * projSpeed,
                            8, projDmg, this.enraged ? '#fbbf24' : '#f43f5e', true
                        ));
                    }
                }

                if (this.stateTimer <= 0) {
                    this.state = 'IDLE';
                    this.stateTimer = this.enraged ? 0.8 : 1.3;
                }
                break;
            }

            case 'WORD_BARRAGE': {
                // Risín Pepín: Se mueve ágilmente y lanza ráfagas/abanicos de palabras dañinas ("JAJAJA", "XD", "JIJIJI", "LMAO", "AHAJAJA")
                const toPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                const orbitAngle = toPlayer + Math.sin(this.animTime * 2.5) * 0.9;
                this.vx = Math.cos(orbitAngle) * (this.baseSpeed * 0.85);
                this.vy = Math.sin(orbitAngle) * (this.baseSpeed * 0.85);

                this.spiralShotTimer -= dt;
                if (this.spiralShotTimer <= 0) {
                    this.spiralShotTimer = this.enraged ? 0.34 : 0.44;
                    this.wordBurstCount++;
                    const count = this.enraged ? 5 : 3;
                    const spreadArc = this.enraged ? 0.95 : 0.65;
                    const wordSpeed = this.enraged ? 340 : 295;
                    const wordDmg = Math.round(13 * this.dmgMult);
                    const palette = ['#ff0055', '#00f5d4', '#fbbf24', '#a855f7', '#39ff14'];

                    for (let i = 0; i < count; i++) {
                        const frac = count === 1 ? 0 : (i / (count - 1)) - 0.5;
                        const ang = toPlayer + frac * spreadArc;
                        const word = this.wordList[(this.wordBurstCount + i) % this.wordList.length];
                        const col = palette[(this.wordBurstCount + i) % palette.length];
                        game.projectiles.push(new Projectile(
                            this.x + Math.cos(ang) * 42,
                            this.y + Math.sin(ang) * 42,
                            Math.cos(ang) * wordSpeed,
                            Math.sin(ang) * wordSpeed,
                            18, wordDmg, col, true, word
                        ));
                    }
                    this.triggerSquash(1.18, 0.84);
                }

                if (this.stateTimer <= 0) {
                    this.state = 'IDLE';
                    this.stateTimer = this.enraged ? 0.65 : 1.0;
                }
                break;
            }

            case 'LAUGH_LASER_TELEGRAPH': {
                // Se detiene y apunta con línea de advertencia de 0.7s + textos "JAJAJAJA!" vibrando
                this.vx = 0;
                this.vy = 0;
                if (this.stateTimer > 0.22) {
                    const targetAng = Math.atan2(player.y - this.y, player.x - this.x);
                    const diff = MathUtils.normalizeAngle(targetAng - this.laserAngle);
                    this.laserAngle += diff * Math.min(1, dt * 6);
                }

                if (this.stateTimer <= 0) {
                    this.state = 'LAUGH_LASER_FIRE';
                    this.stateTimer = this.enraged ? 1.85 : 1.55;
                    this.laserDamageTick = 0;
                    this.triggerSquash(1.32, 0.72);
                    if (soundManager.playLaserBeam) soundManager.playLaserBeam();
                    game.addScreenShake(10, 0.35);
                }
                break;
            }

            case 'LAUGH_LASER_FIRE': {
                // Dispara el potente Rayo Láser continuo de Risa desde su boca barriendo hacia el jugador
                this.vx = 0;
                this.vy = 0;
                const targetAng = Math.atan2(player.y - this.y, player.x - this.x);
                const diff = MathUtils.normalizeAngle(targetAng - this.laserAngle);
                const maxTurnRate = this.enraged ? 1.15 : 0.88; // rad/s de barrido
                this.laserAngle += MathUtils.clamp(diff, -maxTurnRate * dt, maxTurnRate * dt);

                if (this.laserDamageTick > 0) this.laserDamageTick -= dt;

                // Origen del láser en la boca de Risín Pepín
                const mouthX = this.x + Math.cos(this.laserAngle) * 26;
                const mouthY = (this.y - 10) + Math.sin(this.laserAngle) * 26;
                const endX = mouthX + Math.cos(this.laserAngle) * this.laserLength;
                const endY = mouthY + Math.sin(this.laserAngle) * this.laserLength;

                // Colisión del rayo láser contra el jugador (respetando I-Frames del Dash)
                if (!player.dead && this.laserDamageTick <= 0) {
                    const dx = endX - mouthX;
                    const dy = endY - mouthY;
                    const lenSq = dx * dx + dy * dy;
                    const tProj = MathUtils.clamp(((player.x - mouthX) * dx + (player.y - mouthY) * dy) / lenSq, 0, 1);
                    const closestX = mouthX + tProj * dx;
                    const closestY = mouthY + tProj * dy;
                    const distToBeam = MathUtils.dist(player.x, player.y, closestX, closestY);
                    const beamHalfWidth = 17;

                    if (distToBeam <= beamHalfWidth + player.radius) {
                        const isPlayerInvulnerable = player.isDashing || player.invulnTimer > 0 || player.invulnerable;
                        if (!isPlayerInvulnerable) {
                            const laserDmg = Math.round(15 * this.dmgMult);
                            player.takeDamage(laserDmg, closestX, closestY, 260, game);
                            this.laserDamageTick = 0.32;
                        }
                    }
                }

                if (this.stateTimer <= 0) {
                    this.state = 'IDLE';
                    this.stateTimer = this.enraged ? 0.75 : 1.15;
                }
                break;
            }

            case 'JUMP_ASCEND': {
                this.jumpHeight = MathUtils.lerp(0, 750, 1 - (this.stateTimer / (0.35 / speedMult)));
                if (this.stateTimer <= 0) {
                    this.state = 'JUMP_AIR';
                    this.stateTimer = this.enraged ? 0.95 : 1.25;
                    this.jumpHeight = 800;
                }
                break;
            }

            case 'JUMP_AIR': {
                // La sombra persigue al jugador proyectándose sobre él y creciendo
                const trackSpeed = 310 * speedMult;
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                const d = MathUtils.dist(this.x, this.y, player.x, player.y);
                if (d > 8) {
                    this.vx = Math.cos(angle) * trackSpeed;
                    this.vy = Math.sin(angle) * trackSpeed;
                } else {
                    this.vx = 0;
                    this.vy = 0;
                }

                const totalAir = this.enraged ? 0.95 : 1.25;
                this.shadowScale = MathUtils.lerp(0.4, 1.45, 1 - (this.stateTimer / totalAir));

                if (this.stateTimer <= 0) {
                    this.state = 'JUMP_SLAM';
                    this.stateTimer = 0.18;
                    this.vx = 0;
                    this.vy = 0;
                }
                break;
            }

            case 'JUMP_SLAM': {
                this.jumpHeight = MathUtils.lerp(800, 0, 1 - (this.stateTimer / 0.18));
                if (this.stateTimer <= 0) {
                    this.jumpHeight = 0;
                    this.triggerSquash(1.45, 0.55);
                    soundManager.playBossSlam();
                    game.addScreenShake(15, 0.38);
                    game.spawnParticles(this.x, this.y, 36, this.enraged ? '#fbbf24' : '#ef4444', 260, true);

                    // Daño por aplastamiento directo al caer (respetando I-frames de Dash)
                    const dFall = MathUtils.dist(this.x, this.y, player.x, player.y);
                    if (dFall < this.radius + player.radius) {
                        const isPlayerInvulnerable = player.isDashing || player.invulnTimer > 0 || player.invulnerable;
                        if (!isPlayerInvulnerable && !player.dead) {
                            player.takeDamage(Math.round(16 * this.dmgMult), this.x, this.y, 340, game);
                        }
                    }

                    // Generar onda expansiva circular (anillo hueco esquivable)
                    this.shockwaves.push({
                        x: this.x,
                        y: this.y,
                        radius: 25,
                        maxRadius: this.enraged ? 350 : 280,
                        speed: this.enraged ? 305 : 245,
                        waveHitPlayer: false,
                        hitPlayer: false
                    });

                    this.state = 'IDLE';
                    this.stateTimer = this.enraged ? 0.85 : 1.35;
                }
                break;
            }
        }

        this.updateBase(dt, game);

        // Daño por contacto físico directo cuando está en tierra (respetando Dash)
        if (this.isTargetable() && !player.dead) {
            if (MathUtils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
                const isPlayerInvulnerable = player.isDashing || player.invulnTimer > 0 || player.invulnerable;
                if (!isPlayerInvulnerable) {
                    player.takeDamage(Math.round(20 * this.dmgMult), this.x, this.y, 350, game);
                }
            }
        }
    }

    draw(ctx, player) {
        // 1. Dibujar Línea Roja de Advertencia (Telegraph de Embestida Maestra)
        if (this.state === 'CHARGE_TELEGRAPH') {
            ctx.save();
            const pulse = 0.55 + Math.sin(this.animTime * 35) * 0.35;
            ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
            ctx.fillStyle = `rgba(239, 68, 68, ${pulse * 0.22})`;
            ctx.lineWidth = 3;

            const length = 850;
            ctx.translate(this.x, this.y);
            ctx.rotate(this.chargeAngle);

            // Zona rectangular de peligro
            ctx.fillRect(0, -this.radius, length, this.radius * 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(length, 0);
            ctx.stroke();
            ctx.restore();
        }

        // 1.B Dibujar Telegraph y Rayo del Láser de Risa Descontrolada ("Risa Láser" de Risín Pepín)
        if (this.state === 'LAUGH_LASER_TELEGRAPH') {
            ctx.save();
            const mouthX = this.x + Math.cos(this.laserAngle) * 26;
            const mouthY = (this.y - 10) + Math.sin(this.laserAngle) * 26;
            const pulse = 0.55 + Math.sin(this.animTime * 40) * 0.35;

            ctx.translate(mouthX, mouthY);
            ctx.rotate(this.laserAngle);

            ctx.fillStyle = `rgba(255, 0, 85, ${pulse * 0.22})`;
            ctx.fillRect(0, -18, this.laserLength, 36);

            ctx.strokeStyle = `rgba(0, 245, 212, ${pulse})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([12, 8]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.laserLength, 0);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // Textos "JAJAJAJA!" vibrando alrededor de Risín Pepín durante la carga
            ctx.save();
            ctx.font = '900 16px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff0055';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            const jx = this.x + (Math.random() - 0.5) * 14;
            const jy = this.y - this.radius - 34 + (Math.random() - 0.5) * 10;
            ctx.strokeText('¡JAJAJAJAJA!', jx, jy);
            ctx.fillText('¡JAJAJAJAJA!', jx, jy);
            ctx.restore();
        } else if (this.state === 'LAUGH_LASER_FIRE') {
            ctx.save();
            const mouthX = this.x + Math.cos(this.laserAngle) * 26;
            const mouthY = (this.y - 10) + Math.sin(this.laserAngle) * 26;
            ctx.translate(mouthX, mouthY);
            ctx.rotate(this.laserAngle);

            // Haz exterior carmesí/eléctrico
            const flicker = Math.sin(this.animTime * 60) * 3;
            ctx.shadowBlur = 24;
            ctx.shadowColor = '#ff0055';
            ctx.fillStyle = 'rgba(255, 0, 85, 0.55)';
            ctx.fillRect(0, -19 - flicker * 0.5, this.laserLength, 38 + flicker);

            // Haz intermedio cian eléctrico
            ctx.fillStyle = 'rgba(0, 245, 212, 0.78)';
            ctx.fillRect(0, -11, this.laserLength, 22);

            // Núcleo blanco incandescente
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, -5, this.laserLength, 10);

            // Ondas sónicas y sílabas "JA" viajando a toda velocidad por el haz de luz
            const scrollOffset = (this.animTime * 680) % 90;
            ctx.font = '900 15px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let dist = scrollOffset; dist < this.laserLength - 40; dist += 90) {
                // Anillo sónico
                ctx.strokeStyle = '#fde047';
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.ellipse(dist, 0, 7, 22, 0, 0, Math.PI * 2);
                ctx.stroke();

                // Letra "JA" viajando por el rayo
                ctx.fillStyle = '#fde047';
                ctx.strokeStyle = '#090d16';
                ctx.lineWidth = 3;
                ctx.strokeText('JA', dist + 42, (Math.sin(dist * 0.05 + this.animTime * 20) * 5));
                ctx.fillText('JA', dist + 42, (Math.sin(dist * 0.05 + this.animTime * 20) * 5));
            }

            // Orbe de energía en la boca
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 18 + Math.sin(this.animTime * 45) * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 2. Dibujar Ondas Expansivas del Salto Sísmico
        for (const sw of this.shockwaves) {
            ctx.save();
            const alpha = 1 - (sw.radius / sw.maxRadius);
            ctx.strokeStyle = this.enraged ? `rgba(251, 191, 36, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
            ctx.lineWidth = 8 * alpha + 2;
            ctx.shadowBlur = 18;
            ctx.shadowColor = this.enraged ? '#fbbf24' : '#ef4444';
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. Dibujar Sombra Creciente (Especialmente importante en Salto Sísmico)
        ctx.save();
        ctx.translate(this.x, this.y);
        const sRadius = this.state === 'JUMP_AIR' ? this.radius * this.shadowScale : this.radius * 1.05;
        ctx.fillStyle = this.state === 'JUMP_AIR' ? 'rgba(239, 68, 68, 0.38)' : 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 18, sRadius, sRadius * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        if (this.state === 'JUMP_AIR') {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();

        // Si está en el aire muy alto, no dibujar el cuerpo hasta que descienda
        if (this.state === 'JUMP_AIR') return;

        // 4. Dibujar a EL PEPE MAESTRO
        ctx.save();
        ctx.translate(this.x, this.y - this.jumpHeight);
        ctx.scale(this.sizeScale, this.sizeScale);

        const wobble = Math.sin(this.animTime * 8) * 0.04;
        ctx.rotate(wobble);
        ctx.scale(this.scaleX, this.scaleY);

        const isMoving = Math.hypot(this.vx, this.vy) > 10;
        const auraColor = this.isRisin
            ? (this.enraged ? '#00f5d4' : '#ff0055')
            : (this.enraged ? '#ef4444' : '#fbbf24');

        // Aura brillante pulsante del Jefe
        ctx.save();
        ctx.shadowBlur = this.enraged ? 32 : 22;
        ctx.shadowColor = auraColor;
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = this.enraged ? 4 : 3;
        const auraRadius = this.radius / this.sizeScale + 12 + Math.sin(this.animTime * 10) * 4;
        ctx.beginPath();
        ctx.arc(0, 4, auraRadius, 0, Math.PI * 2);
        ctx.stroke();
        if (this.isRisin) {
            ctx.strokeStyle = this.enraged ? '#ff0055' : '#00f5d4';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(0, 4, auraRadius + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();

        // 1. SISTEMA DE EXTREMIDADES: PIERNAS (x2)
        const legSwing = isMoving ? Math.sin(this.animTime * 10) * 11 : Math.sin(this.animTime * 3) * 2;
        const legSwingAlt = isMoving ? Math.sin(this.animTime * 10 + Math.PI) * 11 : Math.sin(this.animTime * 3 + Math.PI) * 2;

        const drawLeg = (offsetX, swing) => {
            ctx.save();
            ctx.translate(offsetX, 22);

            // Pantalón oscuro
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.rect(-6, 0, 12, 22 + swing);
            ctx.fill();
            ctx.stroke();

            // Zapatilla deportiva
            const footY = 22 + swing;
            ctx.fillStyle = '#f8fafc';
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(0, footY, 8, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Suela roja
            ctx.fillStyle = '#e63928';
            ctx.fillRect(-7, footY + 2, 14, 2.5);

            ctx.restore();
        };

        drawLeg(-13, legSwing);
        drawLeg(13, legSwingAlt);

        // 1. SISTEMA DE EXTREMIDADES: BRAZOS Y MANOS (x2)
        const drawArm = (isLeft) => {
            ctx.save();
            const shoulderX = isLeft ? -25 : 25;
            const shoulderY = 0;
            ctx.translate(shoulderX, shoulderY);

            let armAngle = 0;
            if (this.state === 'CHARGE_TELEGRAPH' || this.state === 'CHARGE_DASH') {
                // Brazos hacia adelante como si fuera a taclear en la dirección de la embestida
                armAngle = this.chargeAngle + (isLeft ? -0.25 : 0.25);
            } else if (this.state === 'SPIRAL_CAST') {
                // Levanta ambos brazos invocando proyectiles hacia arriba
                armAngle = isLeft ? -Math.PI * 0.72 : -Math.PI * 0.28;
            } else if (this.state === 'JUMP_SLAM') {
                // Golpea el suelo con ambos puños al caer
                armAngle = isLeft ? Math.PI * 0.42 : Math.PI * 0.58;
            } else {
                // Estado normal: balanceo con ritmo de combate
                const sway = Math.sin(this.animTime * 6) * 0.32;
                armAngle = isLeft ? (Math.PI * 0.48 + sway) : (Math.PI * 0.52 - sway);
            }

            ctx.rotate(armAngle);

            // Manga roja de la camiseta (#e63928)
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#e63928';
            ctx.strokeStyle = '#991b1b';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.rect(-7, -4, 14, 14);
            ctx.fill();
            ctx.stroke();

            // Brazo musculoso (piel morena cálida #8d5538)
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#8d5538';
            ctx.strokeStyle = '#5a3420';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(-5.5, 10, 11, 15);
            ctx.fill();
            ctx.stroke();

            // Puño / Mano
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#79472e';
            ctx.beginPath();
            ctx.arc(0, 27, 7.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Efecto de invocación en manos durante Espiral Arcana
            if (this.state === 'SPIRAL_CAST') {
                ctx.fillStyle = this.enraged ? '#fbbf24' : '#ef4444';
                ctx.shadowBlur = 12;
                ctx.shadowColor = this.enraged ? '#fbbf24' : '#ef4444';
                ctx.beginPath();
                ctx.arc(0, 29, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        };

        drawArm(true);
        drawArm(false);

        // 1. SISTEMA DE TORSO: CAMISETA ROJA VIBRANTE (#e63928)
        ctx.save();
        ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#e63928';
        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-26, -2);
        ctx.lineTo(-22, 24);
        ctx.lineTo(22, 24);
        ctx.lineTo(26, -2);
        ctx.lineTo(15, -9);
        ctx.lineTo(-15, -9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cuello de la camiseta
        ctx.strokeStyle = '#b91c1c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, -9, 8.5, 0, Math.PI);
        ctx.stroke();

        // Pliegues y sombreado
        ctx.strokeStyle = 'rgba(153, 27, 27, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, 9);
        ctx.lineTo(-3, 14);
        ctx.moveTo(11, 7);
        ctx.lineTo(3, 13);
        ctx.stroke();
        ctx.restore();

        // 2. CABEZA DEL JEFE (EL PEPE MAESTRO EN NIVEL 1 / RISÍN PEPÍN EN NIVEL 2)
        const headX = 0;
        const headY = -18;
        const headR = this.isRisin ? 30 : 27;
        const activeBossImg = this.isRisin ? (typeof risinImg !== 'undefined' ? risinImg : pepeImg) : pepeImg;

        ctx.save();
        if (activeBossImg && activeBossImg.complete && activeBossImg.naturalWidth > 0) {
            // FOTO RECORTADA EN CÍRCULO PERFECTO
            ctx.save();
            ctx.beginPath();
            ctx.arc(headX, headY, headR, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();

            ctx.drawImage(activeBossImg, headX - headR * 1.15, headY - headR * 1.15, headR * 2.3, headR * 2.3);

            if (this.hitFlash > 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.fill();
            }
            ctx.restore();

            // Borde de aura amenazante (dorada/roja en Pepe, carmesí/eléctrica en Risín Pepín)
            ctx.shadowBlur = this.enraged ? 24 : 16;
            ctx.shadowColor = auraColor;
            ctx.strokeStyle = auraColor;
            ctx.lineWidth = this.enraged ? 4 : 3;
            ctx.beginPath();
            ctx.arc(headX, headY, headR, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // FALLBACK PROCEDURAL EXACTO A LA FOTO
            // 2.1 Cabello afro negro voluminoso y esponjoso (#1a1a1a)
            ctx.fillStyle = '#1a1a1a';
            ctx.strokeStyle = '#0a0a0a';
            ctx.lineWidth = 1.5;
            const afroPuffs = [
                { x: 0, y: -34, r: 16 },
                { x: -14, y: -30, r: 15 },
                { x: 14, y: -30, r: 15 },
                { x: -24, y: -19, r: 13 },
                { x: 24, y: -19, r: 13 },
                { x: -25, y: -7, r: 12 },
                { x: 25, y: -7, r: 12 },
                { x: -8, y: -25, r: 14 },
                { x: 8, y: -25, r: 14 }
            ];
            for (const puff of afroPuffs) {
                ctx.beginPath();
                ctx.arc(headX + puff.x, headY + puff.y, puff.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // Orejas
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#8d5538';
            ctx.strokeStyle = '#5a3420';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(headX - 21, headY + 3, 5.5, 0, Math.PI * 2);
            ctx.arc(headX + 21, headY + 3, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Rostro de piel morena cálida (#8d5538)
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#8d5538';
            ctx.strokeStyle = '#5a3420';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(headX, headY + 3, 20, 24, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Sombra superior del afro sobre la frente
            ctx.fillStyle = 'rgba(26, 26, 26, 0.25)';
            ctx.beginPath();
            ctx.arc(headX, headY - 10, 18, Math.PI, Math.PI * 2);
            ctx.fill();

            // Ángulo hacia el jugador
            const angleToPlayer = Math.atan2(player.y - (this.y + headY), player.x - (this.x + headX));
            const lookX = Math.cos(angleToPlayer) * 3;
            const lookY = Math.sin(angleToPlayer) * 2;

            // Cejas arqueadas expresivas
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(headX - 15, headY - 5);
            ctx.quadraticCurveTo(headX - 9, headY - 10, headX - 3, headY - 6);
            ctx.moveTo(headX + 3, headY - 6);
            ctx.quadraticCurveTo(headX + 9, headY - 10, headX + 15, headY - 5);
            ctx.stroke();

            // Mirada desafiante fijada hacia el jugador
            for (const side of [-1, 1]) {
                const eyeX = headX + side * 8;
                const eyeY = headY + 1;

                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#27160e';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(eyeX, eyeY, 5.5, 3.8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = this.enraged ? '#b91c1c' : '#1e110b';
                ctx.beginPath();
                ctx.arc(eyeX + lookX, eyeY + lookY, 2.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(eyeX + lookX - 0.7, eyeY + lookY - 0.7, 0.9, 0, Math.PI * 2);
                ctx.fill();
            }

            // Nariz
            ctx.strokeStyle = '#6e3e26';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(headX, headY + 3);
            ctx.lineTo(headX - 2.5, headY + 11);
            ctx.lineTo(headX + 2.5, headY + 11);
            ctx.stroke();

            // Labios prominentes y desafiantes
            ctx.fillStyle = '#7a422b';
            ctx.strokeStyle = '#502817';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(headX, headY + 17, 7, 3.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Aura amenazante
            ctx.shadowBlur = this.enraged ? 24 : 16;
            ctx.shadowColor = auraColor;
            ctx.strokeStyle = auraColor;
            ctx.lineWidth = this.enraged ? 4 : 3;
            ctx.beginPath();
            ctx.arc(headX, headY, headR + 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        // 2. DETALLE ICÓNICO OBLIGATORIO: BURBUJA DE NOTIFICACIÓN "😡 20" / "😡 99+"
        ctx.save();
        const bubbleFloat = Math.sin(this.animTime * 5) * 4;
        let bubbleShakeX = 0;
        let bubbleShakeY = 0;
        if (this.enraged) {
            bubbleShakeX = (Math.random() - 0.5) * 3.5;
            bubbleShakeY = (Math.random() - 0.5) * 3.5;
        }

        const bubbleX = headX + 10 + bubbleShakeX;
        const bubbleY = headY - 42 + bubbleFloat + bubbleShakeY;

        ctx.translate(bubbleX, bubbleY);
        ctx.rotate(-0.16); // Inclinación ligera de sticker

        // Fondo y silueta de la burbuja con triángulo inferior
        const bw = 54;
        const bh = 24;
        const bx = -22;
        const by = -12;
        const br = 6;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx + br, by);
        ctx.lineTo(bx + bw - br, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
        ctx.lineTo(bx + bw, by + bh - br);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
        // Triángulo inferior apuntando al cabello
        ctx.lineTo(bx + 14, by + bh);
        ctx.lineTo(bx + 7, by + bh + 8);
        ctx.lineTo(bx + 5, by + bh);
        ctx.lineTo(bx + br, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
        ctx.lineTo(bx, by + br);
        ctx.quadraticCurveTo(bx, by, bx + br, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Icono cara enojada roja 😡
        ctx.save();
        ctx.translate(bx + 10, by + 12);
        ctx.fillStyle = '#e63928';
        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-4.5, -3.5);
        ctx.lineTo(-1, -1.5);
        ctx.moveTo(4.5, -3.5);
        ctx.lineTo(1, -1.5);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-2.5, 0.5, 1, 0, Math.PI * 2);
        ctx.arc(2.5, 0.5, 1, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 4.5, 2.8, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.restore();

        // Texto del contador ("20" / "99+" para Pepe, "JAJA" / "XD!" para Risín Pepín)
        const labelText = this.isRisin ? (this.enraged ? 'XD!' : 'JAJA') : (this.enraged ? '99+' : '20');
        ctx.fillStyle = this.isRisin ? '#ff0055' : '#c92a2a';
        ctx.font = '900 12px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, bx + 20, by + 12);

        ctx.restore();

        ctx.restore();
    }
}
