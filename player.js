/**
 * ============================================================================
 * CLASE JUGADOR: PLAYER (SKIN MINECRAFT & MANO ARTICULADA)
 * ============================================================================
 */
class Player extends Entity {
    constructor(x, y) {
        super(x, y, 20, 100);
        this.baseSpeed = 245;
        this.aimAngle = 0;

        // Inventario de armas (Espada, Pistola y Rifle)
        this.hasSword = true;
        this.hasGun = false;
        this.currentWeapon = 'SWORD'; // 'SWORD' | 'GUN' | 'RIFLE'
        this.gunCooldown = 0.20 * 1.07; // Cadencia reducida un 7%
        this.gunCooldownTimer = 0;
        this.pistolAmmo = 16;
        this.pistolMaxAmmo = 16;
        this.isReloadingPistol = false;
        this.pistolReloadTimer = 0;
        this.pistolReloadDuration = 0.5;

        // Dash y Esquiva con I-Frames
        this.dashCooldown = 1.05;
        this.dashCooldownTimer = 0;
        this.isDashing = false;
        this.dashDuration = 0.19;
        this.dashTimer = 0;
        this.dashSpeed = 760;
        this.dashDirX = 1;
        this.dashDirY = 0;
        this.invulnTimer = 0;
        this.afterimages = [];
        this.afterimageSpawnTimer = 0;

        // Ataque de Espada en Arco de 120 grados
        this.attackCooldown = 0.27;
        this.attackCooldownTimer = 0;
        this.isAttacking = false;
        this.attackDuration = 0.15;
        this.attackTimer = 0;
        this.attackBaseAngle = 0;
        this.swingDir = 1; // Alterna dirección izquierda/derecha para fluidez
        this.swordReach = 88;
        this.swordArc = (120 * Math.PI) / 180; // 120 grados exactos
        this.baseDamage = 26;
        this.hitTargetsInSwing = new Set();
        this.slashTrails = [];

        // Buffs temporales de estilo Roguelike
        this.damageBoostTimer = 0;
        this.speedBoostTimer = 0;

        // Economía de Oro e Inventario de Pociones (máx 3 por tipo)
        this.gold = 0;
        this.potions = { heal: 0, fury: 0, speed: 0 };
        this.maxPotionStack = 3;
        this.furyPotionTimer = 0;
        this.speedPotionTimer = 0;
        this.speedTrailTimer = 0;

        // Estadísticas permanentes de Nivel 2 ("Más Fuerte") y arsenal
        this.hasRifle = false;
        this.rifleCooldown = 0.11; // ~9 disparos/s
        this.rifleCooldownTimer = 0;
        this.rifleAmmo = 30;
        this.rifleMaxAmmo = 30;
        this.isReloadingRifle = false;
        this.rifleReloadTimer = 0;
        this.rifleReloadDuration = 0.8;
        this.rifleRecoil = 0;
        this.muzzleFlash = 0;
        this.dmgMult = 1;
        this.moveSpeedMult = 1;
        this.powered = false;

        // Estado de Sueño inducido por Gárgolas Veloces (Nivel 2)
        this.gargoyleHits = 0;
        this.gargoyleHitDecayTimer = 0;
        this.sleepTimer = 0;
        this.sleepImmunityTimer = 0;

        // Estado de Veneno (Patirrona de Villa) y Debilitamiento (Charco de Risín Pepín)
        this.poisonTimer = 0;
        this.poisonTickTimer = 0;
        this.poisonBubbleTimer = 0;
        this.weaknessTimer = 0;
        this.weaknessTextCooldown = 0;

        // Power-Ups Especiales Post-El Pepe: flags independientes para soportar los 3 activos a la vez
        this.powerUps = { bombaGrito: false, lolaBlaster: false, belcesword: false };
        this._lastSinglePowerup = null;
        this.isImmortal = false;
        this.infiniteItems = false;
        this.belceSwingCount = 0;
        this.activeSwingBelceThird = false;
        this.lolaCharging = false;
        this.lolaChargeTimer = 0;
        this.lolaChargeThreshold = 1.5;
        this.lolaFireAnimTimer = 0;
        this.lolaMouthDuration = 0.95;
        this.lolaMouthTimer = 0;
        this.lolaWaitRelease = false;
        this.lolaParticleTimer = 0;
        this.wasAttackHeld = false;
    }

    hasPowerUp(key) {
        if (!this.powerUps) return false;
        if (key === 'BOMBA_GRITO') return !!this.powerUps.bombaGrito;
        if (key === 'LOLA_BLASTER') return !!this.powerUps.lolaBlaster;
        if (key === 'BELCESWORD') return !!this.powerUps.belcesword;
        return false;
    }

    setPowerUpEnabled(key, enabled) {
        if (!this.powerUps) this.powerUps = { bombaGrito: false, lolaBlaster: false, belcesword: false };
        const val = !!enabled;
        if (key === 'BOMBA_GRITO') this.powerUps.bombaGrito = val;
        else if (key === 'LOLA_BLASTER') this.powerUps.lolaBlaster = val;
        else if (key === 'BELCESWORD') this.powerUps.belcesword = val;
        if (val) this._lastSinglePowerup = key;
        if (key === 'LOLA_BLASTER' && !val) {
            this.lolaCharging = false;
            this.lolaChargeTimer = 0;
            this.lolaWaitRelease = false;
            this.lolaFireAnimTimer = 0;
            this.lolaMouthTimer = 0;
        }
    }

    getActivePowerUps() {
        const list = [];
        if (this.hasPowerUp('BOMBA_GRITO')) list.push('BOMBA_GRITO');
        if (this.hasPowerUp('LOLA_BLASTER')) list.push('LOLA_BLASTER');
        if (this.hasPowerUp('BELCESWORD')) list.push('BELCESWORD');
        return list;
    }

    get powerup() {
        const list = this.getActivePowerUps();
        if (list.length === 0) return null;
        if (list.length === 1) return list[0];
        return this._lastSinglePowerup && this.hasPowerUp(this._lastSinglePowerup) ? this._lastSinglePowerup : list[0];
    }

    set powerup(val) {
        if (!val) {
            this.powerUps = { bombaGrito: false, lolaBlaster: false, belcesword: false };
            this._lastSinglePowerup = null;
            return;
        }
        this._lastSinglePowerup = val;
        this.powerUps = {
            bombaGrito: val === 'BOMBA_GRITO',
            lolaBlaster: val === 'LOLA_BLASTER',
            belcesword: val === 'BELCESWORD'
        };
    }

    get hasPistol() {
        return this.hasGun;
    }

    set hasPistol(val) {
        this.hasGun = !!val;
    }

    startPistolReload(game) {
        if (!this.hasGun || this.isReloadingPistol || this.pistolAmmo >= this.pistolMaxAmmo) return false;
        this.isReloadingPistol = true;
        this.pistolReloadTimer = this.pistolReloadDuration;
        if (game && game.updateHUD) game.updateHUD();
        return true;
    }

    startRifleReload(game) {
        if (!this.hasRifle || this.isReloadingRifle || this.rifleAmmo >= this.rifleMaxAmmo) return false;
        this.isReloadingRifle = true;
        this.rifleReloadTimer = this.rifleReloadDuration;
        if (game && game.updateHUD) game.updateHUD();
        return true;
    }

    get damageMultiplier() {
        return this.dmgMult * (this.furyPotionTimer > 0 ? 1.3 : 1.0) * (this.damageBoostTimer > 0 ? 1.4 : 1.0) * (this.weaknessTimer > 0 ? 0.90 : 1.0);
    }

