/**
 * ============================================================================
 * UTILIDADES MATEMÁTICAS Y GEOMÉTRICAS
 * ============================================================================
 */
const MathUtils = {
    lerp: (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t)),
    clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
    randRange: (min, max) => Math.random() * (max - min) + min,
    randInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    
    // Normaliza un ángulo al rango [-PI, PI]
    normalizeAngle: (angle) => {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    },

    // Colisión estricta Círculo - Círculo
    circleCollide: (x1, y1, r1, x2, y2, r2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const rSum = r1 + r2;
        return (dx * dx + dy * dy) <= (rSum * rSum);
    },

    // Colisión Sector Circular (Arco de espada) contra Círculo (Entidad/Pilar)
    sectorCircleCollide: (sx, sy, innerRadius, outerRadius, centerAngle, halfArcAngle, cx, cy, cr) => {
        const dx = cx - sx;
        const dy = cy - sy;
        const distSq = dx * dx + dy * dy;
        const maxDist = outerRadius + cr;
        if (distSq > maxDist * maxDist) return false;
        
        const dist = Math.sqrt(distSq);
        if (dist < Math.max(0, innerRadius - cr)) return false;

        // Si el círculo objetivo solapa el origen mismo del tajo
        if (dist <= cr) return true;

        const angleToTarget = Math.atan2(dy, dx);
        const angleDiff = Math.abs(MathUtils.normalizeAngle(angleToTarget - centerAngle));
        // Margen angular considerando el radio del objetivo a esa distancia
        const angularPadding = Math.asin(Math.min(1, cr / dist));

        return angleDiff <= (halfArcAngle + angularPadding);
    }
};

/**
 * ============================================================================
 * SISTEMA DE PARTÍCULAS Y TEXTO FLOTANTE
 * ============================================================================
 */
