/**
 * ============================================================================
 * CLASE ENEMIGO: PERSEGUIDORES Y TIRADORES
 * ============================================================================
 */
class Enemy extends Entity {
    constructor(x, y, archetype = 'CHASER', waveIndex = 1, level = 1) {
        const isChaser = archetype === 'CHASER';
        const isGargoyle = archetype === 'GARGOYLE';
        const isVilla = archetype === 'VILLA';
        const radius = archetype === 'TANK' ? 32 : (isVilla ? 20 : (isGargoyle ? 15 : (isChaser ? 16 : 18)));
        const hp = archetype === 'TANK'
            ? 4 * (48 + (waveIndex - 1) * 12) // 4x la vida de un melee normal
            : (isVilla
                ? (46 + (waveIndex - 1) * 12)
                : (isGargoyle ? (36 + (waveIndex - 1) * 10) : ((isChaser ? 48 : 38) + (waveIndex - 1) * 12)));
        super(x, y, radius, hp);

        this.archetype = archetype; // 'CHASER' | 'SHOOTER' | 'TANK' | 'GARGOYLE' | 'VILLA'
        this.waveIndex = waveIndex;
        this.level = level;
        this.baseSpeed = isGargoyle
            ? (245 * 1.25) // Gárgola Veloz: 25% más rápida que la velocidad base del jugador
            : (archetype === 'TANK'
                ? MathUtils.randRange(58, 70)
                : (isVilla
                    ? MathUtils.randRange(102, 122)
                    : (isChaser ? MathUtils.randRange(138, 168) : MathUtils.randRange(95, 115))));
        this.speed = isGargoyle ? this.baseSpeed : (this.baseSpeed * (level === 2 ? 1.15 : 1.0));
        this.baseContactDamage = isGargoyle ? 0 : (archetype === 'TANK' ? 8 : (isChaser ? 16 : 10)); // Gárgola: 0 daño directo
        this.contactDamage = Math.round(this.baseContactDamage * (level === 2 ? 1.10 : 1.0));
        this.baseAttackCooldown = isGargoyle ? 0.65 : (isVilla ? MathUtils.randRange(2.3, 3.0) : (isChaser ? 0.8 : MathUtils.randRange(1.7, 2.3)));
        this.attackCooldown = (!isChaser && !isGargoyle && !isVilla && level === 2) ? (this.baseAttackCooldown / 1.07) : this.baseAttackCooldown;
        this.attackTimer = isVilla ? MathUtils.randRange(0.9, 1.6) : MathUtils.randRange(0.4, 1.2);
        this.gargoyleHitCooldown = 0;
        this.kbMult = archetype === 'TANK' ? 0.3 : 1; // Tanque: 70% menos retroceso
        this.stepPhase = 0;

        // Parámetros de IA Táctica (Flanqueo, Predicción y Rodeo)
        this.flankSign = Math.random() < 0.5 ? -1 : 1;
        this.flankOffset = this.flankSign * MathUtils.randRange(0.42, 0.95);
        this.strafeSwitchTimer = MathUtils.randRange(2.0, 4.0);

        // Ataque Cargado Venenoso de "Villa" (patirrona.png)
        this.chargeState = 'IDLE'; // 'IDLE' | 'CHARGING'
        this.chargeDuration = 0.85;
        this.chargeTimer = 0;
        this.chargeAngle = 0;
        this.patirronaRange = 460;
        this.patirronaRadius = 28; // +75% a +90%+ mayor hitbox visual y física en v1.7.0

        // Salto Sísmico y Onda Expansiva de Ete Sech (Tanque Nivel 2)
        this.jumpState = 'NONE'; // 'NONE' | 'TELEGRAPH' | 'JUMPING'
        this.jumpTimer = 0;
        this.jumpMaxTime = 0.36;
        this.jumpZ = 0;
        this.jumpCooldownTimer = MathUtils.randRange(4.5, 6.0);
        this.shockwaves = [];
    }

    // Probabilidad de drop de oro calibrada según enemigos de la ronda para otorgar entre 3 y 5 de oro por oleada
    shouldDropGold(game) {
        const dropped = game.waveGoldDropped || 0;
        if (dropped >= 5) return false;
        const target = game.waveGoldTarget || 4;
        const aliveRemaining = Math.max(1, game.enemies.filter(e => !e.dead).length + 1);
        const needed = target - dropped;
        if (needed > 0 && aliveRemaining <= needed) return true;
        const totalInWave = Math.max(4, game.waveTotalEnemies || 8);
        const baseChance = MathUtils.clamp(target / totalInWave, 0.18, 0.75);
        return Math.random() < (needed > 0 ? Math.max(baseChance, needed / aliveRemaining) : 0.10);
    }

    takeDamage(amount, sourceX, sourceY, kbForce, isCrit, game) {
        if (this.dead) return;
        this.hp -= amount;
        this.hitFlash = 0.13;
        this.applyKnockback(sourceX, sourceY, kbForce);
        this.triggerSquash(1.38, 0.68);

        soundManager.playEnemyHit();

        const textColor = isCrit ? '#fbbf24' : '#ffffff';
        game.floatingTexts.push(new FloatingText(this.x, this.y - 18, isCrit ? `${amount}!` : `${amount}`, textColor, 15, isCrit));
        const pColor = this.archetype === 'TANK' ? '#f97316' : (this.archetype === 'VILLA' ? '#39ff14' : (this.archetype === 'GARGOYLE' ? '#818cf8' : (this.archetype === 'CHASER' ? '#f43f5e' : '#a855f7')));
        game.spawnParticles(this.x, this.y, isCrit ? 14 : 8, pColor, 160, true);

        if (this.hp <= 0) {
            this.dead = true;
            game.onEnemyKilled(this);
        }
    }