    get speedMultiplier() {
        return this.moveSpeedMult * (this.speedPotionTimer > 0 ? 1.3 : 1.0) * (this.speedBoostTimer > 0 ? 1.3 : 1.0);
    }

    usePotion(type, game) {
        if (this.dead || !this.potions) return false;
        if (type === 'heal') {
            if (!this.infiniteItems && this.potions.heal <= 0) return false;
            const isPoisoned = this.poisonTimer > 0;
            if (this.hp >= this.maxHp && !isPoisoned) {
                game.floatingTexts.push(new FloatingText(this.x, this.y - 26, 'VIDA AL MÁXIMO', '#4ade80', 14));
                return false;
            }
            if (this.infiniteItems) this.potions.heal = this.maxPotionStack;
            else this.potions.heal--;
            this.poisonTimer = 0;
            this.poisonTickTimer = 0;
            const missingHp = Math.max(0, this.maxHp - this.hp);
            const healAmt = missingHp > 0 ? Math.max(1, Math.round(missingHp * 0.55)) : 0;
            if (healAmt > 0) {
                this.hp = Math.min(this.maxHp, Math.round(this.hp + healAmt));
            }
            this.triggerSquash(1.22, 0.84);
            soundManager.playPotionUse();
            game.spawnParticles(this.x, this.y, 20, '#4ade80', 150, true);
            if (isPoisoned) {
                game.floatingTexts.push(new FloatingText(this.x, this.y - 46, '¡VENENO CURADO!', '#39ff14', 17, true));
            }
            if (healAmt > 0) {
                game.floatingTexts.push(new FloatingText(this.x, this.y - 28, `+${healAmt} HP (POCIÓN)`, '#4ade80', 17, true));
            }
            if (game.updateHUD) game.updateHUD();
            return true;
        }
        if (type === 'fury') {
            if (!this.infiniteItems && this.potions.fury <= 0) return false;
            if (this.infiniteItems) this.potions.fury = this.maxPotionStack;
            else this.potions.fury--;
            this.furyPotionTimer = 5.0;
            this.triggerSquash(1.26, 0.80);
            soundManager.playPotionUse();
            game.spawnParticles(this.x, this.y, 22, '#f97316', 165, true);
            game.floatingTexts.push(new FloatingText(this.x, this.y - 28, '¡FURIA +30% DAÑO (5s)!', '#f97316', 17, true));
            if (game.updateHUD) game.updateHUD();
            return true;
        }
        if (type === 'speed') {
            if (!this.infiniteItems && this.potions.speed <= 0) return false;
            if (this.infiniteItems) this.potions.speed = this.maxPotionStack;
            else this.potions.speed--;
            this.speedPotionTimer = 5.0;
            this.triggerSquash(0.82, 1.24);
            soundManager.playPotionUse();
            game.spawnParticles(this.x, this.y, 22, '#38bdf8', 175, true);
            game.floatingTexts.push(new FloatingText(this.x, this.y - 28, '¡VELOCIDAD +30% (5s)!', '#38bdf8', 17, true));
            if (game.updateHUD) game.updateHUD();
            return true;
        }
        return false;
    }

    switchWeapon(weapon, game) {
        if (weapon === 'SWORD' && !this.hasSword) return;
        if (weapon === 'GUN' && !this.hasGun) return;
        if (weapon === 'RIFLE' && !this.hasRifle) return;
        if (this.currentWeapon === weapon) return;
        this.currentWeapon = weapon;
        this.lolaCharging = false;
        this.lolaChargeTimer = 0;
        this.lolaWaitRelease = false;
        this.lolaFireAnimTimer = 0;
        this.lolaMouthTimer = 0;
        const swordLabel = this.hasPowerUp('BELCESWORD') ? 'BELCESWORD EQUIPADA' : 'ESPADA EQUIPADA';
        const gunLabel = this.hasPowerUp('LOLA_BLASTER') ? 'LOLA BLASTER EQUIPADO' : 'PISTOLA EQUIPADA';
        const names = { SWORD: swordLabel, GUN: gunLabel, RIFLE: 'RIFLE DE ASALTO EQUIPADO' };
        game.floatingTexts.push(new FloatingText(this.x, this.y - 24, names[weapon], '#00f5d4', 15));
        soundManager.playPickup();
    }

    toggleWeapon(game) {
        const order = [];
        if (this.hasSword) order.push('SWORD');
        if (this.hasGun) order.push('GUN');
        if (this.hasRifle) order.push('RIFLE');
        if (order.length < 2) return;
        const idx = order.indexOf(this.currentWeapon);
        this.switchWeapon(order[(idx + 1) % order.length], game);
    }

    takeDamage(amount, sourceX, sourceY, kbForce, game) {
        if (this.isImmortal || this.invulnTimer > 0 || this.isDashing || this.dead) return false;
        const dmg = Math.round(amount);
        this.hp = Math.max(0, this.hp - dmg);
        this.hitFlash = 0.16;
        this.invulnTimer = 0.55; // I-frames tras recibir golpe
        this.applyKnockback(sourceX, sourceY, kbForce);
        this.triggerSquash(1.35, 0.7);

        soundManager.playPlayerHurt();
        game.addScreenShake(8, 0.22);
        game.spawnParticles(this.x, this.y, 16, '#ef4444', 180, true);
        game.floatingTexts.push(new FloatingText(this.x, this.y - 22, `-${dmg}`, '#ef4444', 18, true));

        if (this.hp <= 0) {
            this.dead = true;
            game.onPlayerDeath();
        }
        return true;
    }

    applyGargoyleHit(gargoyle, game) {
        if (this.invulnTimer > 0 || this.isDashing || this.dead) return false;
        if (this.sleepTimer > 0 || this.sleepImmunityTimer > 0) return false;

        this.gargoyleHits += 1;
        this.gargoyleHitDecayTimer = 4.0;

        if (this.gargoyleHits === 1) {
            this.triggerSquash(1.18, 0.85);
            if (soundManager.playSleepHit) soundManager.playSleepHit(1);
            game.spawnParticles(this.x, this.y, 12, '#c084fc', 130, true);
            game.floatingTexts.push(new FloatingText(this.x, this.y - 28, '¡1/2 SUEÑO!', '#c084fc', 16, true));
        } else {
            this.gargoyleHits = 0;
            this.gargoyleHitDecayTimer = 0;
            this.sleepTimer = 1.8;
            this.isAttacking = false;
            this.isDashing = false;
            this.vx = 0;
            this.vy = 0;
            this.triggerSquash(1.3, 0.72);
            if (soundManager.playSleepHit) soundManager.playSleepHit(2);
            game.spawnParticles(this.x, this.y, 22, '#818cf8', 155, true);
            game.floatingTexts.push(new FloatingText(this.x, this.y - 34, '💤 ¡DORMIDO!', '#c084fc', 20, true));
        }
        return true;
    }

    applyPoison(duration = 4.0, game) {
        if (this.dead) return false;
        const wasPoisoned = this.poisonTimer > 0;
        this.poisonTimer = Math.max(this.poisonTimer, duration);
        if (!wasPoisoned || this.poisonTickTimer <= 0) {
            this.poisonTickTimer = 1.0;
        }
        if (game) {
            game.spawnParticles(this.x, this.y, 14, '#39ff14', 130, true);
            if (!wasPoisoned && game.floatingTexts) {
                game.floatingTexts.push(new FloatingText(this.x, this.y - 36, '☠️ ¡ENVENENADO (4s)!', '#39ff14', 17, true));
            }
        }
        return true;
    }