class Particle {
    constructor(x, y, vx, vy, radius, color, life, friction = 0.92, glow = false, isSquare = false) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.initialRadius = radius;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.friction = friction;
        this.glow = glow;
        this.isSquare = isSquare;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const damp = Math.pow(this.friction, dt * 60);
        this.vx *= damp;
        this.vy *= damp;
        this.life -= dt;
        this.radius = Math.max(0.1, this.initialRadius * (this.life / this.maxLife));
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        const alpha = MathUtils.clamp(this.life / this.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        if (this.glow) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
        }
        ctx.fillStyle = this.color;
        if (this.isSquare) {
            ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

class FloatingText {
    constructor(x, y, text, color = '#ffffff', size = 16, isCrit = false) {
        this.x = x + MathUtils.randRange(-10, 10);
        this.y = y;
        this.vy = isCrit ? -85 : -55;
        this.vx = MathUtils.randRange(-25, 25);
        this.text = text;
        this.color = color;
        this.size = isCrit ? size + 5 : size;
        this.life = isCrit ? 0.95 : 0.7;
        this.maxLife = this.life;
        this.isCrit = isCrit;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 90 * dt; // ligera gravedad al subir
        this.life -= dt;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        const progress = 1 - (this.life / this.maxLife);
        const scale = this.isCrit ? (1 + Math.sin(progress * Math.PI) * 0.35) : 1;
        ctx.globalAlpha = MathUtils.clamp(this.life / (this.maxLife * 0.4), 0, 1);
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);
        ctx.font = `900 ${this.size}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.text, 0, 0);
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
    }
}

/**
 * ============================================================================
 * ELEMENTOS DEL ENTORNO: PILARES, ORBES DE BOTÍN Y PROYECTILES
 * ============================================================================
 */
class Pillar {
    constructor(x, y, radius = 34, destructible = true) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.destructible = destructible;
        this.maxHp = 90;
        this.hp = this.maxHp;
        this.hitFlash = 0;
        this.dead = false;
    }

    takeDamage(amount, game) {
        if (!this.destructible || this.dead) return;
        this.hp -= amount;
        this.hitFlash = 0.12;
        game.spawnParticles(this.x, this.y, 7, '#64748b', 110);
        if (this.hp <= 0) {
            this.dead = true;
            game.spawnParticles(this.x, this.y, 24, '#94a3b8', 190);
            game.addScreenShake(5, 0.18);
        }
    }

    update(dt) {
        if (this.hitFlash > 0) this.hitFlash -= dt;
    }

    draw(ctx) {
        if (this.dead) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        const r = this.radius;

        // Sombra proyectada cuadrada / voxel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(-r + 4, -r + 6, r * 2, r * 2);

        // Bloque sólido estilo Minecraft Deep Slate / Cobblestone
        ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#26282e';
        ctx.strokeStyle = '#18191c';
        ctx.lineWidth = 3;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.strokeRect(-r, -r, r * 2, r * 2);

        // Relieve superior/interior de los ladrillos del pilar
        ctx.fillStyle = this.hitFlash > 0 ? '#e2e8f0' : '#383b45';
        ctx.fillRect(-r + 3, -r + 3, r * 2 - 6, r * 2 - 6);

        // Patrón de bloques de piedra labrada interna
        ctx.strokeStyle = '#1a1b1f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Línea central horizontal
        ctx.moveTo(-r + 3, 0);
        ctx.lineTo(r - 3, 0);
        // Ladrillos escalonados
        ctx.moveTo(0, -r + 3);
        ctx.lineTo(0, 0);
        ctx.moveTo(-r * 0.5, 0);
        ctx.lineTo(-r * 0.5, r - 3);
        ctx.moveTo(r * 0.5, 0);
        ctx.lineTo(r * 0.5, r - 3);
        ctx.stroke();

        // Píxeles de musgo estilo Mossy Cobble en esquinas
        ctx.fillStyle = '#4a6b3b';
        ctx.fillRect(-r + 3, -r + 3, 8, 6);
        ctx.fillRect(r - 11, r - 9, 8, 6);
        ctx.fillStyle = '#38522b';
        ctx.fillRect(-r + 5, -r + 5, 4, 4);

        // Grietas procedurales pixeladas si está dañado
        const dmgRatio = 1 - (this.hp / this.maxHp);
        if (dmgRatio > 0.25) {
            ctx.strokeStyle = '#0f1012';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-12, -10);
            ctx.lineTo(-4, 0);
            ctx.lineTo(6, -2);
            ctx.lineTo(14, 8);
            if (dmgRatio > 0.6) {
                ctx.moveTo(-4, 0);
                ctx.lineTo(-8, 14);
                ctx.lineTo(2, 16);
            }
            ctx.stroke();
        }

        ctx.restore();
    }
}

// Helpers visuales reutilizables para Bolsa de Oro y Frascos de Poción
function drawGoldBagIcon(ctx, x, y, r = 10) {
    ctx.save();
    ctx.translate(x, y);
    // Moño superior de la bolsita
    ctx.fillStyle = '#eab308';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.65);
    ctx.lineTo(-r * 0.65, -r * 1.15);
    ctx.lineTo(0, -r * 0.92);
    ctx.lineTo(r * 0.65, -r * 1.15);
    ctx.lineTo(r * 0.45, -r * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cuerpo redondo dorado (#ffd700) con borde oscuro
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, r * 0.1, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cuerda atada en el cuello de la bolsa
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.48, -r * 0.58);
    ctx.lineTo(r * 0.48, -r * 0.58);
    ctx.stroke();

    // Brillo especular
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Símbolo '$' en el centro
    ctx.fillStyle = '#451a03';
    ctx.font = `900 ${Math.max(8, Math.round(r * 1.05))}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, r * 0.16);
    ctx.restore();
}

function drawPotionFlask(ctx, x, y, r = 10, color = '#4ade80') {
    ctx.save();
    ctx.translate(x, y);
    // Corcho superior
    ctx.fillStyle = '#a16207';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-r * 0.24, -r * 1.05, r * 0.48, r * 0.28);
    ctx.strokeRect(-r * 0.24, -r * 1.05, r * 0.48, r * 0.28);

    // Cuello de cristal
    ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;
    ctx.fillRect(-r * 0.30, -r * 0.77, r * 0.60, r * 0.36);
    ctx.strokeRect(-r * 0.30, -r * 0.77, r * 0.60, r * 0.36);

    // Bulbo del frasco (cristal + líquido brillante)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, r * 0.18, r * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Líquido interior coloreado
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, r * 0.22, r * 0.62, 0.08 * Math.PI, 0.92 * Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 0.60, r * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();