    hasClearLineOfSight(tx, ty, game) {
        if (!game || !game.pillars) return true;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1) return true;
        for (const p of game.pillars) {
            if (p.dead) continue;
            const tProj = MathUtils.clamp(((p.x - this.x) * dx + (p.y - this.y) * dy) / lenSq, 0, 1);
            const cx = this.x + tProj * dx;
            const cy = this.y + tProj * dy;
            if (MathUtils.dist(p.x, p.y, cx, cy) < p.radius + 7) {
                return false;
            }
        }
        return true;
    }

    computeSteeredAngle(desiredAngle, targetDist, game) {
        if (!game || !game.pillars) return desiredAngle;
        let steerX = Math.cos(desiredAngle);
        let steerY = Math.sin(desiredAngle);
        const lookAhead = Math.min(targetDist, this.radius + 88);

        for (const p of game.pillars) {
            if (p.dead) continue;
            const px = p.x - this.x;
            const py = p.y - this.y;
            const d = Math.hypot(px, py);
            const avoidR = this.radius + p.radius + 26;
            if (d < lookAhead + p.radius && d > 0.01) {
                const fwd = px * steerX + py * steerY;
                if (fwd > -p.radius * 0.4) {
                    const lat = Math.abs(px * -steerY + py * steerX);
                    if (lat < avoidR) {
                        const side = (px * -steerY + py * steerX) >= 0 ? -1 : 1;
                        const tangAngle = Math.atan2(py, px) + side * (Math.PI * 0.55);
                        const weight = MathUtils.clamp((avoidR - lat) / avoidR, 0.25, 1.0) * 1.45;
                        steerX += Math.cos(tangAngle) * weight;
                        steerY += Math.sin(tangAngle) * weight;
                    }
                }
            }
        }

        // Suave repulsión de bordes de la arena para evitar atascos en esquinas
        const b = game.arena;
        const margin = this.radius + 26;
        if (this.x < b.x + margin) steerX += 0.65;
        else if (this.x > b.x + b.w - margin) steerX -= 0.65;
        if (this.y < b.y + margin) steerY += 0.65;
        else if (this.y > b.y + b.h - margin) steerY -= 0.65;

        return Math.atan2(steerY, steerX);
    }

    update(dt, game) {
        const player = game.player;
        if (player.dead) return;

        const isL2 = game.level === 2 || this.level === 2;
        const moveSpeed = this.archetype === 'GARGOYLE'
            ? (player.baseSpeed || 245) * 1.25
            : this.baseSpeed * (isL2 ? 1.15 : 1.0);
        const dmgMult = isL2 ? 1.10 : 1.0;
        const contactDmg = Math.round(this.baseContactDamage * dmgMult);

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        const directAngle = Math.atan2(dy, dx);

        // Predicción ligera del movimiento del jugador para cortar rutas de escape
        const leadT = MathUtils.clamp(dist / Math.max(140, moveSpeed * 2.2), 0.08, 0.40);
        const predX = player.x + (player.vx || 0) * leadT;
        const predY = player.y + (player.vy || 0) * leadT;
        const predAngle = Math.atan2(predY - this.y, predX - this.x);

        // Variación periódica de flanco para rodear al jugador por distintos ángulos
        this.strafeSwitchTimer -= dt;
        if (this.strafeSwitchTimer <= 0) {
            this.strafeSwitchTimer = MathUtils.randRange(2.0, 4.0);
            this.flankSign *= -1;
            this.flankOffset = this.flankSign * MathUtils.randRange(0.42, 0.95);
        }

        this.attackTimer -= dt;
        if (this.gargoyleHitCooldown > 0) this.gargoyleHitCooldown -= dt;

        // Actualizar ondas expansivas de anillo hueco de Ete Sech (Tanque)
        if (this.shockwaves && this.shockwaves.length > 0) {
            for (let i = this.shockwaves.length - 1; i >= 0; i--) {
                const sw = this.shockwaves[i];
                sw.radius += sw.speed * dt;

                // Anillo hueco: daña únicamente en su borde activo (Math.abs(dist - waveRadius) <= 16)
                if (!sw.hitPlayer && !player.dead) {
                    const pDist = MathUtils.dist(sw.x, sw.y, player.x, player.y);
                    if (Math.abs(pDist - sw.radius) <= 16) {
                        // Respeto estricto a los I-Frames del Dash
                        if (player.isDashing || player.invulnTimer > 0 || player.invulnerable) {
                            sw.hitPlayer = true;
                        } else {
                            const waveDmg = Math.round(11 * dmgMult);
                            const hit = player.takeDamage(waveDmg, sw.x, sw.y, 240, game);
                            if (hit) {
                                sw.hitPlayer = true;
                            }
                        }
                    }
                }

                if (sw.radius >= sw.maxRadius) {
                    this.shockwaves.splice(i, 1);
                }
            }
        }

        const flankWeight = MathUtils.clamp((dist - 90) / 145, 0, 1);
        const flankMoveAngle = this.computeSteeredAngle(predAngle + this.flankOffset * flankWeight, dist, game);

        if (this.archetype === 'GARGOYLE') {
            // IA Gárgola Veloz: persigue rodeando obstáculos rápidamente (1.25x base jugador), 0 daño directo, duerme en 2 golpes
            const gargoyleSpeed = (player.baseSpeed || 245) * 1.25;
            this.vx = Math.cos(flankMoveAngle) * gargoyleSpeed;
            this.vy = Math.sin(flankMoveAngle) * gargoyleSpeed;

            if (this.gargoyleHitCooldown <= 0 && MathUtils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
                const isPlayerInvuln = player.isDashing || player.invulnTimer > 0;
                if (!isPlayerInvuln) {
                    const hitApplied = player.applyGargoyleHit ? player.applyGargoyleHit(this, game) : false;
                    this.gargoyleHitCooldown = 0.65;
                    this.applyKnockback(player.x, player.y, 240);
                    if (hitApplied) {
                        this.triggerSquash(1.25, 0.78);
                    }
                }
            }
        } else if (this.archetype === 'CHASER' || this.archetype === 'TANK') {
            if (this.archetype === 'TANK') {
                // Lógica del Salto Sísmico de Ete Sech (regla estricta: SOLO salta si distancia <= 200px)
                if (this.jumpState === 'TELEGRAPH') {
                    this.vx = 0;
                    this.vy = 0;
                    this.jumpTimer -= dt;
                    if (this.jumpTimer <= 0) {
                        this.jumpState = 'JUMPING';
                        this.jumpMaxTime = 0.36;
                        this.jumpTimer = this.jumpMaxTime;
                        this.triggerSquash(0.76, 1.32);
                        if (soundManager.playEteSech) soundManager.playEteSech();
                    }
                } else if (this.jumpState === 'JUMPING') {
                    this.jumpTimer -= dt;
                    this.vx = Math.cos(directAngle) * moveSpeed * 0.65;
                    this.vy = Math.sin(directAngle) * moveSpeed * 0.65;
                    const jumpProg = 1 - Math.max(0, this.jumpTimer / this.jumpMaxTime);
                    this.jumpZ = Math.sin(jumpProg * Math.PI) * 58;
                    if (this.jumpTimer <= 0) {
                        this.jumpState = 'NONE';
                        this.jumpZ = 0;
                        this.jumpCooldownTimer = MathUtils.randRange(4.5, 6.0);
                        this.triggerSquash(1.38, 0.64);
                        soundManager.playBossSlam();
                        game.addScreenShake(6.5, 0.22);
                        game.spawnParticles(this.x, this.y, 22, '#a855f7', 175, true);
                        this.shockwaves.push({
                            x: this.x,
                            y: this.y,
                            radius: 18,
                            maxRadius: 150,
                            speed: 235,
                            hitPlayer: false
                        });
                    }
                } else {
                    if (this.jumpCooldownTimer > 0) this.jumpCooldownTimer -= dt;
                    if (this.jumpCooldownTimer <= 0 && dist <= 200) {
                        this.jumpState = 'TELEGRAPH';
                        this.jumpTimer = 0.55;
                        this.vx = 0;
                        this.vy = 0;
                        this.triggerSquash(1.28, 0.72);
                    } else {
                        // Pasos pesados del Coloso cortando ruta hacia el jugador y esquivando pilares
                        const ph = Math.floor(this.animTime * 2.6);
                        if (ph !== this.stepPhase) {
                            this.stepPhase = ph;
                            if (dist < 650) {
                                soundManager.playHeavyStep();
                                game.addScreenShake(2.2, 0.09);
                                game.spawnParticles(this.x, this.y + this.radius * 0.8, 4, '#6b7280', 70, false);
                            }
                        }
                        const tankAngle = this.computeSteeredAngle(predAngle + this.flankOffset * 0.35 * flankWeight, dist, game);
                        this.vx = Math.cos(tankAngle) * moveSpeed;
                        this.vy = Math.sin(tankAngle) * moveSpeed;
                    }
                }
            } else {
                // IA Perseguidor con Rodeo (Flanking), predicción y evasión de pilares
                this.vx = Math.cos(flankMoveAngle) * moveSpeed;
                this.vy = Math.sin(flankMoveAngle) * moveSpeed;
            }

            if (this.jumpState !== 'JUMPING' && MathUtils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
                const hit = player.takeDamage(contactDmg, this.x, this.y, 260, game);
                if (hit) {
                    this.applyKnockback(player.x, player.y, 220);
                }
            }
        } else if (this.archetype === 'VILLA') {
            // IA de "Villa" (Tirador táctico con Ataque Cargado de Patirrona Venenosa)
            const hasLOS = this.hasClearLineOfSight(player.x, player.y, game);

            if (this.chargeState === 'CHARGING') {
                this.vx = 0;
                this.vy = 0;
                this.chargeTimer -= dt;
                // Ajusta puntería ligeramente en la primera mitad de la carga y luego fija el ángulo
                if (this.chargeTimer > 0.45) {
                    this.chargeAngle = Math.atan2(predY - this.y, predX - this.x);
                }
                if (this.chargeTimer <= 0) {
                    this.chargeState = 'IDLE';
                    this.attackTimer = this.baseAttackCooldown;
                    this.triggerSquash(0.74, 1.32);

                    const spawnOffset = this.radius + 8;
                    const sx = this.x + Math.cos(this.chargeAngle) * spawnOffset;
                    const sy = this.y + Math.sin(this.chargeAngle) * spawnOffset;
                    const projSpeed = 651; // +55% más rápida que en v1.6.0 (420 * 1.55)
                    const directDmg = Math.round(player.maxHp * 0.25);

                    game.projectiles.push(new Projectile(
                        sx, sy,
                        Math.cos(this.chargeAngle) * projSpeed,
                        Math.sin(this.chargeAngle) * projSpeed,
                        this.patirronaRadius,
                        directDmg,
                        '#39ff14',
                        true,
                        null,
                        {
                            kind: 'PATIRRONA',
                            maxDistance: this.patirronaRange,
                            pctMaxHpDamage: 0.25,
                            poisonDuration: 4.0
                        }
                    ));
                    soundManager.playGunshot();
                    game.spawnParticles(sx, sy, 10, '#39ff14', 120, true);
                }
            } else {
                const preferredDist = 310;
                let desiredA;
                let spd = moveSpeed;
                if (!hasLOS) {
                    // Busca ángulo limpio rodeando pilares
                    desiredA = directAngle + this.flankSign * (Math.PI * 0.48);
                } else if (dist > preferredDist + 45) {
                    desiredA = predAngle + this.flankOffset * 0.4;
                } else if (dist < preferredDist - 65) {
                    desiredA = directAngle + Math.PI + this.flankSign * 0.45;
                    spd = moveSpeed * 0.9;
                } else {
                    desiredA = directAngle + this.flankSign * Math.PI * 0.5;
                    spd = moveSpeed * 0.65;
                }
                const steered = this.computeSteeredAngle(desiredA, dist, game);
                this.vx = Math.cos(steered) * spd;
                this.vy = Math.sin(steered) * spd;

                if (this.attackTimer <= 0 && dist <= this.patirronaRange - 15 && hasLOS) {
                    this.chargeState = 'CHARGING';
                    this.chargeTimer = this.chargeDuration;
                    this.chargeAngle = Math.atan2(predY - this.y, predX - this.x);
                    this.vx = 0;
                    this.vy = 0;
                    this.triggerSquash(1.22, 0.78);
                }
            }
        } else {
            // IA Tirador (Jokers): Mantiene distancia táctica, busca ángulo sin pilares y dispara
            const hasLOS = this.hasClearLineOfSight(player.x, player.y, game);
            const preferredDist = 260;
            let desiredA;
            let spd = moveSpeed;
            if (!hasLOS) {
                desiredA = directAngle + this.flankSign * (Math.PI * 0.48);
            } else if (dist > preferredDist + 45) {
                desiredA = predAngle + this.flankOffset * 0.35;
            } else if (dist < preferredDist - 55) {
                desiredA = directAngle + Math.PI + this.flankSign * 0.42;
                spd = moveSpeed * 0.88;
            } else {
                desiredA = directAngle + this.flankSign * Math.PI * 0.5;
                spd = moveSpeed * 0.62;
            }
            const steered = this.computeSteeredAngle(desiredA, dist, game);
            this.vx = Math.cos(steered) * spd;
            this.vy = Math.sin(steered) * spd;

            if (this.attackTimer <= 0 && dist < 560 && hasLOS) {
                this.attackTimer = isL2 ? (this.baseAttackCooldown / 1.07) : this.baseAttackCooldown;
                this.triggerSquash(0.75, 1.3);
                const projSpeed = 230 * (isL2 ? 1.07 : 1.0);
                const projDamage = Math.round(14 * dmgMult);
                const aimA = Math.atan2(predY - this.y, predX - this.x);
                game.projectiles.push(new Projectile(
                    this.x + Math.cos(aimA) * (this.radius + 6),
                    this.y + Math.sin(aimA) * (this.radius + 6),
                    Math.cos(aimA) * projSpeed,
                    Math.sin(aimA) * projSpeed,
                    7, projDamage, '#c084fc', true
                ));
            }
        }

        // Separación táctica entre enemigos para rodear al jugador sin marchar en fila india
        if (!(this.archetype === 'VILLA' && this.chargeState === 'CHARGING') &&
            !(this.archetype === 'TANK' && this.jumpState === 'TELEGRAPH')) {
            for (const other of game.enemies) {
                if (other === this || other.dead) continue;
                const odx = this.x - other.x;
                const ody = this.y - other.y;
                const odist = Math.hypot(odx, ody);
                const minSep = this.radius + other.radius + 26;
                if (odist < minSep && odist > 0.01) {
                    const push = ((minSep - odist) / minSep) * 145;
                    this.vx += (odx / odist) * push;
                    this.vy += (ody / odist) * push;
                }
            }
        }

        this.updateBase(dt, game);
    }

    // ==========================================
    // COLOSO / TANQUE: Skin etesech.png (con fallback Golem acorazado)
    // ==========================================
    drawTank(ctx, player) {
        const t = this.animTime;
        const walk = Math.sin(t * 2.6 * Math.PI);          // ciclo de pasos lento y pesado
        const bob = Math.abs(walk) * 3.5;
        const wobble = walk * 0.085;                       // balanceo pesado al caminar (wobble)
        const facingLeft = player.x < this.x;
        const glow = 0.65 + Math.sin(t * 4) * 0.25;
        const flash = this.hitFlash > 0;

        // 1. Dibujar advertencia en el suelo (telegraph de 0.55s antes del salto)
        if (this.jumpState === 'TELEGRAPH') {
            ctx.save();
            const prog = 1 - MathUtils.clamp(this.jumpTimer / 0.55, 0, 1);
            ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
            ctx.fillStyle = `rgba(239, 68, 68, ${0.12 + prog * 0.18})`;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([7, 5]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, 150, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(12, 150 * prog), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 2. Dibujar ondas expansivas de anillo hueco de Ete Sech
        if (this.shockwaves && this.shockwaves.length > 0) {
            for (const sw of this.shockwaves) {
                ctx.save();
                const alpha = MathUtils.clamp(1 - (sw.radius / sw.maxRadius), 0, 1);
                ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
                ctx.shadowColor = '#a855f7';
                ctx.shadowBlur = 14;
                ctx.lineWidth = 6 * alpha + 2;
                ctx.beginPath();
                ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scaleX, this.scaleY);

        // Sombra grande bajo el Golem
        ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
        ctx.beginPath();
        const shadowScale = this.jumpZ > 0 ? Math.max(0.65, 1 - this.jumpZ / 160) : 1;
        ctx.ellipse(0, 44, this.radius * 1.45 * shadowScale, this.radius * 0.6 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        const jumpOffset = this.jumpZ || 0;

        if (typeof etesechImg !== 'undefined' && etesechImg.complete && etesechImg.naturalWidth > 0) {
            const imgSize = this.radius * 2.6;
            const halfSize = imgSize * 0.5;

            ctx.save();
            ctx.translate(0, -bob - jumpOffset);
            ctx.rotate(wobble);
            if (facingLeft) ctx.scale(-1, 1);

            // Aura exterior pesada morada/oscura
            ctx.save();
            ctx.strokeStyle = flash ? '#ffffff' : `rgba(147, 51, 234, ${0.55 + glow * 0.35})`;
            ctx.shadowColor = '#7e22ce';
            ctx.shadowBlur = flash ? 0 : 18;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, halfSize + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Recorte circular grande de etesech.png centrado en la posición del Golem
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, halfSize, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(etesechImg, -halfSize, -halfSize, imgSize, imgSize);

            // Parpadeo blanco (hit flash) al recibir daño
            if (flash) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.fillRect(-halfSize, -halfSize, imgSize, imgSize);
            }
            ctx.restore();

            // Borde oscuro/morado acorazado alrededor del círculo
            ctx.strokeStyle = flash ? '#ffffff' : '#3b0764';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(0, 0, halfSize, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = flash ? '#ffffff' : '#a855f7';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, halfSize - 2, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        } else {
            if (facingLeft) ctx.scale(-1, 1);

            const rock = flash ? '#ffffff' : '#1c1a24';
            const rockLight = flash ? '#ffffff' : '#2e2a3a';
            const rockDark = flash ? '#ffffff' : '#0e0d13';
            const crack = flash ? '#ffffff' : `rgba(255, ${Math.round(110 + glow * 60)}, 30, 1)`;

            const block = (x, y, w, h) => {
                ctx.fillStyle = rock;
                ctx.fillRect(x, y, w, h);
                ctx.fillStyle = rockLight;
                ctx.fillRect(x, y, w, 4);
                ctx.fillRect(x, y, 4, h);
                ctx.fillStyle = rockDark;
                ctx.fillRect(x, y + h - 5, w, 5);
                ctx.fillRect(x + w - 4, y, 4, h);
                ctx.strokeStyle = '#050508';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
            };

            // Piernas (alternan al caminar)
            block(-30, 20 - bob * (walk > 0 ? 1 : 0), 24, 28);
            block(6, 20 - bob * (walk < 0 ? 1 : 0), 24, 28);

            // Brazos masivos
            const armSwing = walk * 6;
            block(-56, -22 + armSwing, 20, 46);
            block(36, -22 - armSwing, 20, 46);
            // Puños
            block(-60, 20 + armSwing, 28, 20);
            block(32, 20 - armSwing, 28, 20);

            // Torso acorazado
            ctx.save();
            ctx.translate(0, -bob);
            block(-38, -36, 76, 62);

            // Placas de armadura de obsidiana
            ctx.fillStyle = rockLight;
            ctx.fillRect(-30, -28, 26, 20);
            ctx.fillRect(4, -28, 26, 20);
            ctx.strokeStyle = '#050508';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-30, -28, 26, 20);
            ctx.strokeRect(4, -28, 26, 20);

            // Grietas de lava brillantes
            ctx.save();
            ctx.strokeStyle = crack;
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = flash ? 0 : 10 * glow;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-20, -8); ctx.lineTo(-12, 4); ctx.lineTo(-22, 12); ctx.lineTo(-14, 24);
            ctx.moveTo(10, -10); ctx.lineTo(18, 2); ctx.lineTo(8, 10); ctx.lineTo(20, 22);
            ctx.moveTo(-2, -36); ctx.lineTo(2, -20);
            ctx.stroke();
            ctx.restore();

            // Cabeza
            block(-18, -62, 36, 30);
            // Ojos incandescentes
            ctx.save();
            ctx.fillStyle = crack;
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = flash ? 0 : 14;
            ctx.fillRect(-12, -52, 9, 6);
            ctx.fillRect(3, -52, 9, 6);
            ctx.restore();
            // Hombreras con púas
            block(-48, -42, 24, 16);
            block(24, -42, 24, 16);
            ctx.fillStyle = rockLight;
            ctx.beginPath();
            ctx.moveTo(-44, -42); ctx.lineTo(-38, -54); ctx.lineTo(-32, -42);
            ctx.moveTo(28, -42); ctx.lineTo(34, -54); ctx.lineTo(40, -42);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();

        // Barra de vida gruesa sobre la cabeza (siempre visible)
        const bw = 78;
        const bh = 10;
        const bx = this.x - bw / 2;
        const by = this.y - this.radius - 52;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#3f1d1d';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(bx, by, bw * MathUtils.clamp(this.hp / this.maxHp, 0, 1), bh);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(bx, by, bw * MathUtils.clamp(this.hp / this.maxHp, 0, 1), 3);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
    }

    // ==========================================
    // GÁRGOLA VELOZ: Procedural en Canvas (Alas articuladas, cuernos, ojos violeta/cian)
    // ==========================================
    drawGargoyle(ctx, player) {
        const t = this.animTime;
        const wingFlap = Math.sin(t * 22);
        const hoverBob = Math.sin(t * 8) * 4;
        const flash = this.hitFlash > 0;
        const facingLeft = player.x < this.x;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scaleX, this.scaleY);

        // Sombra en el suelo
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 20, this.radius * 1.15, this.radius * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();

        // Aura somnolienta violeta/oscura
        ctx.save();
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 4, 18 + Math.sin(t * 10) * 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Cuerpo flotante con oscilación
        ctx.save();
        ctx.translate(0, -4 + hoverBob);
        if (facingLeft) ctx.scale(-1, 1);

        const stoneDark = flash ? '#ffffff' : '#312e45';
        const stoneMid = flash ? '#ffffff' : '#4b5563';
        const stoneLight = flash ? '#ffffff' : '#64748b';
        const wingMembrane = flash ? '#ffffff' : '#3b0764';
        const wingRib = flash ? '#ffffff' : '#581c87';

        // Alas articuladas de murciélago (izquierda y derecha)
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate(side * 8, -4);
            ctx.rotate(side * (wingFlap * 0.55 - 0.15));

            // Membrana del ala
            ctx.fillStyle = wingMembrane;
            ctx.strokeStyle = wingRib;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(side * 22, -16 + wingFlap * 4);
            ctx.lineTo(side * 28, -2 + wingFlap * 6);
            ctx.quadraticCurveTo(side * 18, 8, side * 12, 12);
            ctx.quadraticCurveTo(side * 6, 6, 0, 8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Nervaduras y garra del ala
            ctx.strokeStyle = stoneLight;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(side * 20, -14 + wingFlap * 4);
            ctx.moveTo(side * 11, -7 + wingFlap * 2);
            ctx.lineTo(side * 17, 7);
            ctx.stroke();
            ctx.restore();
        }

        // Patas con garras de piedra
        ctx.fillStyle = stoneDark;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-8, 10, 5, 8);
        ctx.fillRect(3, 10, 5, 8);

        // Torso esculpido gris/violáceo
        ctx.fillStyle = stoneMid;
        ctx.strokeStyle = '#1e1b4b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, -7);
        ctx.lineTo(11, -7);
        ctx.lineTo(8, 11);
        ctx.lineTo(-8, 11);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Pecho cincelado
        ctx.fillStyle = stoneLight;
        ctx.fillRect(-7, -4, 5, 6);
        ctx.fillRect(2, -4, 5, 6);

        // Cabeza de gárgola
        ctx.fillStyle = stoneMid;
        ctx.strokeStyle = '#1e1b4b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -13, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cuernos afilados
        ctx.fillStyle = flash ? '#ffffff' : '#1e293b';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.2;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 5, -20);
            ctx.quadraticCurveTo(side * 13, -31, side * 8, -34);
            ctx.quadraticCurveTo(side * 7, -26, side * 2, -21);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Ojos brillantes violeta/cian
        ctx.save();
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.ellipse(-4, -13, 2.8, 2.0, -0.2, 0, Math.PI * 2);
        ctx.ellipse(4, -13, 2.8, 2.0, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#00f5d4';
        ctx.beginPath();
        ctx.arc(-4, -13, 1.3, 0, Math.PI * 2);
        ctx.arc(4, -13, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
        ctx.restore();

        // Barra de vida si está herida
        if (this.hp < this.maxHp) {
            const bw = 32;
            const bh = 4.5;
            const barY = this.y - 38;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(this.x - bw / 2, barY, bw, bh);
            ctx.fillStyle = '#c084fc';
            ctx.fillRect(this.x - bw / 2, barY, bw * (this.hp / this.maxHp), bh);
        }
    }

    // ==========================================
    // VILLA (Nivel 2): Skin villa.png + Telegraph de Patirrona Venenosa
    // ==========================================
    drawVilla(ctx, player) {
        const t = this.animTime;
        const isCharging = this.chargeState === 'CHARGING';
        const isMoving = Math.hypot(this.vx, this.vy) > 10 && !isCharging;
        const walkBob = isMoving ? Math.sin(t * 12) * 3 : Math.sin(t * 4) * 1.2;
        const flash = this.hitFlash > 0;
        const facingLeft = player.x < this.x;

        // 1. Indicador luminoso de trayectoria y distancia exacta al cargar ataque
        if (isCharging) {
            const chargeProg = 1 - MathUtils.clamp(this.chargeTimer / (this.chargeDuration || 0.85), 0, 1);
            const pulse = 0.45 + Math.sin(t * 34) * 0.25;
            const laneHalfW = this.patirronaRadius + 2;
            const range = this.patirronaRange || 460;
            const startOff = this.radius + 6;

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.chargeAngle);

            // Zona de peligro en el suelo
            ctx.fillStyle = `rgba(57, 255, 20, ${0.12 + chargeProg * 0.20})`;
            ctx.fillRect(startOff, -laneHalfW, range, laneHalfW * 2);

            // Barra de relleno progresivo indicando el instante exacto del disparo
            ctx.fillStyle = `rgba(57, 255, 20, ${0.22 * pulse})`;
            ctx.fillRect(startOff, -laneHalfW * 0.65, range * chargeProg, laneHalfW * 1.3);

            // Bordes exteriores y línea central discontinua de trayectoria
            ctx.strokeStyle = `rgba(57, 255, 20, ${0.65 + chargeProg * 0.35})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(startOff, -laneHalfW, range, laneHalfW * 2);

            ctx.setLineDash([10, 7]);
            ctx.beginPath();
            ctx.moveTo(startOff, 0);
            ctx.lineTo(startOff + range, 0);
            ctx.stroke();
            ctx.setLineDash([]);

            // Retícula de distancia máxima donde terminará el proyectil
            ctx.beginPath();
            ctx.arc(startOff + range, 0, laneHalfW + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scaleX, this.scaleY);

        // Sombra
        ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
        ctx.beginPath();
        ctx.ellipse(0, 20, this.radius * 1.3, this.radius * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        // Aura verde tóxica/oscura
        const auraR = 26 + Math.sin(t * (isCharging ? 18 : 7)) * 2.5;
        const auraCol = isCharging ? '#39ff14' : '#16a34a';
        ctx.save();
        ctx.strokeStyle = auraCol;
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = isCharging ? 20 : 12;
        ctx.lineWidth = isCharging ? 3.5 : 2.2;
        ctx.beginPath();
        ctx.arc(0, -walkBob, auraR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Cuerpo de Villa (villa.png)
        const vSize = 58;
        const vRad = vSize * 0.5;
        ctx.save();
        ctx.translate(0, -walkBob);
        if (typeof villaImg !== 'undefined' && villaImg.complete && villaImg.naturalWidth > 0) {
            ctx.fillStyle = '#052e16';
            ctx.beginPath();
            ctx.arc(0, 0, vRad, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, vRad, 0, Math.PI * 2);
            ctx.clip();
            if (facingLeft) ctx.scale(-1, 1);
            ctx.drawImage(villaImg, -vRad, -vRad, vSize, vSize);
            if (flash) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fillRect(-vRad, -vRad, vSize, vSize);
            }
            ctx.restore();

            ctx.strokeStyle = flash ? '#ffffff' : auraCol;
            ctx.lineWidth = isCharging ? 3.5 : 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, vRad, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Fallback procedural verde tóxico
            ctx.fillStyle = flash ? '#ffffff' : '#14532d';
            ctx.strokeStyle = auraCol;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
        ctx.restore();

        // Indicador "CARGANDO..." o barra de vida
        if (isCharging) {
            ctx.save();
            ctx.font = '900 10px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2.5;
            ctx.strokeText('¡PATIRRONA!', this.x, this.y - 42);
            ctx.fillStyle = '#39ff14';
            ctx.fillText('¡PATIRRONA!', this.x, this.y - 42);
            ctx.restore();
        }

        if (this.hp < this.maxHp) {
            const bw = 36;
            const bh = 4.5;
            const barY = this.y - 38;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(this.x - bw / 2, barY, bw, bh);
            ctx.fillStyle = '#39ff14';
            ctx.fillRect(this.x - bw / 2, barY, bw * MathUtils.clamp(this.hp / this.maxHp, 0, 1), bh);
        }
    }

    draw(ctx, player) {
        if (this.archetype === 'TANK') { this.drawTank(ctx, player); return; }
        if (this.archetype === 'GARGOYLE') { this.drawGargoyle(ctx, player); return; }
        if (this.archetype === 'VILLA') { this.drawVilla(ctx, player); return; }
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scaleX, this.scaleY);

        const facingLeft = player.x < this.x;
        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);

        if (this.archetype === 'CHASER') {
            // ==========================================
            // ENEMIGO CUERPO A CUERPO / PERSEGUIDOR (melee.png)
            // ==========================================
            // Sombra elíptica
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.ellipse(0, 16, this.radius * 1.3, this.radius * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();

            // Aura circular roja agresiva debajo/alrededor para distinguir rol de melé
            const auraPulse = 20 + Math.sin(this.animTime * 9) * 3;
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(0, 4, auraPulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
            ctx.fill();
            ctx.restore();

            if (meleeImg.complete && meleeImg.naturalWidth > 0) {
                const mSize = 60;
                const walkWobble = Math.sin(this.animTime * 11) * 0.08;
                const walkBob = Math.abs(Math.sin(this.animTime * 11)) * 3;

                ctx.save();
                ctx.translate(0, -walkBob);
                ctx.rotate(walkWobble);

                // Voltear horizontalmente según hacia dónde mira el jugador
                if (facingLeft) {
                    ctx.scale(-1, 1);
                }

                ctx.drawImage(meleeImg, -mSize * 0.5, -mSize * 0.5, mSize, mSize);

                // Hit flash blanco al recibir daño
                if (this.hitFlash > 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'source-atop';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    ctx.fillRect(-mSize * 0.5, -mSize * 0.5, mSize, mSize);
                    ctx.restore();
                }

                ctx.restore();
            } else {
                // Fallback procedural de Bestia carmesí
                const wobble = Math.sin(this.animTime * 11) * 0.1;
                ctx.rotate(wobble);

                ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#f43f5e';
                ctx.strokeStyle = '#4c0519';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#fda4af';
                for (const dir of [-0.6, 0.6]) {
                    const hx = Math.cos(angleToPlayer + dir) * (this.radius - 2);
                    const hy = Math.sin(angleToPlayer + dir) * (this.radius - 2);
                    ctx.beginPath();
                    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
                    ctx.fill();
                }

                const ex = Math.cos(angleToPlayer) * 5;
                const ey = Math.sin(angleToPlayer) * 5;
                ctx.fillStyle = '#090d16';
                ctx.beginPath();
                ctx.arc(ex, ey, 6, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fde047';
                ctx.beginPath();
                ctx.arc(ex + Math.cos(angleToPlayer) * 2, ey + Math.sin(angleToPlayer) * 2, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // ==========================================
            // ENEMIGO TIRADOR / LARGA DISTANCIA (ranged.png - JOKER)
            // ==========================================
            // Sombra elíptica
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.ellipse(0, 16, this.radius * 1.25, this.radius * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();

            const floatBob = Math.sin(this.animTime * 6) * 3;
            const isAboutToShoot = this.attackTimer < 0.45 && this.attackTimer >= 0;
            const borderColor = isAboutToShoot ? '#39ff14' : '#a855f7';
            const glowIntensity = isAboutToShoot ? 24 : 10;

            if (rangedImg.complete && rangedImg.naturalWidth > 0) {
                const rSize = 54;
                const rRadius = rSize * 0.5;

                ctx.save();
                ctx.translate(0, floatBob);

                // Borde brillante verde tóxico (#39ff14) o púrpura (#a855f7)
                ctx.strokeStyle = borderColor;
                ctx.shadowColor = borderColor;
                ctx.shadowBlur = glowIntensity;
                ctx.lineWidth = isAboutToShoot ? 4 : 2.5;

                ctx.beginPath();
                ctx.arc(0, 0, rRadius + 1.5, 0, Math.PI * 2);
                ctx.stroke();

                // Fondo oscuro base
                ctx.fillStyle = '#0f172a';
                ctx.fill();

                // Recorte en círculo limpio (ctx.clip)
                ctx.save();
                ctx.beginPath();
                ctx.arc(0, 0, rRadius, 0, Math.PI * 2);
                ctx.clip();

                // Dibujar imagen centrada
                if (facingLeft) {
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(rangedImg, -rRadius, -rRadius, rSize, rSize);

                // Hit flash blanco al recibir daño
                if (this.hitFlash > 0) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    ctx.fillRect(-rRadius, -rRadius, rSize, rSize);
                }
                ctx.restore();

                ctx.restore();
            } else {
                // Fallback procedural de Acólito Arcano
                ctx.save();
                ctx.translate(0, floatBob);

                ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#9333ea';
                ctx.strokeStyle = borderColor;
                ctx.shadowColor = borderColor;
                ctx.shadowBlur = glowIntensity;
                ctx.lineWidth = isAboutToShoot ? 3.5 : 2.5;

                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + this.animTime;
                    const r = i % 2 === 0 ? this.radius + 2 : this.radius - 2;
                    const px = Math.cos(a) * r;
                    const py = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                const ex = Math.cos(angleToPlayer) * 5;
                const ey = Math.sin(angleToPlayer) * 5;
                ctx.fillStyle = '#090d16';
                ctx.beginPath();
                ctx.arc(ex, ey, 6, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#38bdf8';
                ctx.beginPath();
                ctx.arc(ex + Math.cos(angleToPlayer) * 2, ey + Math.sin(angleToPlayer) * 2, 2.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        }

        ctx.restore();

        // Barra de vida sobre el enemigo si está herido
        if (this.hp < this.maxHp) {
            const bw = 32;
            const bh = 4.5;
            const barY = this.y - 34;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(this.x - bw / 2, barY, bw, bh);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(this.x - bw / 2, barY, bw * (this.hp / this.maxHp), bh);
        }
    }
}