    applyWeakness(duration = 4.0, game) {
        if (this.dead) return false;
        const shouldNotify = this.weaknessTimer <= 0 && this.weaknessTextCooldown <= 0;
        this.weaknessTimer = Math.max(this.weaknessTimer, duration);
        if (shouldNotify && game) {
            this.weaknessTextCooldown = 1.5;
            game.spawnParticles(this.x, this.y, 14, '#a855f7', 120, true);
            if (game.floatingTexts) {
                game.floatingTexts.push(new FloatingText(this.x, this.y - 36, '¡DAÑO -10% (4s)!', '#c084fc', 17, true));
            }
        }
        return true;
    }

    startDash(inputX, inputY, game) {
        if (this.sleepTimer > 0 || (game && game.state === 'BOSS_INTRO')) return;
        if (this.dashCooldownTimer > 0 || this.isDashing) return;

        // Power-Up 1: Bomba Grito plantada en la posición inicial del Dash (radio reducido al 50% en v1.8.1: 67.5px)
        if (this.hasPowerUp('BOMBA_GRITO') && game && game.bombs && typeof BombaGrito !== 'undefined') {
            game.bombs.push(new BombaGrito(this.x, this.y, 67.5, 0.65));
        }

        this.isDashing = true;
        this.dashTimer = this.dashDuration;
        this.dashCooldownTimer = this.dashCooldown;
        this.invulnTimer = this.dashDuration + 0.08;

        if (inputX !== 0 || inputY !== 0) {
            const len = Math.hypot(inputX, inputY);
            this.dashDirX = inputX / len;
            this.dashDirY = inputY / len;
        } else {
            this.dashDirX = Math.cos(this.aimAngle);
            this.dashDirY = Math.sin(this.aimAngle);
        }

        this.triggerSquash(1.4, 0.65);
        game.spawnParticles(this.x, this.y, 12, '#00f5d4', 150, true);
    }

    startAttack(game) {
        if (this.sleepTimer > 0 || (game && game.state === 'BOSS_INTRO')) return;
        if (this.currentWeapon === 'GUN') {
            if (!this.infiniteItems) {
                if (this.isReloadingPistol) return;
                if (this.pistolAmmo <= 0) {
                    this.startPistolReload(game);
                    return;
                }
            }
            if (this.gunCooldownTimer > 0) return;
            this.gunCooldownTimer = this.gunCooldown;
            if (!this.infiniteItems) {
                this.pistolAmmo = Math.max(0, this.pistolAmmo - 1);
                if (this.pistolAmmo <= 0) {
                    this.isReloadingPistol = true;
                    this.pistolReloadTimer = this.pistolReloadDuration;
                }
            } else {
                this.pistolAmmo = this.pistolMaxAmmo;
                this.isReloadingPistol = false;
            }

            // Retroceso visual y físico
            this.kbVx -= Math.cos(this.aimAngle) * 80;
            this.kbVy -= Math.sin(this.aimAngle) * 80;
            this.triggerSquash(0.84, 1.2);

            const speed = 820;
            const spawnDist = 24;
            const bx = this.x + Math.cos(this.aimAngle) * spawnDist;
            const by = this.y + Math.sin(this.aimAngle) * spawnDist;
            const isCrit = Math.random() < 0.22;
            const lolaBonus = this.hasPowerUp('LOLA_BLASTER') ? (1.05 * 1.45) : 1.0; // +45% daño en v1.7.1
            const dmg = Math.round(18 * lolaBonus * this.damageMultiplier * (isCrit ? 1.6 : 1.0));

            game.projectiles.push(new Projectile(
                bx, by,
                Math.cos(this.aimAngle) * speed,
                Math.sin(this.aimAngle) * speed,
                5.5, dmg, '#38bdf8', false
            ));

            soundManager.playGunshot();
            game.spawnParticles(bx, by, 7, '#38bdf8', 130, true);
            game.addScreenShake(2.5, 0.06);
            return;
        }

        if (this.currentWeapon === 'RIFLE') {
            if (!this.infiniteItems) {
                if (this.isReloadingRifle) return;
                if (this.rifleAmmo <= 0) {
                    this.startRifleReload(game);
                    return;
                }
            }
            if (this.rifleCooldownTimer > 0) return;
            this.rifleCooldownTimer = this.rifleCooldown;
            if (!this.infiniteItems) {
                this.rifleAmmo = Math.max(0, this.rifleAmmo - 1);
                if (this.rifleAmmo <= 0) {
                    this.isReloadingRifle = true;
                    this.rifleReloadTimer = this.rifleReloadDuration;
                }
            } else {
                this.rifleAmmo = this.rifleMaxAmmo;
                this.isReloadingRifle = false;
            }

            // Retroceso visual y ligera dispersión angular
            this.rifleRecoil = 1;
            this.muzzleFlash = 0.05;
            this.kbVx -= Math.cos(this.aimAngle) * 28;
            this.kbVy -= Math.sin(this.aimAngle) * 28;

            const spread = (Math.random() - 0.5) * 0.15;
            const ang = this.aimAngle + spread;
            const speed = 1250;
            const spawnDist = 52;
            const bx = this.x + Math.cos(this.aimAngle) * spawnDist;
            const by = this.y + Math.sin(this.aimAngle) * spawnDist;
            const isCrit = Math.random() < 0.15;
            const dmg = Math.round(24 * this.damageMultiplier * (isCrit ? 1.6 : 1.0));

            game.projectiles.push(new Projectile(
                bx, by,
                Math.cos(ang) * speed,
                Math.sin(ang) * speed,
                4, dmg, '#fbbf24', false
            ));

            soundManager.playRifleShot();
            game.spawnParticles(bx, by, 3, '#fde047', 110, true);
            game.addScreenShake(1.5, 0.04);
            return;
        }

        // Ataque con Espada (o Belcesword)
        if (!this.hasSword) return;
        if (this.attackCooldownTimer > 0 || this.isAttacking) return;
        const hasBelce = this.hasPowerUp('BELCESWORD');
        if (hasBelce) {
            this.belceSwingCount = (this.belceSwingCount || 0) + 1;
            this.activeSwingBelceThird = (this.belceSwingCount % 3 === 0);
        } else {
            this.activeSwingBelceThird = false;
        }

        this.isAttacking = true;
        this.attackTimer = this.attackDuration;
        // Belcesword reduce su velocidad de ataque base un 10% (+10% cooldown)
        this.attackCooldownTimer = hasBelce ? (this.attackCooldown * 1.10) : this.attackCooldown;
        this.attackBaseAngle = this.aimAngle;
        this.swingDir *= -1;
        this.hitTargetsInSwing.clear();

        if (this.activeSwingBelceThird && soundManager.playBelcesword) {
            soundManager.playBelcesword();
        } else {
            soundManager.playSwordSlash();
        }

        // Pequeño impulso hacia adelante al atacar
        this.kbVx += Math.cos(this.aimAngle) * 95;
        this.kbVy += Math.sin(this.aimAngle) * 95;
        this.triggerSquash(this.activeSwingBelceThird ? 1.35 : 1.22, this.activeSwingBelceThird ? 0.72 : 0.82);

        if (this.activeSwingBelceThird && game) {
            game.addScreenShake(6, 0.16);
            game.spawnParticles(this.x, this.y, 18, '#a855f7', 180, true);
            game.floatingTexts.push(new FloatingText(this.x, this.y - 34, '¡TAJO BELCE!', '#c084fc', 18, true));
        }

        // Registrar rastro visual de corte (Slash Trail)
        this.slashTrails.push({
            x: this.x,
            y: this.y,
            angle: this.attackBaseAngle,
            dir: this.swingDir,
            life: 0.18,
            maxLife: 0.18,
            boosted: this.damageBoostTimer > 0 || this.furyPotionTimer > 0,
            belce: hasBelce,
            belceThird: this.activeSwingBelceThird
        });
    }