    // Reflejo de cristal
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.arc(-r * 0.26, -r * 0.02, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

class PickupOrb {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = (type || 'HEAL').toUpperCase(); // 'GOLD' | 'HEAL' | 'FURY' | 'HASTE'
        this.radius = this.type === 'GOLD' ? 12 : 11;
        this.time = Math.random() * Math.PI * 2;
        this.life = this.type === 'GOLD' ? 28.0 : 12.0;
        this.dead = false;
    }

    update(dt, player, game) {
        this.time += dt;
        this.life -= dt;
        if (this.life <= 0) {
            this.dead = true;
            return;
        }

        // Atracción magnética hacia el jugador cuando está cerca
        const pullRadius = this.type === 'GOLD' ? 150 : 130;
        const d = MathUtils.dist(this.x, this.y, player.x, player.y);
        if (d < pullRadius) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const pullSpeed = (1 - d / pullRadius) * 340;
            this.x += Math.cos(angle) * pullSpeed * dt;
            this.y += Math.sin(angle) * pullSpeed * dt;
        }

        if (MathUtils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
            this.applyEffect(player, game);
            this.dead = true;
        }
    }

    applyEffect(player, game) {
        if (this.type === 'GOLD') {
            player.gold = (player.gold || 0) + 1;
            game.floatingTexts.push(new FloatingText(player.x, player.y - 22, '+1 ORO', '#ffd700', 16, true));
            game.spawnParticles(this.x, this.y, 12, '#ffd700', 135, true);
            soundManager.playGoldPickup();
            return;
        }
        if (this.type === 'HEAL') {
            const healAmt = 25;
            player.hp = Math.min(player.maxHp, player.hp + healAmt);
            game.floatingTexts.push(new FloatingText(player.x, player.y - 20, `+${healAmt} HP`, '#4ade80', 16));
            game.spawnParticles(this.x, this.y, 15, '#4ade80', 140, true);
        } else if (this.type === 'FURY') {
            player.damageBoostTimer = 8.0;
            game.floatingTexts.push(new FloatingText(player.x, player.y - 20, `¡DAÑO +40%!`, '#fbbf24', 16, true));
            game.spawnParticles(this.x, this.y, 15, '#fbbf24', 150, true);
        } else if (this.type === 'HASTE') {
            player.speedBoostTimer = 8.0;
            game.floatingTexts.push(new FloatingText(player.x, player.y - 20, `¡VELOCIDAD +30%!`, '#38bdf8', 16, true));
            game.spawnParticles(this.x, this.y, 15, '#38bdf8', 150, true);
        }
        soundManager.playPickup();
    }

