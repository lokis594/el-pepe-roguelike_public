/**
 * ============================================================================
 * CLASE ENEMIGO: PERSEGUIDORES Y TIRADORES
 * ============================================================================
 */
class Enemy extends Entity {
    constructor(x, y, archetype = 'CHASER', waveIndex = 1) {
        const isChaser = archetype === 'CHASER';
        const radius = archetype === 'TANK' ? 32 : (isChaser ? 16 : 18);
        const hp = archetype === 'TANK'
            ? 4 * (48 + (waveIndex - 1) * 12) // 4x la vida de un melee normal
            : (isChaser ? 48 : 38) + (waveIndex - 1) * 12;
        super(x, y, radius, hp);

        this.archetype = archetype; // 'CHASER' | 'SHOOTER' | 'TANK'
        this.waveIndex = waveIndex;
        this.speed = archetype === 'TANK' ? MathUtils.randRange(58, 70) : (isChaser ? MathUtils.randRange(138, 168) : MathUtils.randRange(95, 115));
        this.contactDamage = archetype === 'TANK' ? 8 : (isChaser ? 16 : 10); // Tanque: la mitad del daño normal
        this.attackCooldown = isChaser ? 0.8 : MathUtils.randRange(1.7, 2.3);
        this.attackTimer = MathUtils.randRange(0.4, 1.2);
        this.kbMult = archetype === 'TANK' ? 0.3 : 1; // Tanque: 70% menos retroceso
        this.stepPhase = 0;
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
        game.spawnParticles(this.x, this.y, isCrit ? 14 : 8, this.archetype === 'TANK' ? '#f97316' : (this.archetype === 'CHASER' ? '#f43f5e' : '#a855f7'), 160, true);

        if (this.hp <= 0) {
            this.dead = true;
            game.onEnemyKilled(this);
        }
    }

    update(dt, game) {
        const player = game.player;
        if (player.dead) return;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        this.attackTimer -= dt;

        if (this.archetype === 'CHASER' || this.archetype === 'TANK') {
            // Pasos pesados del Coloso
            if (this.archetype === 'TANK') {
                const ph = Math.floor(this.animTime * 2.6);
                if (ph !== this.stepPhase) {
                    this.stepPhase = ph;
                    if (dist < 650) {
                        soundManager.playHeavyStep();
                        game.addScreenShake(2.2, 0.09);
                        game.spawnParticles(this.x, this.y + this.radius * 0.8, 4, '#6b7280', 70, false);
                    }
                }
            }
            // IA Perseguidor: Avanza agresivamente cuerpo a cuerpo
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;

            if (MathUtils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
                const hit = player.takeDamage(this.contactDamage, this.x, this.y, 260, game);
                if (hit) {
                    this.applyKnockback(player.x, player.y, 220);
                }
            }
        } else {
            // IA Tirador: Mantiene distancia óptima y dispara proyectiles lentos
            const preferredDist = 260;
            if (dist > preferredDist + 45) {
                this.vx = Math.cos(angle) * this.speed;
                this.vy = Math.sin(angle) * this.speed;
            } else if (dist < preferredDist - 55) {
                this.vx = -Math.cos(angle) * (this.speed * 0.85);
                this.vy = -Math.sin(angle) * (this.speed * 0.85);
            } else {
                // Movimiento orbital lateral
                this.vx = Math.cos(angle + Math.PI * 0.5) * (this.speed * 0.6);
                this.vy = Math.sin(angle + Math.PI * 0.5) * (this.speed * 0.6);
            }

            if (this.attackTimer <= 0 && dist < 560) {
                this.attackTimer = this.attackCooldown;
                this.triggerSquash(0.75, 1.3);
                const projSpeed = 230;
                game.projectiles.push(new Projectile(
                    this.x + Math.cos(angle) * (this.radius + 6),
                    this.y + Math.sin(angle) * (this.radius + 6),
                    Math.cos(angle) * projSpeed,
                    Math.sin(angle) * projSpeed,
                    7, 14, '#c084fc', true
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
    // COLOSO / TANQUE: Golem acorazado de obsidiana con grietas brillantes
    // ==========================================
    drawTank(ctx, player) {
        const t = this.animTime;
        const walk = Math.sin(t * 2.6 * Math.PI);          // ciclo de pasos lento y pesado
        const bob = Math.abs(walk) * 3;
        const facingLeft = player.x < this.x;
        const glow = 0.65 + Math.sin(t * 4) * 0.25;
        const flash = this.hitFlash > 0;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scaleX, this.scaleY);

        // Sombra grande
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 46, this.radius * 1.45, this.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

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

    draw(ctx, player) {
        if (this.archetype === 'TANK') { this.drawTank(ctx, player); return; }
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