    fireLolaChargedOrb(game) {
        this.lolaChargeTimer = 0;
        this.lolaCharging = false;
        this.lolaFireAnimTimer = 0.95; // Cambia a Lola_Blaster2.png durante 0.95s (v1.7.1)
        this.lolaMouthTimer = 0.95;
        this.gunCooldownTimer = 0.25;

        this.kbVx -= Math.cos(this.aimAngle) * 145;
        this.kbVy -= Math.sin(this.aimAngle) * 145;
        this.triggerSquash(0.76, 1.3);

        const speed = 540;
        const spawnDist = 30;
        const bx = this.x + Math.cos(this.aimAngle) * spawnDist;
        const by = this.y + Math.sin(this.aimAngle) * spawnDist;
        const orbDmg = Math.round(34 * 1.05 * 1.45 * this.damageMultiplier); // +45% daño (v1.7.1)

        game.projectiles.push(new Projectile(
            bx, by,
            Math.cos(this.aimAngle) * speed,
            Math.sin(this.aimAngle) * speed,
            26,
            orbDmg,
            '#00f5d4',
            false,
            null,
            {
                kind: 'LOLA_ORB',
                maxDistance: 400,
                piercing: true,
                aoeRadius: 90,
                aoeDamage: Math.round(orbDmg * 0.65)
            }
        ));

        if (soundManager.playLolaBlasterCharged) soundManager.playLolaBlasterCharged();
        else soundManager.playGunshot();
        game.spawnParticles(bx, by, 22, '#00f5d4', 180, true);
        game.floatingTexts.push(new FloatingText(this.x, this.y - 34, '¡ORBE LOLA!', '#00f5d4', 17, true));
        game.addScreenShake(6, 0.14);
    }