    draw(ctx) {
        ctx.save();
        const bob = Math.sin(this.time * 6) * 4;
        ctx.translate(this.x, this.y + bob);

        // Parpadeo al estar por desaparecer
        if (this.life < 2.5 && Math.floor(this.life * 10) % 2 === 0) {
            ctx.globalAlpha = 0.35;
        }

        if (this.type === 'GOLD') {
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#ffd700';
            drawGoldBagIcon(ctx, 0, 0, 11);
            ctx.restore();
            return;
        }

        let color = '#4ade80';
        if (this.type === 'FURY') color = '#fbbf24';
        if (this.type === 'HASTE') color = '#38bdf8';

        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-3, -3, this.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

const ItemPickup = PickupOrb;

class GunPickup {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 16;
        this.time = 0;
        this.life = 60.0;
        this.kind = arguments[2] || 'GUN'; // 'GUN' | 'RIFLE'
        this.dead = false;
    }

    update(dt, player, game) {
        this.time += dt;
        this.life -= dt;
        if (this.life <= 0) {
            this.dead = true;
            return;
        }

        const d = MathUtils.dist(this.x, this.y, player.x, player.y);
        if (d < 130) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const pullSpeed = (1 - d / 130) * 320;
            this.x += Math.cos(angle) * pullSpeed * dt;
            this.y += Math.sin(angle) * pullSpeed * dt;
        }

        if (MathUtils.circleCollide(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
            if (this.kind === 'RIFLE') {
                const alreadyHadRifle = player.hasRifle;
                player.hasRifle = true;
                // Sin duplicados: si ya lo tenía no se fuerza el cambio de arma
                if (!alreadyHadRifle) {
                    player.currentWeapon = 'RIFLE';
                    game.floatingTexts.push(new FloatingText(player.x, player.y - 35, '¡RIFLE DE ASALTO DESBLOQUEADO!', '#fbbf24', 18, true));
                    soundManager.playPickup();
                }
                game.spawnParticles(this.x, this.y, 25, '#fbbf24', 180, true);
                this.dead = true;
                return;
            }
            const alreadyHadGun = player.hasGun;
            player.hasGun = true;
            // No forzar cambio si el jugador ya tenía la pistola desbloqueada
            if (!alreadyHadGun) {
                player.currentWeapon = 'GUN';
                game.floatingTexts.push(new FloatingText(player.x, player.y - 35, '¡PISTOLA DESBLOQUEADA!', '#38bdf8', 18, true));
                soundManager.playPickup();
            }
            game.spawnParticles(this.x, this.y, 25, '#38bdf8', 180, true);
            this.dead = true;
        }
    }

    draw(ctx) {
        ctx.save();
        const bob = Math.sin(this.time * 5) * 5;
        ctx.translate(this.x, this.y + bob);

        // Brillo neón azul/dorado pulsante
        const glowPulse = 14 + Math.sin(this.time * 8) * 6;
        ctx.shadowBlur = glowPulse;
        ctx.shadowColor = '#38bdf8';

        // Pedestal/Aura base
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
        ctx.fill();

        // Dibujo procedural del arma (Pistola)
        ctx.save();
        ctx.rotate(-0.25);
        if (this.kind === 'RIFLE') {
            ctx.fillStyle = '#111827';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.2;
            ctx.fillRect(-14, -4, 38, 8);
            ctx.strokeRect(-14, -4, 38, 8);
            ctx.fillRect(-6, 4, 5, 10);
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(4, 4, 6, 9);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(24, -2, 8, 4);
            ctx.globalAlpha = 0; // oculta la silueta de pistola
        }
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-3, 2, 7, 12);
        ctx.strokeRect(-3, 2, 7, 12);

        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-6, -6, 20, 8);
        ctx.strokeRect(-6, -6, 20, 8);

        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(14, -5, 4, 6);
        ctx.restore();

