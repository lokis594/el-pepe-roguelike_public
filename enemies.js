/**
 * ============================================================================
 * CLASE ENEMIGO: PERSEGUIDORES Y TIRADORES
 * ============================================================================
 */
class Enemy extends Entity {
    constructor(x, y, archetype = 'CHASER', waveIndex = 1, level = 1) {
        const isChaser = archetype === 'CHASER';
        const isGargoyle = archetype === 'GARGOYLE';
        const radius = archetype === 'TANK' ? 32 : (isGargoyle ? 15 : (isChaser ? 16 : 18));
        const hp = archetype === 'TANK'
            ? 4 * (48 + (waveIndex - 1) * 12) // 4x la vida de un melee normal
            : (isGargoyle ? (36 + (waveIndex - 1) * 10) : ((isChaser ? 48 : 38) + (waveIndex - 1) * 12));
        super(x, y, radius, hp);

        this.archetype = archetype; // 'CHASER' | 'SHOOTER' | 'TANK' | 'GARGOYLE'
        this.waveIndex = waveIndex;
        this.level = level;
        this.baseSpeed = isGargoyle
            ? (245 * 1.25) // Gárgola Veloz: 25% más rápida que la velocidad base del jugador
            : (archetype === 'TANK' ? MathUtils.randRange(58, 70) : (isChaser ? MathUtils.randRange(138, 168) : MathUtils.randRange(95, 115)));
        this.speed = isGargoyle ? this.baseSpeed : (this.baseSpeed * (level === 2 ? 1.15 : 1.0));
        this.baseContactDamage = isGargoyle ? 0 : (archetype === 'TANK' ? 8 : (isChaser ? 16 : 10)); // Gárgola: 0 daño directo
        this.contactDamage = Math.round(this.baseContactDamage * (level === 2 ? 1.10 : 1.0));
        this.baseAttackCooldown = isGargoyle ? 0.65 : (isChaser ? 0.8 : MathUtils.randRange(1.7, 2.3));
        this.attackCooldown = (!isChaser && !isGargoyle && level === 2) ? (this.baseAttackCooldown / 1.07) : this.baseAttackCooldown;
        this.attackTimer = MathUtils.randRange(0.4, 1.2);
        this.gargoyleHitCooldown = 0;
        this.kbMult = archetype === 'TANK' ? 0.3 : 1; // Tanque: 70% menos retroceso
        this.stepPhase = 0;

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
        const pColor = this.archetype === 'TANK' ? '#f97316' : (this.archetype === 'GARGOYLE' ? '#818cf8' : (this.archetype === 'CHASER' ? '#f43f5e' : '#a855f7'));
        game.spawnParticles(this.x, this.y, isCrit ? 14 : 8, pColor, 160, true);

        if (this.hp <= 0) {
            this.dead = true;
            game.onEnemyKilled(this);
        }
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
        const angle = Math.atan2(dy, dx);

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

        if (this.archetype === 'GARGOYLE') {
            // IA Gárgola Veloz: persigue rápidamente (1.25x base jugador), 0 daño directo, duerme en 2 golpes seguidos
            const gargoyleSpeed = (player.baseSpeed || 245) * 1.25;
            this.vx = Math.cos(angle) * gargoyleSpeed;
            this.vy = Math.sin(angle) * gargoyleSpeed;

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
                // Lógica del Salto Sísmico periódico de Ete Sech
                if (this.jumpState === 'TELEGRAPH') {
                    this.vx = 0;
                    this.vy = 0;
                    this.jumpTimer -= dt;
                    if (this.jumpTimer <= 0) {
                        this.jumpState = 'JUMPING';
                        this.jumpMaxTime = 0.36;
                        this.jumpTimer = this.jumpMaxTime;
                        this.triggerSquash(0.76, 1.32);
                    }
                } else if (this.jumpState === 'JUMPING') {
                    this.jumpTimer -= dt;
                    this.vx = Math.cos(angle) * moveSpeed * 0.65;
                    this.vy = Math.sin(angle) * moveSpeed * 0.65;
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
                    this.jumpCooldownTimer -= dt;
                    if (this.jumpCooldownTimer <= 0 && dist < 340) {
                        this.jumpState = 'TELEGRAPH';
                        this.jumpTimer = 0.55;
                        this.vx = 0;
                        this.vy = 0;
                        this.triggerSquash(1.28, 0.72);
                    } else {
                        // Pasos pesados del Coloso
                        const ph = Math.floor(this.animTime * 2.6);
                        if (ph !== this.stepPhase) {
                            this.stepPhase = ph;
                            if (dist < 650) {
                                soundManager.playHeavyStep();
                                game.addScreenShake(2.2, 0.09);
                                game.spawnParticles(this.x, this.y + this.radius * 0.8, 4, '#6b7280', 70, false);
                            }
                        }
                        this.vx = Math.cos(angle) * moveSpeed;
                        this.vy = Math.sin(angle) * moveSpeed;
                    }
                }
            } else {
                // IA Perseguidor: Avanza agresivamente cuerpo a cuerpo
                this.vx = Math.cos(angle) * moveSpeed;
                this.vy = Math.sin(angle) * moveSpeed;
            }

            if (this.jumpState !== 'JUMPING' && MathUtils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
                const hit = player.takeDamage(contactDmg, this.x, this.y, 260, game);
                if (hit) {
                    this.applyKnockback(player.x, player.y, 220);
                }
            }
        } else {
            // IA Tirador (Jokers): Mantiene distancia óptima y dispara proyectiles
            const preferredDist = 260;
            if (dist > preferredDist + 45) {
                this.vx = Math.cos(angle) * moveSpeed;
                this.vy = Math.sin(angle) * moveSpeed;
            } else if (dist < preferredDist - 55) {
                this.vx = -Math.cos(angle) * (moveSpeed * 0.85);
                this.vy = -Math.sin(angle) * (moveSpeed * 0.85);
            } else {
                // Movimiento orbital lateral
                this.vx = Math.cos(angle + Math.PI * 0.5) * (moveSpeed * 0.6);
                this.vy = Math.sin(angle + Math.PI * 0.5) * (moveSpeed * 0.6);
            }

            if (this.attackTimer <= 0 && dist < 560) {
                this.attackTimer = isL2 ? (this.baseAttackCooldown / 1.07) : this.baseAttackCooldown;
                this.triggerSquash(0.75, 1.3);
                const projSpeed = 230 * (isL2 ? 1.07 : 1.0);
                const projDamage = Math.round(14 * dmgMult);
                game.projectiles.push(new Projectile(
                    this.x + Math.cos(angle) * (this.radius + 6),
                    this.y + Math.sin(angle) * (this.radius + 6),
                    Math.cos(angle) * projSpeed,
                    Math.sin(angle) * projSpeed,
                    7, projDamage, '#c084fc', true
                ));
            }
        }

        // Separación suave entre enemigos para evitar que se apilen en un mismo punto
        for (const other of game.enemies) {
            if (other === this || other.dead) continue;
            const odx = this.x - other.x;
            const ody = this.y - other.y;
            const odist = Math.hypot(odx, ody);
            const minSep = this.radius + other.radius + 4;
            if (odist < minSep && odist > 0.01) {
                this.vx += (odx / odist) * 90;
                this.vy += (ody / odist) * 90;
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

    draw(ctx, player) {
        if (this.archetype === 'TANK') { this.drawTank(ctx, player); return; }
        if (this.archetype === 'GARGOYLE') { this.drawGargoyle(ctx, player); return; }
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