    update(dt, game) {
        if (this.infiniteItems) {
            this.potions.heal = this.maxPotionStack;
            this.potions.fury = this.maxPotionStack;
            this.potions.speed = this.maxPotionStack;
            this.pistolAmmo = this.pistolMaxAmmo;
            this.rifleAmmo = this.rifleMaxAmmo;
            this.isReloadingPistol = false;
            this.isReloadingRifle = false;
            this.gold = Math.max(this.gold || 0, 999);
        }

        // Actualizar temporizadores de mejoras y pociones
        if (this.lolaFireAnimTimer > 0) this.lolaFireAnimTimer = Math.max(0, this.lolaFireAnimTimer - dt);
        if (this.lolaMouthTimer > 0) this.lolaMouthTimer = Math.max(0, this.lolaMouthTimer - dt);
        if (this.damageBoostTimer > 0) this.damageBoostTimer = Math.max(0, this.damageBoostTimer - dt);
        if (this.speedBoostTimer > 0) this.speedBoostTimer = Math.max(0, this.speedBoostTimer - dt);
        if (this.furyPotionTimer > 0) this.furyPotionTimer = Math.max(0, this.furyPotionTimer - dt);
        if (this.speedPotionTimer > 0) this.speedPotionTimer = Math.max(0, this.speedPotionTimer - dt);
        if (this.invulnTimer > 0) this.invulnTimer -= dt;
        if (this.dashCooldownTimer > 0) this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
        if (this.attackCooldownTimer > 0) this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
        if (this.gunCooldownTimer > 0) this.gunCooldownTimer = Math.max(0, this.gunCooldownTimer - dt);
        if (this.isReloadingPistol) {
            this.pistolReloadTimer -= dt;
            if (this.pistolReloadTimer <= 0) {
                this.pistolReloadTimer = 0;
                this.isReloadingPistol = false;
                this.pistolAmmo = this.pistolMaxAmmo;
                soundManager.playRifleReload();
                if (game && game.floatingTexts) {
                    game.floatingTexts.push(new FloatingText(this.x, this.y - 30, '¡PISTOLA RECARGADA (16/16)!', '#38bdf8', 14));
                }
            }
        }
        if (this.rifleCooldownTimer > 0) this.rifleCooldownTimer = Math.max(0, this.rifleCooldownTimer - dt);
        if (this.isReloadingRifle) {
            this.rifleReloadTimer -= dt;
            if (this.rifleReloadTimer <= 0) {
                this.rifleReloadTimer = 0;
                this.isReloadingRifle = false;
                this.rifleAmmo = this.rifleMaxAmmo;
                soundManager.playRifleReload();
                if (game && game.floatingTexts) {
                    game.floatingTexts.push(new FloatingText(this.x, this.y - 30, '¡RIFLE RECARGADO (30/30)!', '#fbbf24', 14));
                }
            }
        }
        if (this.muzzleFlash > 0) this.muzzleFlash -= dt;
        this.rifleRecoil = Math.max(0, this.rifleRecoil - dt * 12);

        // Temporizadores de Sueño e inmunidad post-despertar (Gárgolas Nivel 2)
        if (this.sleepImmunityTimer > 0) this.sleepImmunityTimer = Math.max(0, this.sleepImmunityTimer - dt);
        if (this.gargoyleHits > 0 && this.sleepTimer <= 0) {
            this.gargoyleHitDecayTimer -= dt;
            if (this.gargoyleHitDecayTimer <= 0) {
                this.gargoyleHits = 0;
                this.gargoyleHitDecayTimer = 0;
            }
        }
        if (this.sleepTimer > 0) {
            this.sleepTimer -= dt;
            if (this.sleepTimer <= 0) {
                this.sleepTimer = 0;
                this.sleepImmunityTimer = 1.2;
                if (game && game.floatingTexts) {
                    game.floatingTexts.push(new FloatingText(this.x, this.y - 26, '¡DESPIERTO!', '#38bdf8', 15, true));
                }
            }
        }

        // Temporizadores de Debilitamiento (Charco Risín Pepín) y Veneno (Patirrona de Villa)
        if (this.weaknessTextCooldown > 0) this.weaknessTextCooldown = Math.max(0, this.weaknessTextCooldown - dt);
        if (this.weaknessTimer > 0) this.weaknessTimer = Math.max(0, this.weaknessTimer - dt);

        if (this.poisonTimer > 0 && (!game || game.state === 'PLAYING')) {
            this.poisonTimer = Math.max(0, this.poisonTimer - dt);
            this.poisonTickTimer -= dt;
            this.poisonBubbleTimer -= dt;
            if (this.poisonBubbleTimer <= 0 && game && game.spawnParticles) {
                this.poisonBubbleTimer = 0.22;
                game.spawnParticles(
                    this.x + MathUtils.randRange(-14, 14),
                    this.y + MathUtils.randRange(-18, 6),
                    2, '#39ff14', 45, true
                );
            }
            if (this.poisonTickTimer <= 0) {
                this.poisonTickTimer += 1.0;
                if (!this.isImmortal) {
                    const poisonDmg = Math.max(1, Math.round(this.maxHp * 0.015));
                    this.hp = Math.max(0, this.hp - poisonDmg);
                    this.hitFlash = Math.max(this.hitFlash, 0.08);
                    if (soundManager.playPoisonTick) soundManager.playPoisonTick();
                    if (game) {
                        game.spawnParticles(this.x, this.y, 8, '#39ff14', 95, true);
                        if (game.floatingTexts) {
                            game.floatingTexts.push(new FloatingText(this.x, this.y - 26, `-${poisonDmg} VENENO`, '#39ff14', 15, true));
                        }
                    }
                    if (this.hp <= 0) {
                        this.dead = true;
                        if (game && game.onPlayerDeath) game.onPlayerDeath();
                        return;
                    }
                }
            }
            if (this.poisonTimer <= 0) {
                this.poisonTickTimer = 0;
            }
        }

        // Bloqueo absoluto durante la cinemática de Jefe (evita balas congeladas y movimiento)
        if (game && game.state === 'BOSS_INTRO') {
            this.vx = 0;
            this.vy = 0;
            this.kbVx = 0;
            this.kbVy = 0;
            this.isDashing = false;
            this.isAttacking = false;
            this.updateBase(dt, game);
            for (let i = this.afterimages.length - 1; i >= 0; i--) {
                this.afterimages[i].life -= dt;
                if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
            }
            for (let i = this.slashTrails.length - 1; i >= 0; i--) {
                this.slashTrails[i].life -= dt;
                if (this.slashTrails[i].life <= 0) this.slashTrails.splice(i, 1);
            }
            return;
        }

        // Si está dormido por las Gárgolas: no puede moverse, disparar ni hacer Dash
        if (this.sleepTimer > 0) {
            this.vx = 0;
            this.vy = 0;
            this.isDashing = false;
            this.isAttacking = false;
            this.updateBase(dt, game);
            for (let i = this.afterimages.length - 1; i >= 0; i--) {
                this.afterimages[i].life -= dt;
                if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
            }
            for (let i = this.slashTrails.length - 1; i >= 0; i--) {
                this.slashTrails[i].life -= dt;
                if (this.slashTrails[i].life <= 0) this.slashTrails.splice(i, 1);
            }
            return;
        }

        // Dirección hacia el cursor o última dirección
        const keys = game.keys;
        let moveX = 0;
        let moveY = 0;
        if (keys['KeyW'] || keys['ArrowUp']) moveY -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveY += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

        // Integración del Joystick Virtual Táctil (Mitad Izquierda)
        if (game.touchControls && game.touchControls.joystick.active) {
            moveX = game.touchControls.joystick.dirX;
            moveY = game.touchControls.joystick.dirY;
        }

        // Apuntado Inteligente (Twin-Stick + Auto-Aim en móvil, Cursor/Teclas en PC)
        if (game.touchControls && game.touchControls.isAttackTouchHeld) {
            const ab = game.touchControls.buttons.attack;
            if (ab.hasDragged) {
                // Arrastre en botón de ataque -> Twin-Stick Aiming manual
                this.aimAngle = ab.aimAngle;
            } else {
                // Toque estático sin arrastrar -> Auto-Aim al enemigo o jefe vivo más cercano
                const nearest = game.getNearestTarget(this.x, this.y);
                if (nearest) {
                    this.aimAngle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
                } else if (moveX !== 0 || moveY !== 0) {
                    this.aimAngle = Math.atan2(moveY, moveX);
                }
            }
        } else if (game.mouse.active) {
            this.aimAngle = Math.atan2(game.mouse.worldY - this.y, game.mouse.worldX - this.x);
        } else if (moveX !== 0 || moveY !== 0) {
            this.aimAngle = Math.atan2(moveY, moveX);
        }

        // Inputs de Dash y Ataque (Soporte PC + Móvil Fuego Continuo + Carga Lola Blaster)
        if (!game.isShopOpen) {
            if (keys['Space'] || keys['ShiftLeft'] || keys['ShiftRight']) {
                this.startDash(moveX, moveY, game);
            }
            const attackHeld = !!(game.mouse.down || keys['KeyJ'] || (game.touchControls && game.touchControls.isAttackTouchHeld));
            if (this.hasPowerUp('LOLA_BLASTER') && this.currentWeapon === 'GUN') {
                if (attackHeld) {
                    if (!this.wasAttackHeld && !this.lolaCharging && !this.lolaWaitRelease) {
                        this.startAttack(game);
                        this.lolaCharging = true;
                        this.lolaChargeTimer = 0;
                    } else if (this.lolaCharging && !this.lolaWaitRelease) {
                        this.lolaChargeTimer += dt;
                        this.lolaParticleTimer -= dt;
                        if (this.lolaParticleTimer <= 0 && game && game.spawnParticles) {
                            this.lolaParticleTimer = 0.08;
                            const mx = this.x + Math.cos(this.aimAngle) * 44;
                            const my = this.y + Math.sin(this.aimAngle) * 44;
                            game.spawnParticles(mx, my, 2, '#00f5d4', 65, true);
                        }
                        if (this.lolaChargeTimer >= this.lolaChargeThreshold) {
                            this.fireLolaChargedOrb(game);
                            this.lolaWaitRelease = true;
                        }
                    }
                } else {
                    if (this.lolaCharging && this.lolaChargeTimer >= this.lolaChargeThreshold) {
                        this.fireLolaChargedOrb(game);
                    }
                    this.lolaCharging = false;
                    this.lolaChargeTimer = 0;
                    this.lolaWaitRelease = false;
                }
            } else {
                this.lolaCharging = false;
                this.lolaChargeTimer = 0;
                this.lolaWaitRelease = false;
                if (attackHeld) {
                    this.startAttack(game);
                }
            }
            this.wasAttackHeld = attackHeld;
        } else {
            this.lolaCharging = false;
            this.lolaChargeTimer = 0;
            this.lolaWaitRelease = false;
            this.wasAttackHeld = false;
        }

        // Lógica de Movimiento o Dash
        const currentSpeed = this.baseSpeed * this.speedMultiplier;
        if (this.isDashing) {
            this.dashTimer -= dt;
            this.vx = this.dashDirX * this.dashSpeed;
            this.vy = this.dashDirY * this.dashSpeed;

            this.afterimageSpawnTimer -= dt;
            if (this.afterimageSpawnTimer <= 0) {
                this.afterimageSpawnTimer = 0.025;
                this.afterimages.push({
                    x: this.x,
                    y: this.y,
                    radius: this.radius,
                    life: 0.22,
                    maxLife: 0.22
                });
            }

            if (this.dashTimer <= 0) {
                this.isDashing = false;
            }
        } else {
            if (moveX !== 0 || moveY !== 0) {
                const len = Math.hypot(moveX, moveY);
                this.vx = (moveX / len) * currentSpeed;
                this.vy = (moveY / len) * currentSpeed;

                // Rastro azul al moverse bajo el efecto de la Poción de Velocidad
                if (this.speedPotionTimer > 0) {
                    this.speedTrailTimer -= dt;
                    if (this.speedTrailTimer <= 0) {
                        this.speedTrailTimer = 0.055;
                        this.afterimages.push({
                            x: this.x,
                            y: this.y,
                            radius: this.radius * 0.85,
                            life: 0.18,
                            maxLife: 0.18,
                            color: '#38bdf8'
                        });
                    }
                }
            } else {
                this.vx = 0;
                this.vy = 0;
            }
        }

        this.updateBase(dt, game);

        // Actualizar Afterimages del Dash
        for (let i = this.afterimages.length - 1; i >= 0; i--) {
            this.afterimages[i].life -= dt;
            if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
        }

        // Actualizar Estelas de Corte (Slash Trails)
        for (let i = this.slashTrails.length - 1; i >= 0; i--) {
            const t = this.slashTrails[i];
            t.x = this.x;
            t.y = this.y;
            t.life -= dt;
            if (t.life <= 0) this.slashTrails.splice(i, 1);
        }

        // Procesar detección de impactos durante el arco del tajo
        if (this.isAttacking) {
            this.attackTimer -= dt;
            this.checkSwordCollisions(game);
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }
    }