        // Etiqueta flotante "PISTOLA"
        ctx.font = '900 11px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const tagText = this.kind === 'RIFLE' ? 'RIFLE DE ASALTO' : 'PISTOLA';
        const textMetrics = ctx.measureText(tagText);
        const tagW = textMetrics.width + 12;
        const tagH = 15;
        const tagY = -22;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-tagW / 2, tagY - tagH, tagW, tagH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(tagText, 0, tagY - 2);

        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, vx, vy, radius, damage, color, isEnemy = true, wordText = null) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.damage = damage;
        this.color = color;
        this.isEnemy = isEnemy;
        this.wordText = wordText;
        this.angle = Math.atan2(vy, vx);
        this.spin = 0;
        this.spinSpeed = wordText ? (Math.random() < 0.5 ? 1 : -1) * MathUtils.randRange(1.8, 3.6) : 0;
        this.dead = false;
        this.life = 5.5;
    }

    update(dt, game) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.spin += this.spinSpeed * dt;
        this.life -= dt;

        // Colisión con límites de la arena
        const b = game.arena;
        if (this.x - this.radius < b.x || this.x + this.radius > b.x + b.w ||
            this.y - this.radius < b.y || this.y + this.radius > b.y + b.h || this.life <= 0) {
            this.dead = true;
            game.spawnParticles(this.x, this.y, 6, this.color, 90, true);
            return;
        }

        // Colisión con pilares
        for (const p of game.pillars) {
            if (!p.dead && MathUtils.circleCollide(this.x, this.y, this.radius, p.x, p.y, p.radius)) {
                p.takeDamage(this.damage * 0.5, game);
                this.dead = true;
                game.spawnParticles(this.x, this.y, 8, this.color, 110, true);
                return;
            }
        }

        // Colisión con el jugador (si es proyectil enemigo, respetando Dash / I-Frames)
        if (this.isEnemy && !game.player.dead) {
            if (MathUtils.circleCollide(this.x, this.y, this.radius, game.player.x, game.player.y, game.player.radius)) {
                if (game.player.isDashing || game.player.invulnTimer > 0) {
                    return;
                }
                const hit = game.player.takeDamage(this.damage, this.x, this.y, 200, game);
                if (hit) {
                    this.dead = true;
                    game.spawnParticles(this.x, this.y, 10, this.color, 130, true);
                }
            }
        }

        // Colisión con enemigos o jefe si es un proyectil del jugador
        if (!this.isEnemy) {
            for (const enemy of game.enemies) {
                if (!enemy.dead && MathUtils.circleCollide(this.x, this.y, this.radius, enemy.x, enemy.y, enemy.radius)) {
                    enemy.takeDamage(this.damage, this.x - this.vx * 0.05, this.y - this.vy * 0.05, 170, Math.random() < 0.22, game);
                    this.dead = true;
                    game.spawnParticles(this.x, this.y, 8, this.color, 120, true);
                    return;
                }
            }
            if (game.boss && !game.boss.dead && game.boss.isTargetable()) {
                if (MathUtils.circleCollide(this.x, this.y, this.radius, game.boss.x, game.boss.y, game.boss.radius)) {
                    game.boss.takeDamage(this.damage, this.x - this.vx * 0.05, this.y - this.vy * 0.05, 90, Math.random() < 0.22, game);
                    this.dead = true;
                    game.spawnParticles(this.x, this.y, 10, this.color, 140, true);
                    return;
                }
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.wordText) {
            // Proyectil Especial de Palabra Dañina ("JAJAJA", "XD", "JIJIJI", "LMAO", "AHAJAJA")
            ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.rotate(Math.sin(this.spin * 2) * 0.32);
            ctx.shadowBlur = 14;
            ctx.shadowColor = this.color;
            ctx.font = '900 16px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#090d16';
            ctx.strokeText(this.wordText, 0, 0);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(this.wordText, 0, 0);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.85;
            ctx.fillText(this.wordText, 0, -1);
            ctx.restore();
            return;
        }
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * ============================================================================
 * CLASE BASE: ENTITY
 * ============================================================================
 */
class Entity {
    constructor(x, y, radius, maxHp) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.kbVx = 0;
        this.kbVy = 0;
        this.radius = radius;
        this.maxHp = maxHp;
        this.hp = maxHp;
        this.hitFlash = 0;
        this.dead = false;
        this.animTime = Math.random() * 10;
        this.scaleX = 1;
        this.scaleY = 1;
    }

    applyKnockback(sourceX, sourceY, force) {
        const angle = Math.atan2(this.y - sourceY, this.x - sourceX);
        this.kbVx = Math.cos(angle) * force * (this.kbMult === undefined ? 1 : this.kbMult);
        this.kbVy = Math.sin(angle) * force * (this.kbMult === undefined ? 1 : this.kbMult);
    }

    triggerSquash(sx, sy) {
        this.scaleX = sx;
        this.scaleY = sy;
    }

    updateBase(dt, game) {
        this.animTime += dt;
        if (this.hitFlash > 0) this.hitFlash -= dt;

        // Recuperación elástica de Squash & Stretch
        this.scaleX = MathUtils.lerp(this.scaleX, 1, dt * 12);
        this.scaleY = MathUtils.lerp(this.scaleY, 1, dt * 12);

        // Integración de velocidad + knockback
        this.x += (this.vx + this.kbVx) * dt;
        this.y += (this.vy + this.kbVy) * dt;

        const kbDamp = Math.pow(0.84, dt * 60);
        this.kbVx *= kbDamp;
        this.kbVy *= kbDamp;
        if (Math.hypot(this.kbVx, this.kbVy) < 5) {
            this.kbVx = 0;
            this.kbVy = 0;
        }

        // Restricción a los muros de la arena
        const b = game.arena;
        this.x = MathUtils.clamp(this.x, b.x + this.radius, b.x + b.w - this.radius);
        this.y = MathUtils.clamp(this.y, b.y + this.radius, b.y + b.h - this.radius);

        // Resolución de colisión contra pilares
        for (const p of game.pillars) {
            if (p.dead) continue;
            const dx = this.x - p.x;
            const dy = this.y - p.y;
            const dist = Math.hypot(dx, dy);
            const minDist = this.radius + p.radius;
            if (dist < minDist && dist > 0.001) {
                const overlap = minDist - dist;
                this.x += (dx / dist) * overlap;
                this.y += (dy / dist) * overlap;
            }
        }
    }
}