    checkSwordCollisions(game) {
        const hasBelce = this.hasPowerUp('BELCESWORD');
        const isThird = hasBelce && this.activeSwingBelceThird;
        const reach = isThird ? (this.swordReach * 1.45) : this.swordReach;
        const halfArc = (isThird ? Math.min(Math.PI * 1.65, this.swordArc * 1.45) : this.swordArc) * 0.5;
        const isCrit = Math.random() < 0.22;
        const belceMult = hasBelce ? (isThird ? 1.10 * 1.30 : 1.10) : 1.0;
        const kbBoost = hasBelce ? 1.50 : 1.0;
        const finalDamage = Math.round(this.baseDamage * belceMult * this.damageMultiplier * (isCrit ? 1.65 : 1.0));

        // Contra Enemigos y Jefe
        const targets = [...game.enemies];
        if (game.boss && !game.boss.dead && game.boss.isTargetable()) {
            targets.push(game.boss);
        }

        for (const enemy of targets) {
            if (enemy.dead || this.hitTargetsInSwing.has(enemy)) continue;

            const hit = MathUtils.sectorCircleCollide(
                this.x, this.y,
                10, reach,
                this.attackBaseAngle, halfArc,
                enemy.x, enemy.y, enemy.radius
            );

            if (hit) {
                this.hitTargetsInSwing.add(enemy);
                enemy.takeDamage(finalDamage, this.x, this.y, Math.round((isCrit ? 420 : 290) * kbBoost), isCrit || isThird, game);
                if (isCrit || isThird) {
                    game.addScreenShake(7, 0.16);
                } else {
                    game.addScreenShake(3, 0.08);
                }
            }
        }

        // Contra Pilares destructibles
        for (const pillar of game.pillars) {
            if (pillar.dead || this.hitTargetsInSwing.has(pillar)) continue;
            const hit = MathUtils.sectorCircleCollide(
                this.x, this.y,
                10, reach,
                this.attackBaseAngle, halfArc,
                pillar.x, pillar.y, pillar.radius
            );
            if (hit) {
                this.hitTargetsInSwing.add(pillar);
                pillar.takeDamage(finalDamage, game);
            }
        }

        // Cortar proyectiles enemigos si se tiene el buff de Furia
        if (this.damageBoostTimer > 0 || this.furyPotionTimer > 0) {
            for (const proj of game.projectiles) {
                if (proj.dead || !proj.isEnemy) continue;
                const hit = MathUtils.sectorCircleCollide(
                    this.x, this.y,
                    10, reach,
                    this.attackBaseAngle, halfArc,
                    proj.x, proj.y, proj.radius
                );
                if (hit) {
                    proj.dead = true;
                    game.spawnParticles(proj.x, proj.y, 8, '#fbbf24', 140, true);
                }
            }
        }
    }

    draw(ctx) {
        // 1. Dibujar rastro de Afterimages (Dash y Poción de Velocidad)
        for (const img of this.afterimages) {
            ctx.save();
            ctx.globalAlpha = (img.life / img.maxLife) * 0.45;
            const c = img.color || '#00f5d4';
            ctx.fillStyle = c;
            ctx.shadowBlur = 12;
            ctx.shadowColor = c;
            ctx.beginPath();
            ctx.arc(img.x, img.y, img.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 2. Dibujar estelas de corte (Slash Trails de 120° / Belcesword morada gigante en 3er golpe)
        for (const trail of this.slashTrails) {
            ctx.save();
            ctx.translate(trail.x, trail.y);
            const alpha = (trail.life / trail.maxLife) * (trail.belceThird ? 0.85 : 0.65);
            ctx.globalAlpha = alpha;

            const arc = trail.belceThird ? Math.min(Math.PI * 1.65, this.swordArc * 1.45) : this.swordArc;
            const reach = trail.belceThird ? this.swordReach * 1.45 : this.swordReach;
            const startAngle = trail.angle - arc * 0.5;
            const endAngle = trail.angle + arc * 0.5;
            const color = trail.belce ? (trail.belceThird ? '#c084fc' : '#7e22ce') : (trail.boosted ? '#fbbf24' : '#00f5d4');

            ctx.shadowBlur = trail.belceThird ? 26 : 18;
            ctx.shadowColor = color;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(0, 0, reach, startAngle, endAngle);
            ctx.arc(0, 0, reach * 0.42, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fill();

            // Borde brillante exterior del corte
            ctx.strokeStyle = trail.belceThird ? '#f3e8ff' : '#ffffff';
            ctx.lineWidth = trail.belceThird ? 3.5 : 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, reach, startAngle, endAngle);
            ctx.stroke();
            ctx.restore();
        }

        // 3. Dibujar Cuerpo del Jugador (Skin player.png & Fallback Minecraft)
        const isMoving = Math.hypot(this.vx, this.vy) > 10;
        const walkBob = isMoving ? Math.sin(this.animTime * 14) * 3.5 : Math.sin(this.animTime * 4) * 1.0;
        const facingLeft = Math.cos(this.aimAngle) < 0;

        ctx.save();
        ctx.translate(this.x, this.y + walkBob);

        // Voltear horizontalmente según hacia dónde apunta el cursor
        if (facingLeft) {
            ctx.scale(-1, 1);
        }
        ctx.scale(this.scaleX, this.scaleY);

        // Sombra bajo el jugador
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 24 - walkBob, this.radius * 1.25, this.radius * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        // Aura dorada/cian del Modo Potenciado (Nivel 2)
        if (this.powered) {
            const pulse = 0.5 + Math.sin(this.animTime * 5) * 0.2;
            const auraGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 52);
            auraGrad.addColorStop(0, `rgba(251, 191, 36, ${0.28 * pulse + 0.1})`);
            auraGrad.addColorStop(0.6, `rgba(0, 245, 212, ${0.18 * pulse})`);
            auraGrad.addColorStop(1, 'rgba(0, 245, 212, 0)');
            ctx.fillStyle = auraGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 52, 0, Math.PI * 2);
            ctx.fill();
            ctx.save();
            ctx.strokeStyle = `rgba(251, 191, 36, ${0.45 + pulse * 0.3})`;
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00f5d4';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(0, 2, 38 + Math.sin(this.animTime * 6) * 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Aura si tiene buff activo (Furia Naranja, Orbe Furia o Velocidad Azul)
        if (this.furyPotionTimer > 0) {
            ctx.save();
            ctx.strokeStyle = '#f97316';
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 14;
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 11 + Math.sin(this.animTime * 10) * 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (this.speedPotionTimer > 0) {
            ctx.save();
            ctx.strokeStyle = '#38bdf8';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 14;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (this.damageBoostTimer > 0 || this.speedBoostTimer > 0) {
            ctx.strokeStyle = this.damageBoostTimer > 0 ? '#fbbf24' : '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(-this.radius - 8, -this.radius - 8, (this.radius + 8) * 2, (this.radius + 8) * 2);
            ctx.setLineDash([]);
        }
        if (this.sleepTimer > 0) {
            ctx.save();
            const sleepPulse = 0.45 + Math.sin(this.animTime * 8) * 0.2;
            const sleepGrad = ctx.createRadialGradient(0, 0, 8, 0, 0, 48);
            sleepGrad.addColorStop(0, `rgba(129, 140, 248, ${sleepPulse * 0.55})`);
            sleepGrad.addColorStop(0.65, `rgba(168, 85, 247, ${sleepPulse * 0.35})`);
            sleepGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
            ctx.fillStyle = sleepGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 48, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
        if (this.poisonTimer > 0) {
            ctx.save();
            ctx.strokeStyle = '#39ff14';
            ctx.shadowColor = '#39ff14';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 2.2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 12 + Math.sin(this.animTime * 11) * 1.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
        if (this.weaknessTimer > 0) {
            ctx.save();
            ctx.strokeStyle = '#a855f7';
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, 4, this.radius + 17, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Parpadeo de invulnerabilidad
        if (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 25) % 2 === 0 && this.hitFlash <= 0) {
            ctx.globalAlpha = 0.55;
        }

        // ¿Carga player.png? (Escala aumentada en 75% para que destaque en la mazmorra)
        if (playerImg.complete && playerImg.naturalWidth > 0) {
            const pSize = 74;
            ctx.drawImage(playerImg, -pSize / 2, -pSize / 2, pSize, pSize);

            // Hit flash blanco al recibir daño
            if (this.hitFlash > 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fillRect(-pSize / 2, -pSize / 2, pSize, pSize);
                ctx.restore();
            }
        } else {
            // Fallback procedural de héroe voxel / Minecraft escalado
            ctx.save();
            ctx.scale(1.7, 1.7);
            const skinColor = this.hitFlash > 0 ? '#ffffff' : '#f1c27d';
            const shirtColor = this.hitFlash > 0 ? '#ffffff' : '#00b4d8';
            const pantsColor = this.hitFlash > 0 ? '#ffffff' : '#1e3a8a';
            const hairColor = '#3b2f2f';

            // Cabeza
            ctx.fillStyle = skinColor;
            ctx.fillRect(-8, -18, 16, 14);
            // Cabello
            ctx.fillStyle = hairColor;
            ctx.fillRect(-8, -18, 16, 5);
            ctx.fillRect(-8, -18, 4, 9);
            // Ojos
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(2, -11, 4, 3);
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(4, -11, 2, 3);
            // Torso
            ctx.fillStyle = shirtColor;
            ctx.fillRect(-9, -4, 18, 14);
            // Piernas
            ctx.fillStyle = pantsColor;
            ctx.fillRect(-8, 10, 7, 10);
            ctx.fillRect(1, 10, 7, 10);
            ctx.restore();
        }

        ctx.restore();

        // 4. Mano Flotante Articulada y Anclaje de Armas (Distancia orbital aumentada proporcionalmente)
        const handOrbitRadius = 40;
        let weaponAngle = this.aimAngle;
        if (this.currentWeapon === 'SWORD') {
            weaponAngle = this.aimAngle + (this.swingDir * 0.75);
            if (this.isAttacking) {
                const progress = 1 - (this.attackTimer / this.attackDuration);
                const halfArc = this.swordArc * 0.5;
                weaponAngle = this.attackBaseAngle + this.swingDir * MathUtils.lerp(-halfArc, halfArc, progress);
            }
        }

        const handX = this.x + Math.cos(weaponAngle) * handOrbitRadius;
        const handY = this.y + walkBob + Math.sin(weaponAngle) * (handOrbitRadius * 0.85);

        ctx.save();
        ctx.translate(handX, handY);

        // Mano circular de tono piel (#f1c27d con borde oscuro #5c4033 estilo pixel/blocky)
        const handSkin = this.hitFlash > 0 ? '#ffffff' : '#f1c27d';
        ctx.fillStyle = handSkin;
        ctx.strokeStyle = '#5c4033';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (this.currentWeapon === 'RIFLE') {
            ctx.save();
            ctx.rotate(this.aimAngle);
            if (facingLeft) ctx.scale(1, -1);
            ctx.translate(-this.rifleRecoil * 7, 0);
            // Culata
            ctx.fillStyle = '#1f2937';
            ctx.strokeStyle = '#020617';
            ctx.lineWidth = 1.2;
            ctx.fillRect(-14, -3, 12, 7);
            ctx.strokeRect(-14, -3, 12, 7);
            // Cuerpo táctico oscuro
            ctx.fillStyle = '#111827';
            ctx.fillRect(-2, -4.5, 24, 9);
            ctx.strokeRect(-2, -4.5, 24, 9);
            // Cargador
            ctx.fillStyle = '#334155';
            ctx.fillRect(7, 4, 6, 11);
            ctx.strokeRect(7, 4, 6, 11);
            // Empuñadura
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(-1, 4, 4, 8);
            // Cañón largo
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(22, -2, 26, 4);
            ctx.strokeRect(22, -2, 26, 4);
            // Punta y mira
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(46, -3, 4, 6);
            ctx.fillRect(2, -7, 10, 2.5);
            // Fogonazo
            if (this.muzzleFlash > 0) {
                ctx.shadowColor = '#fde047';
                ctx.shadowBlur = 18;
                ctx.fillStyle = '#fde047';
                ctx.beginPath();
                ctx.moveTo(50, 0);
                ctx.lineTo(60, -7);
                ctx.lineTo(68, 0);
                ctx.lineTo(60, 7);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(55, 0, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else
        // Anclaje directo de la Pistola / Lola Blaster a la mano
        if (this.currentWeapon === 'GUN') {
            ctx.save();
            ctx.rotate(this.aimAngle);
            if (facingLeft) ctx.scale(1, -1);

            if (this.hasPowerUp('LOLA_BLASTER')) {
                const animTimer = Math.max(this.lolaFireAnimTimer || 0, this.lolaMouthTimer || 0);
                const useOpen = animTimer > 0;
                const tex = (useOpen && typeof lolaBlaster2Img !== 'undefined' && lolaBlaster2Img.complete && lolaBlaster2Img.naturalWidth > 0)
                    ? lolaBlaster2Img
                    : (typeof lolaBlasterImg !== 'undefined' && lolaBlasterImg.complete && lolaBlasterImg.naturalWidth > 0 ? lolaBlasterImg : null);
                const cProg = this.lolaCharging ? MathUtils.clamp(this.lolaChargeTimer / (this.lolaChargeThreshold || 1.5), 0, 1) : 0;

                // Crecimiento progresivo de 1.0x a 1.9x (+90%) con temblor de energía, y regreso suave al disparar
                let lolaScale = 1.0;
                let wobbleX = 0;
                let wobbleY = 0;
                if (cProg > 0) {
                    lolaScale = 1.0 + cProg * 0.90;
                    const wobbleAmt = cProg * 2.4;
                    wobbleX = (Math.random() - 0.5) * wobbleAmt;
                    wobbleY = (Math.random() - 0.5) * wobbleAmt;
                } else if (useOpen) {
                    const releaseRatio = MathUtils.clamp(animTimer / (this.lolaMouthDuration || 0.95), 0, 1);
                    lolaScale = 1.0 + releaseRatio * 0.90; // Regresa suavemente de 1.9x a 1.0x al disparar
                }

                if (cProg > 0) {
                    ctx.save();
                    ctx.shadowBlur = 14 + cProg * 22;
                    ctx.shadowColor = '#00f5d4';
                    ctx.strokeStyle = `rgba(0, 245, 212, ${0.45 + cProg * 0.55})`;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(16, 0, (12 + cProg * 10) * lolaScale, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * cProg);
                    ctx.stroke();
                    ctx.restore();
                }

                if (tex) {
                    ctx.save();
                    ctx.translate(wobbleX, wobbleY);
                    ctx.scale(lolaScale, lolaScale);
                    if (cProg > 0 || useOpen) {
                        ctx.shadowBlur = 16 + (cProg * 10);
                        ctx.shadowColor = '#00f5d4';
                    }
                    ctx.drawImage(tex, -8, -22, 48, 44);
                    ctx.restore();
                } else {
                    ctx.save();
                    ctx.scale(lolaScale, lolaScale);
                    ctx.fillStyle = '#06b6d4';
                    ctx.fillRect(0, -6, 26, 12);
                    ctx.restore();
                }

                // Mira láser
                ctx.strokeStyle = 'rgba(0, 245, 212, 0.45)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.moveTo(32 * lolaScale, 0);
                ctx.lineTo(135, 0);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                // Empuñadura
                ctx.fillStyle = '#3e2723';
                ctx.fillRect(-2, 1, 6, 9);
                // Cañón y corredera
                ctx.fillStyle = '#475569';
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1.3;
                ctx.fillRect(0, -3.5, 20, 7);
                ctx.strokeRect(0, -3.5, 20, 7);
                // Cañón láser/neón
                ctx.fillStyle = '#00f5d4';
                ctx.fillRect(20, -2.5, 3.5, 5);
                // Mira láser
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.moveTo(23, 0);
                ctx.lineTo(130, 0);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        } else if (this.hasSword) {
            // Anclaje directo de la Espada / Belcesword a la mano
            ctx.save();
            ctx.rotate(weaponAngle);
            if (this.hasPowerUp('BELCESWORD') && typeof belceswordImg !== 'undefined' && belceswordImg.complete && belceswordImg.naturalWidth > 0) {
                const isThird = this.isAttacking && this.activeSwingBelceThird;
                const sScale = isThird ? 1.35 : 1.0;
                ctx.save();
                ctx.scale(sScale, sScale);
                ctx.shadowBlur = isThird ? 20 : 10;
                ctx.shadowColor = '#a855f7';
                ctx.drawImage(belceswordImg, -4, -18, 66, 36);
                ctx.restore();
            } else {
                const bladeLen = this.isAttacking ? this.swordReach - 10 : 54;

                // Empuñadura (madera blocky)
                ctx.fillStyle = '#8b5a2b';
                ctx.strokeStyle = '#3e2723';
                ctx.lineWidth = 1.3;
                ctx.fillRect(-7, -3, 7, 6);
                ctx.strokeRect(-7, -3, 7, 6);

                // Guardia de la espada (oro/acero)
                ctx.fillStyle = '#fbbf24';
                ctx.fillRect(0, -8, 5, 16);
                ctx.strokeRect(0, -8, 5, 16);

                // Hoja Diamante / Minecraft Style
                const bladeColor = this.damageBoostTimer > 0 ? '#fde047' : '#00f5d4';
                ctx.fillStyle = bladeColor;
                ctx.strokeStyle = '#0284c7';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(5, -4.5);
                ctx.lineTo(bladeLen - 9, -4);
                ctx.lineTo(bladeLen, 0);
                ctx.lineTo(bladeLen - 9, 4);
                ctx.lineTo(5, 4.5);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Núcleo brillante de la hoja
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(7, -1, bladeLen - 18, 2);
            }

            ctx.restore();
        }

        ctx.restore();

        // 5. Barra de vida World-Space compacta y limpia sobre el personaje (no solapada)
        const barW = 52;
        const barH = 6;
        const barX = this.x - barW / 2;
        const barY = this.y - 54;

        // Fondo oscuro #222
        ctx.fillStyle = '#222222';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(barX, barY, barW, barH);
        ctx.fill();
        ctx.stroke();

        // Relleno verde/cian (#00f5d4) que cambia a rojo (#ef4444) si baja del 30% de HP
        const hpRatio = MathUtils.clamp(this.hp / this.maxHp, 0, 1);
        const hpColor = (this.hp <= this.maxHp * 0.3) ? '#ef4444' : '#00f5d4';
        ctx.fillStyle = hpColor;
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // Texto pequeño HP / MAX_HP
        ctx.font = '900 8.5px "Courier New", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${this.hp}/${this.maxHp}`, this.x, barY - 3);

        // 6. Indicador visual de Recarga (Pistola 0.5s / Rifle de Asalto 0.8s) sobre el jugador
        const showRifleRel = this.isReloadingRifle && (this.currentWeapon === 'RIFLE' || !this.isReloadingPistol);
        const showPistolRel = this.isReloadingPistol && !showRifleRel;
        if (showRifleRel || showPistolRel) {
            const relW = 54;
            const relH = 5;
            const relX = this.x - relW / 2;
            const relY = barY - 19;
            const relProgress = showRifleRel
                ? MathUtils.clamp(1 - (this.rifleReloadTimer / (this.rifleReloadDuration || 0.8)), 0, 1)
                : MathUtils.clamp(1 - (this.pistolReloadTimer / (this.pistolReloadDuration || 0.5)), 0, 1);
            const relColor = showRifleRel ? '#fbbf24' : '#38bdf8';
            const textColor = showRifleRel ? '#fde047' : '#7dd3fc';

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = relColor;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.rect(relX, relY, relW, relH);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = relColor;
            ctx.fillRect(relX, relY, relW * relProgress, relH);

            ctx.font = '900 8.5px "Courier New", monospace';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('RECARGANDO...', this.x, relY - 2);
        }

        // 7. Efecto visual de Estado "Dormido" (Zzz... flotando + barra de sueño) o Aviso 1/2
        if (this.sleepTimer > 0) {
            ctx.save();
            // Filtro somnoliento azul/violeta sobre el personaje
            ctx.fillStyle = 'rgba(99, 102, 241, 0.28)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
            ctx.fill();

            // Letras animadas "Z", "z", "z" flotando hacia arriba
            const letters = ['Z', 'z', 'z'];
            for (let i = 0; i < letters.length; i++) {
                const cycle = ((this.animTime * 1.15 + i * 0.33) % 1);
                const zx = this.x + 8 + i * 10 + Math.sin(cycle * Math.PI * 2 + i) * 5;
                const zy = barY - 14 - cycle * 34;
                const alpha = cycle < 0.2 ? cycle / 0.2 : (1 - cycle);
                ctx.globalAlpha = MathUtils.clamp(alpha, 0, 1);
                ctx.font = `900 ${16 - i * 2}px "Courier New", monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 3;
                ctx.strokeText(letters[i], zx, zy);
                ctx.fillStyle = i % 2 === 0 ? '#c084fc' : '#818cf8';
                ctx.fillText(letters[i], zx, zy);
            }

            // Barra indicadora de sueño restante
            ctx.globalAlpha = 1;
            const sw = 54;
            const sh = 4.5;
            const sx = this.x - sw * 0.5;
            const sy = barY - 14;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(sx, sy, sw, sh);
            ctx.fillStyle = '#c084fc';
            ctx.fillRect(sx, sy, sw * MathUtils.clamp(this.sleepTimer / 1.8, 0, 1), sh);
            ctx.restore();
        } else if (this.gargoyleHits === 1) {
            ctx.save();
            ctx.font = '900 9.5px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.5;
            ctx.strokeText('1/2 💤', this.x, barY - 13);
            ctx.fillStyle = '#c084fc';
            ctx.fillText('1/2 💤', this.x, barY - 13);
            ctx.restore();
        }

        // 8. Indicadores visuales de Veneno y Debilitamiento (-10% daño)
        if (this.poisonTimer > 0 || this.weaknessTimer > 0) {
            ctx.save();
            ctx.font = '900 9.5px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.5;
            let statusY = barY - (this.sleepTimer > 0 || this.gargoyleHits === 1 ? 26 : 13);
            if (this.poisonTimer > 0) {
                const pTxt = `☠️ ${this.poisonTimer.toFixed(1)}s`;
                ctx.strokeText(pTxt, this.x, statusY);
                ctx.fillStyle = '#39ff14';
                ctx.fillText(pTxt, this.x, statusY);
                statusY -= 12;
            }
            if (this.weaknessTimer > 0) {
                const wTxt = `⬇-10% (${this.weaknessTimer.toFixed(1)}s)`;
                ctx.strokeText(wTxt, this.x, statusY);
                ctx.fillStyle = '#c084fc';
                ctx.fillText(wTxt, this.x, statusY);
            }
            ctx.restore();
        }
    }
}
