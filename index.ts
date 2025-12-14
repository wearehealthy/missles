
import * as THREE from 'three';
import { GameState, STAGES, StageConfig } from '../types';

export class GameEngine {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    container: HTMLElement;
    
    // Game Objects
    missiles: THREE.Group[] = [];
    enemies: THREE.Group[] = [];
    enemyBullets: THREE.Mesh[] = []; 
    particles: any[] = [];
    barriers: THREE.Group | null = null;
    starfield: THREE.Points | null = null;
    
    // Assets
    materials: Record<string, THREE.Material> = {};
    geometries: Record<string, THREE.BufferGeometry> = {};
    particleTexture: THREE.Texture | null = null;
    
    // State
    mode: 'story' | 'casual' | 'menu' | 'gameover' = 'menu';
    isRunning: boolean = false;
    isPaused: boolean = false;
    mouse3D: THREE.Vector3 = new THREE.Vector3();
    liveMouse3D: THREE.Vector3 = new THREE.Vector3();
    lastMouseTime: number = 0; 
    
    // Time Management
    lastTime: number = 0;

    // Logic vars
    bossActive: any = null; 
    enemiesToSpawn: number = 0;
    spawnTimer: number = 0;
    
    // Regen Counters
    regenCounters = { normal: 0, big: 0, nuke: 0 };

    currentStageConfig: StageConfig | null = null;

    // Casual Mode
    casualSpawnCounter: number = 0;
    casualSpawnFreq: number = 60;
    particleCount: number = 600; 
    particlesMesh: THREE.Points | null = null;
    
    // Callbacks
    onStateUpdate: (s: Partial<GameState>) => void;
    onGameOver: () => void;
    onWaveComplete: () => void;
    
    currentState: GameState;

    constructor(container: HTMLElement, updateCallback: (s: Partial<GameState>) => void, gameOverCallback: () => void, waveCompleteCallback: () => void, initialState: GameState) {
        this.container = container;
        this.onStateUpdate = updateCallback;
        this.onGameOver = gameOverCallback;
        this.onWaveComplete = waveCompleteCallback;
        this.currentState = JSON.parse(JSON.stringify(initialState));

        // Init Three.js
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x000000, 0.005);
        
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 50);
        
        // High Performance Renderer Settings
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        container.appendChild(this.renderer.domElement);

        // Lighting
        const amb = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(amb);
        const dir = new THREE.DirectionalLight(0xffffff, 1.5);
        dir.position.set(10, 20, 20);
        this.scene.add(dir);
        const rim = new THREE.SpotLight(0x4ade80, 5); 
        rim.position.set(-20, 10, 10);
        rim.lookAt(0,0,0);
        this.scene.add(rim);

        this.initAssets();
        this.createBarriers();
        
        window.addEventListener('resize', this.onResize);
        window.addEventListener('mousemove', this.onMouseMove);
        
        this.lastTime = performance.now();
        this.animate();
    }

    initAssets() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const gr = ctx.createRadialGradient(32,32,0,32,32,32);
            gr.addColorStop(0, 'rgba(255,255,255,1)');
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gr;
            ctx.fillRect(0,0,64,64);
        }
        this.particleTexture = new THREE.CanvasTexture(canvas);

        const geoms = this.geometries;
        
        // Models
        geoms.nukeMain = new THREE.CylinderGeometry(1.0, 1.0, 7.5, 16); 
        geoms.nukeNose = new THREE.ConeGeometry(1.0, 2.0, 16); 
        geoms.nukeFin = new THREE.BoxGeometry(0.1, 1.8, 1.0); 
        geoms.nukeTail = new THREE.CylinderGeometry(0.8, 1.0, 1.0, 16);

        geoms.bigBody = new THREE.CylinderGeometry(0.6, 0.6, 3.5, 12);
        geoms.bigNose = new THREE.SphereGeometry(0.6, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const deltaPts = new Float32Array([0,1.3,0, 1.3,-0.9,0, 0,-0.9,0, 0,1.3,0, 0,-0.9,0, 1.3,-0.9,0]);
        geoms.bigFin = new THREE.BufferGeometry();
        geoms.bigFin.setAttribute('position', new THREE.BufferAttribute(deltaPts, 3));

        geoms.smallBody = new THREE.CylinderGeometry(0.2, 0.2, 3.0, 8);
        geoms.smallHead = new THREE.SphereGeometry(0.2, 8, 8, 0, Math.PI*2, 0, Math.PI/2);
        const smallFinPts = new Float32Array([0,0.7,0, 0.7,-0.4,0, 0,-0.4,0, 0,0.7,0, 0,-0.4,0, 0.7,-0.4,0]);
        geoms.smallFin = new THREE.BufferGeometry();
        geoms.smallFin.setAttribute('position', new THREE.BufferAttribute(smallFinPts, 3));
        
        geoms.scoutRing = new THREE.TorusGeometry(1.2, 0.2, 8, 16); 
        geoms.scoutEye = new THREE.SphereGeometry(0.6, 16, 16);
        geoms.fighterBody = new THREE.ConeGeometry(0.8, 3.5, 4);
        geoms.fighterWing = new THREE.ConeGeometry(0.4, 2.5, 4); 
        geoms.dreadMain = new THREE.BoxGeometry(2.5, 4, 1.5);
        geoms.dreadSide = new THREE.BoxGeometry(1, 3, 1.5);
        geoms.dreadTurret = new THREE.CylinderGeometry(0.4, 0.4, 1, 8);
        geoms.droneCore = new THREE.IcosahedronGeometry(0.7, 0);
        geoms.droneSpike = new THREE.ConeGeometry(0.2, 1.2, 8);

        geoms.bossMain = new THREE.CylinderGeometry(4, 3, 8, 6);
        geoms.bossWing = new THREE.BoxGeometry(12, 2, 4);
        geoms.bossCore = new THREE.IcosahedronGeometry(2, 2);
        geoms.bossCannon = new THREE.CylinderGeometry(0.5, 0.5, 4);

        geoms.barrierPole = new THREE.CylinderGeometry(0.2, 0.2, 100, 8);
        geoms.enemyBullet = new THREE.SphereGeometry(0.6, 8, 8);

        geoms.hpBg = new THREE.PlaneGeometry(3, 0.4);
        geoms.hpFg = new THREE.PlaneGeometry(2.9, 0.3);
        geoms.hpFg.translate(1.45, 0, 0);

        const mats = this.materials;
        mats.nukeBody = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.4, metalness: 0.5 }); 
        mats.nukeFins = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }); 

        mats.bigBody = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3 });
        mats.bigFin = new THREE.MeshStandardMaterial({ color: 0x374151, side: THREE.DoubleSide });
        mats.bigGlass = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.1, emissive: 0x1d4ed8, emissiveIntensity: 0.5 });
        mats.stdBody = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.5 });
        mats.stdDark = new THREE.MeshStandardMaterial({ color: 0x4b5563, side: THREE.DoubleSide }); 
        
        mats.enemyBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
        mats.enemyGrey = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3 });
        mats.enemyRedGlow = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 2.5 }); 
        mats.enemyGreenGlow = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x004400, emissiveIntensity: 2 }); 
        
        mats.bossHull = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.2, metalness: 0.8 });
        mats.bossCore = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 4 }); 
        
        mats.barrierGlow = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
        mats.bullet = new THREE.MeshBasicMaterial({ color: 0xff4400 });
        
        mats.hpBg = new THREE.MeshBasicMaterial({ color: 0x000000 });
        mats.hpFg = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
    }

    createBarriers() {
        if (this.barriers) return;
        this.barriers = new THREE.Group();
        // EXACT ARENA WIDTH: 35
        const left = new THREE.Mesh(this.geometries.barrierPole, this.materials.barrierGlow);
        left.position.set(-35, 0, 0);
        const right = new THREE.Mesh(this.geometries.barrierPole, this.materials.barrierGlow);
        right.position.set(35, 0, 0);
        this.barriers.add(left, right);
        this.scene.add(this.barriers);
    }

    createStoryBackground() {
        if (this.starfield) {
            this.scene.remove(this.starfield);
            this.starfield.geometry.dispose();
            this.starfield = null;
        }
        const count = 1500;
        const positions = new Float32Array(count * 3);
        const speeds = [];
        for(let i=0; i<count; i++) {
            positions[i*3] = (Math.random() - 0.5) * 200;
            positions[i*3+1] = (Math.random() - 0.5) * 200;
            positions[i*3+2] = -50 + (Math.random() * 50);
            speeds.push(0.2 + Math.random() * 0.5);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.5, transparent: true, opacity: 0.6 });
        this.starfield = new THREE.Points(geo, mat);
        this.starfield.userData = { speeds };
        this.scene.add(this.starfield);
    }

    startStory(levelIndex: number, isSidePath: boolean = false) {
        this.cleanupEntities();
        this.mode = 'story';
        this.isRunning = true;
        this.isPaused = false;
        if (this.barriers) this.barriers.visible = true;
        
        if (this.particlesMesh) { this.scene.remove(this.particlesMesh); this.particlesMesh = null; }
        
        this.createStoryBackground();

        let stage = STAGES[levelIndex];
        if (isSidePath && stage.sidePath) stage = stage.sidePath;
        this.currentStageConfig = stage;

        if (stage.type === 'wave') {
            this.enemiesToSpawn = stage.count || 5;
            this.bossActive = null;
        } else {
            this.enemiesToSpawn = 0;
            this.spawnBoss(stage.hp || 500);
        }
    }

    startCasual() {
        this.cleanupEntities();
        this.mode = 'casual';
        this.isRunning = true;
        this.isPaused = false;
        if (this.barriers) this.barriers.visible = true;
        if (this.starfield) { this.scene.remove(this.starfield); this.starfield = null; }
        this.onStateUpdate({ health: 100 });
        this.currentState.health = 100;
        this.casualSpawnCounter = 0;
        this.casualSpawnFreq = 60;
        this.particleCount = 500;
        this.createParticleWeb();
    }

    createParticleWeb() {
        const positions = new Float32Array(this.particleCount * 3);
        const geo = new THREE.BufferGeometry();
        for (let i = 0; i < this.particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 90;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 2] = -5 + (Math.random() - 0.5) * 10;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x047857, size: 0.6, transparent: true, opacity: 0.6, 
            map: this.particleTexture, blending: THREE.AdditiveBlending, depthWrite: false
        });
        this.particlesMesh = new THREE.Points(geo, mat);
        this.scene.add(this.particlesMesh);
        this.particlesMesh.geometry.userData.velocities = [];
        for (let i = 0; i < this.particleCount; i++) {
             this.particlesMesh.geometry.userData.velocities.push(
                 new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, 0)
             );
        }
    }

    updateParticleWeb() {
        if (!this.particlesMesh) return;
        const positions = this.particlesMesh.geometry.attributes.position.array as Float32Array;
        const velocities = this.particlesMesh.geometry.userData.velocities as THREE.Vector3[];

        for (let i = 0; i < this.particleCount; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            
            positions[ix] += velocities[i].x;
            positions[iy] += velocities[i].y;

            if (positions[ix] > 50) positions[ix] = -50;
            if (positions[ix] < -50) positions[ix] = 50;
            if (positions[iy] > 35) positions[iy] = -35;
            if (positions[iy] < -35) positions[iy] = 35;
        }
        this.particlesMesh.geometry.attributes.position.needsUpdate = true;
    }

    spawnBoss(hp: number) {
        const g = new THREE.Group();
        const hull = new THREE.Mesh(this.geometries.bossMain, this.materials.bossHull);
        hull.rotation.x = Math.PI / 2;
        const wings = new THREE.Mesh(this.geometries.bossWing, this.materials.bossHull);
        const core = new THREE.Mesh(this.geometries.bossCore, this.materials.bossCore);
        const c1 = new THREE.Mesh(this.geometries.bossCannon, this.materials.enemyGrey);
        c1.position.set(-3, -2, 2); c1.rotation.x = Math.PI/2;
        const c2 = new THREE.Mesh(this.geometries.bossCannon, this.materials.enemyGrey);
        c2.position.set(3, -2, 2); c2.rotation.x = Math.PI/2;
        
        const light = new THREE.PointLight(0xff0000, 1.5, 30);
        g.add(light);
        g.add(hull, wings, core, c1, c2);
        g.position.set(0, 40, 0); 
        this.scene.add(g);
        
        this.bossActive = { 
            mesh: g, 
            hp, 
            maxHp: hp, 
            state: 'entering',
            nextShot: 1.5,
            moveState: 'strafe',
            moveTimer: 0
        };
        this.onStateUpdate({ bossStatus: { name: 'VOID MOTHERSHIP', hp, maxHp: hp } });
    }

    spawnEnemy() {
        const difficulty = this.currentStageConfig?.difficulty || 0;
        const currentWave = this.currentState.wave;

        let type = 'scout';
        if (currentWave > 1 && Math.random() > 0.7) type = 'drone';
        if (difficulty >= 1 && Math.random() > 0.6) type = 'fighter';
        if (difficulty >= 2 && Math.random() > 0.8) type = 'dread';

        const g = new THREE.Group();
        let hp, speed, dmg;

        let hpMult = 1.0;
        let speedMult = 1.0;
        if (currentWave > 5) {
            hpMult = 1 + ((currentWave - 5) * 0.25);
            speedMult = 1 + ((currentWave - 5) * 0.03);
        }
        
        const matBlack = this.materials.enemyBlack.clone();
        const matGrey = this.materials.enemyGrey.clone();
        const matRed = this.materials.enemyRedGlow.clone();
        const matGreen = this.materials.enemyGreenGlow.clone();

        if (type === 'dread') {
            const main = new THREE.Mesh(this.geometries.dreadMain, matBlack);
            const sideL = new THREE.Mesh(this.geometries.dreadSide, matGrey); sideL.position.x = -1.8;
            const sideR = new THREE.Mesh(this.geometries.dreadSide, matGrey); sideR.position.x = 1.8;
            const turret = new THREE.Mesh(this.geometries.dreadTurret, matRed); turret.position.y = 1; turret.rotation.x = Math.PI/2;
            g.add(main, sideL, sideR, turret);
            hp = 30 * hpMult; speed = 0.05 * speedMult; dmg = 10;
        } 
        else if (type === 'fighter') {
            const body = new THREE.Mesh(this.geometries.fighterBody, matBlack);
            body.rotation.x = Math.PI; 
            const wingL = new THREE.Mesh(this.geometries.fighterWing, matRed);
            wingL.position.set(-0.8, 0, 0); wingL.rotation.z = 0.5; wingL.rotation.x = Math.PI;
            const wingR = new THREE.Mesh(this.geometries.fighterWing, matRed);
            wingR.position.set(0.8, 0, 0); wingR.rotation.z = -0.5; wingR.rotation.x = Math.PI;
            g.add(body, wingL, wingR);
            hp = 5 * hpMult; speed = 0.25 * speedMult; dmg = 5;
        } 
        else if (type === 'drone') {
            const core = new THREE.Mesh(this.geometries.droneCore, matBlack);
            g.add(core);
            const positions = [[0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1]];
            positions.forEach(p => {
                const s = new THREE.Mesh(this.geometries.droneSpike, matGreen);
                s.position.set(p[0]*0.6, p[1]*0.6, p[2]*0.6);
                s.lookAt(new THREE.Vector3(p[0]*2, p[1]*2, p[2]*2));
                s.rotation.x += Math.PI/2;
                g.add(s);
            });
            hp = 2 * hpMult; speed = 0.35 * speedMult; dmg = 2;
        } 
        else {
            const ring = new THREE.Mesh(this.geometries.scoutRing, matGrey);
            ring.rotation.x = Math.PI/2;
            const eye = new THREE.Mesh(this.geometries.scoutEye, matRed);
            g.add(ring, eye);
            g.userData.rotates = true;
            hp = 3.5 * hpMult; speed = 0.15 * speedMult; dmg = 1;
        }
        
        // SPAWN RANGE: 60 (fits within 35 radius arena)
        g.position.set((Math.random()-0.5)*60, 45, 0); 
        
        const hpGroup = new THREE.Group();
        hpGroup.position.set(0, 3.5, 0); 
        const bg = new THREE.Mesh(this.geometries.hpBg, this.materials.hpBg);
        const fg = new THREE.Mesh(this.geometries.hpFg, this.materials.hpFg);
        fg.position.z = 0.05; fg.position.x = -1.45;
        hpGroup.add(bg, fg);
        g.add(hpGroup);
        
        g.userData = { ...g.userData, velocity: new THREE.Vector3(0, -speed, 0), hp, maxHp: hp, dmg, hpBar: fg };
        
        this.scene.add(g);
        this.enemies.push(g);
    }

    createMissileGroup(type: 'normal'|'big'|'nuke') {
        const g = new THREE.Group();
        if (type === 'nuke') {
            const body = new THREE.Mesh(this.geometries.nukeMain, this.materials.nukeBody); 
            body.rotation.x = Math.PI/2;
            const nose = new THREE.Mesh(this.geometries.nukeNose, this.materials.nukeBody);
            nose.position.y = 4.75; 
            body.add(nose);
            const tail = new THREE.Mesh(this.geometries.nukeTail, this.materials.nukeBody);
            tail.position.y = -4.25;
            body.add(tail);
            for(let i=0; i<4; i++) {
                const fin = new THREE.Mesh(this.geometries.nukeFin, this.materials.nukeFins);
                fin.position.set(0, -4.5, 0);
                fin.rotation.y = (Math.PI/2) * i;
                fin.translateZ(1.2);
                body.add(fin);
            }
            g.add(body);
        } else if (type === 'big') {
            const body = new THREE.Mesh(this.geometries.bigBody, this.materials.bigBody); body.rotation.x = Math.PI/2;
            const nose = new THREE.Mesh(this.geometries.bigNose, this.materials.bigGlass); nose.position.z = 1.75; nose.rotation.x = Math.PI/2;
            g.add(body, nose);
        } else {
            const body = new THREE.Mesh(this.geometries.smallBody, this.materials.stdBody); body.rotation.x = Math.PI/2;
            const head = new THREE.Mesh(this.geometries.smallHead, this.materials.stdBody); head.position.z = 1.5; 
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), this.materials.stdDark); fin.position.set(0,0.2,-1.3);
            g.add(body, head, fin);
        }
        return g;
    }

    spawnMissile(type: 'normal' | 'big' | 'nuke'): string | boolean {
        const activeCount = this.missiles.filter(m => m.userData.type === type).length;
        if (type === 'nuke' && activeCount >= 1 && this.mode !== 'casual') return 'LIMIT';
        if (type === 'big' && activeCount >= 5 && this.mode !== 'casual') return 'LIMIT';

        const startPos = new THREE.Vector3(0, -45, 0);
        if (this.mode === 'casual') {
            const angle = Math.random() * Math.PI * 2;
            const dist = 70 + Math.random() * 20; 
            startPos.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        }

        const target = this.liveMouse3D.clone(); target.z = 0;
        
        const upgrades = this.currentState.upgradeLevels;
        const stats = type === 'big' ? upgrades.big : type === 'nuke' ? upgrades.nuke : upgrades.normal;
        const speedLvl = stats.speed || 0;

        let baseSpeed = 0.8;
        if (type === 'big') baseSpeed = 0.6;
        if (type === 'nuke') baseSpeed = 0.4;
        
        let finalSpeed = baseSpeed + (speedLvl * 0.05);
        if (this.mode === 'casual') finalSpeed *= 0.8;

        const mesh = this.createMissileGroup(type);
        
        if (type === 'nuke' && this.mode === 'story') {
             mesh.position.set(0, -60, 0); 
             mesh.userData = { type, state: 'launching', launchTime: 0, targetPos: target, finalSpeed };
             mesh.rotation.x = -Math.PI/2; 
        } else {
             const dir = new THREE.Vector3().subVectors(target, startPos).normalize();
             mesh.position.copy(startPos);
             mesh.lookAt(startPos.clone().add(dir));
             mesh.userData = { type, velocity: dir.multiplyScalar(finalSpeed), speed: finalSpeed };
        }

        this.scene.add(mesh);
        this.missiles.push(mesh);
        return true;
    }

    createExplosion(pos: THREE.Vector3, type: string) {
        if (type === 'nuke') {
            this.createNukeExplosion(pos);
            return;
        }

        let count = 500, maxAge = 60, size = 1.0;
        const upgrades = this.currentState.upgradeLevels;
        const radLevel = (type === 'big' ? upgrades.big.radius : upgrades.normal.radius) || 0;
        const baseRad = type === 'big' ? 18 : 6;
        const effectiveRad = baseRad + (radLevel * (type === 'big' ? 3 : 1.5)); 
        
        count += Math.floor(radLevel * 100);
        
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const colors = [];
        const palette = type === 'big' ? [0x2563eb, 0x60a5fa] : [0xf97316, 0xff8800];

        for(let i=0; i<count; i++) {
            positions[i*3] = pos.x + (Math.random()-0.5); 
            positions[i*3+1] = pos.y + (Math.random()-0.5); 
            positions[i*3+2] = pos.z + (Math.random()-0.5);
            const v = new THREE.Vector3().randomDirection().multiplyScalar(effectiveRad * 0.05);
            velocities.push(v);
            const col = new THREE.Color(palette[Math.floor(Math.random()*palette.length)]);
            colors.push(col.r, col.g, col.b);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size: size + (radLevel * 0.1), vertexColors: true, map: this.particleTexture, 
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
        });
        const points = new THREE.Points(geo, mat);
        points.userData.velocities = velocities;
        this.scene.add(points);
        
        this.particles.push({ points, age: 0, maxAge, type: 'expl', center: pos.clone(), radius: effectiveRad });

        const dmgLevel = (type === 'big' ? upgrades.big.dmg : upgrades.normal.dmg) || 0;
        const baseDmg = type === 'big' ? 12 : 2; 
        let totalDmg = baseDmg + (dmgLevel * (type === 'big' ? 3 : 1));
        
        const critLevel = (type === 'big' ? upgrades.big.crit : upgrades.normal.crit) || 0;
        if (critLevel > 0 && Math.random() < (critLevel * 0.05)) totalDmg *= 2;

        this.checkDamage(pos, effectiveRad, totalDmg);
    }

    createNukeExplosion(pos: THREE.Vector3) {
        const upgrades = this.currentState.upgradeLevels;
        const radLevel = upgrades.nuke.radius || 0;
        const effectiveRad = 60 + (radLevel * 10);
        
        let count = 5000;
        let maxAge = 120;
        
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const colors = [];
        const palette = [0x00ff00, 0x33ff33, 0x008800, 0xccffcc]; 

        for(let i=0; i<count; i++) {
            positions[i*3] = pos.x; positions[i*3+1] = pos.y; positions[i*3+2] = pos.z;
             const v = new THREE.Vector3().randomDirection().multiplyScalar(effectiveRad * 0.03);
            velocities.push(v);
            const col = new THREE.Color(palette[Math.floor(Math.random()*palette.length)]);
            colors.push(col.r, col.g, col.b);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({ size: 3.0, vertexColors: true, map: this.particleTexture, blending: THREE.AdditiveBlending, transparent: true });
        const points = new THREE.Points(geo, mat);
        this.scene.add(points);

        this.particles.push({ 
            points, age: 0, maxAge, type: 'sphere', velocities, 
            center: pos.clone(), radius: effectiveRad 
        });

        const fireball = new THREE.Mesh(
            new THREE.SphereGeometry(1, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0xaaffaa, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
        );
        fireball.position.copy(pos);
        this.scene.add(fireball);
        this.particles.push({ type: 'fireball', mesh: fireball, age: 0, maxAge: 80, maxRadius: effectiveRad * 0.8 });

        this.checkDamage(pos, effectiveRad, 100 + (upgrades.nuke.dmg||0)*20);
    }

    checkDamage(pos: THREE.Vector3, radius: number, damage: number) {
        if (this.mode !== 'story') return; 

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].position.distanceTo(pos) < radius) {
                const e = this.enemies[i];
                e.userData.hp -= damage;
                if (e.userData.hpBar) e.userData.hpBar.scale.set(Math.max(0, e.userData.hp / e.userData.maxHp), 1, 1);
                e.traverse((c: any) => {
                    if (c.isMesh && c.material.emissive) {
                        c.material.emissive.setHex(0xffffff);
                        setTimeout(() => c.material.emissive.setHex(c.userData.origEmissive || 0x000000), 50);
                    }
                });

                if (e.userData.hp <= 0) {
                    this.scene.remove(e);
                    this.enemies.splice(i, 1);
                    // FIXED REWARD: 20
                    this.onStateUpdate({ money: this.currentState.money + 20 });
                }
            }
        }
        if (this.bossActive && this.bossActive.mesh.position.distanceTo(pos) < radius + 10) {
            this.bossActive.hp -= damage;
            this.onStateUpdate({ bossStatus: { name: 'VOID MOTHERSHIP', hp: Math.max(0, this.bossActive.hp), maxHp: this.bossActive.maxHp } });

            if(this.bossActive.hp<=0) {
                 this.scene.remove(this.bossActive.mesh);
                 this.bossActive = null;
                 this.enemyBullets.forEach(b => this.scene.remove(b));
                 this.enemyBullets = [];
                 this.onStateUpdate({ money: this.currentState.money + 1000, bossStatus: null }); 
                 this.onWaveComplete();
            }
        }
    }

    update() {
        if (!this.isRunning || this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); 
        this.lastTime = now;

        if (this.mode === 'story') {
            const upgrades = this.currentState.upgradeLevels;
            const maxAmmo = this.currentState.maxAmmo;
            let ammo = { ...this.currentState.ammo }; 
            let updatedAmmo = false;
            
            const normalDur = Math.max(0.1, 1.0 - ((upgrades.normal.reload||0) * 0.08)); 
            const bigDur = Math.max(0.5, 5.0 - ((upgrades.big.reload||0) * 0.4));
            const nukeDur = Math.max(5.0, 20.0 - ((upgrades.nuke.reload||0) * 1.0));

            if (ammo.normal < maxAmmo.normal) {
                this.regenCounters.normal += dt;
                if (this.regenCounters.normal >= normalDur) { ammo.normal++; this.regenCounters.normal = 0; updatedAmmo = true; }
            }
            if (this.currentState.playerClass !== 'c' && ammo.big < maxAmmo.big) {
                this.regenCounters.big += dt;
                if (this.regenCounters.big >= bigDur) { ammo.big++; this.regenCounters.big = 0; updatedAmmo = true; }
            }
            if (this.currentState.playerClass === 'a' && ammo.nuke < maxAmmo.nuke) {
                this.regenCounters.nuke += dt;
                if (this.regenCounters.nuke >= nukeDur) { ammo.nuke++; this.regenCounters.nuke = 0; updatedAmmo = true; }
            }

            const updates: any = { 
                reloadProgress: {
                    normal: ammo.normal >= maxAmmo.normal ? 1 : this.regenCounters.normal / normalDur,
                    big: ammo.big >= maxAmmo.big ? 1 : this.regenCounters.big / bigDur,
                    nuke: ammo.nuke >= maxAmmo.nuke ? 1 : this.regenCounters.nuke / nukeDur
                },
                reloadTimeLeft: {
                    normal: Math.ceil((normalDur - this.regenCounters.normal)*10)/10,
                    big: Math.ceil((bigDur - this.regenCounters.big)*10)/10,
                    nuke: Math.ceil((nukeDur - this.regenCounters.nuke)*10)/10
                }
            };
            if (updatedAmmo) updates.ammo = ammo;
            this.onStateUpdate(updates);

            if (this.bossActive) {
                const boss = this.bossActive;
                if (boss.state === 'entering') {
                    boss.mesh.position.y -= 10 * dt; 
                    if (boss.mesh.position.y <= 12) { boss.mesh.position.y = 12; boss.state = 'fighting'; }
                } else {
                    boss.moveTimer += dt;
                    if (boss.moveState === 'strafe') {
                         boss.mesh.position.x = Math.sin(now * 0.0008) * 30;
                         if (boss.moveTimer > 10) { boss.moveState = 'centering'; boss.moveTimer = 0; }
                    } else if (boss.moveState === 'centering') {
                         boss.mesh.position.x = THREE.MathUtils.lerp(boss.mesh.position.x, 0, dt * 8); 
                         if (Math.abs(boss.mesh.position.x) < 0.5 || boss.moveTimer > 3) { boss.moveState = 'holding'; boss.moveTimer = 0; }
                    } else if (boss.moveState === 'holding') {
                         boss.mesh.position.x = 0;
                         if (boss.moveTimer > 4) { boss.moveState = 'strafe'; boss.moveTimer = 0; }
                    }

                    boss.mesh.position.y = 12 + Math.sin(now * 0.002) * 2;
                    boss.nextShot -= dt;
                    if (boss.nextShot <= 0) {
                        for(let i=-2; i<=2; i++) {
                            const bull = new THREE.Mesh(this.geometries.enemyBullet, this.materials.bullet);
                            bull.position.copy(boss.mesh.position); bull.position.y-=4;
                            const angle = i * 0.2; 
                            const speed = 8;
                            bull.userData = { velocity: new THREE.Vector3(Math.sin(angle) * speed, -Math.cos(angle) * speed, 0) };
                            this.scene.add(bull); this.enemyBullets.push(bull);
                        }
                        boss.nextShot = 1.5; 
                    }
                }
                boss.mesh.children[2].rotation.y += dt; 
                boss.mesh.children[2].rotation.z += dt * 0.5;
            }

            if (!this.bossActive && this.enemiesToSpawn > 0) {
                this.spawnTimer++;
                const stageFreq = this.currentStageConfig?.freq || 100;
                if (this.spawnTimer > stageFreq) {
                    this.spawnEnemy();
                    this.enemiesToSpawn--;
                    this.spawnTimer = 0;
                }
            } else if (!this.bossActive && this.enemiesToSpawn === 0 && this.enemies.length === 0) {
                this.onWaveComplete();
            }

        } else if (this.mode === 'casual') {
            if(this.particlesMesh) this.updateParticleWeb();
            this.casualSpawnCounter += dt;
            if (this.casualSpawnCounter > 1.0) {
                const type = Math.random() < 0.1 ? 'nuke' : Math.random() < 0.4 ? 'big' : 'normal';
                this.spawnMissile(type as any);
                this.casualSpawnCounter = 0;
            }

            const timeSinceMove = performance.now() - this.lastMouseTime;
            const isMouseMoving = timeSinceMove < 150; 
            
            if (isMouseMoving) {
                const target = this.liveMouse3D.clone(); target.z = 0;
                this.missiles.forEach(m => {
                    if (m.userData.state === 'launching') return;
                    m.lookAt(target); 
                    const dir = new THREE.Vector3().subVectors(target, m.position).normalize();
                    m.userData.velocity = dir.multiplyScalar(m.userData.speed);
                });
            } else {
                 this.missiles.forEach(m => {
                    if (m.userData.state === 'launching') return;
                    m.userData.velocity.set(0,0,0);
                });
            }
        }

        this.mouse3D.lerp(this.liveMouse3D, 0.5);

        for (let i = this.missiles.length - 1; i >= 0; i--) {
            const m = this.missiles[i];
            let intercepted = false;
            for (let j = this.enemyBullets.length - 1; j >= 0; j--) {
                const b = this.enemyBullets[j];
                if (m.position.distanceTo(b.position) < 3) {
                     this.createExplosion(m.position, m.userData.type);
                     this.scene.remove(b); this.enemyBullets.splice(j, 1);
                     this.scene.remove(m); this.missiles.splice(i, 1);
                     intercepted = true; break; 
                }
            }
            if (intercepted) continue; 

            if (m.userData.state === 'launching') {
                m.userData.launchTime += dt;
                m.position.y = -60 + (m.userData.launchTime / 5.0) * 20;
                m.position.x = (Math.random() - 0.5) * 0.2;
                if (m.userData.launchTime >= 5.0) {
                    m.userData.state = 'flying';
                    const dir = new THREE.Vector3().subVectors(m.userData.targetPos, m.position).normalize();
                    m.userData.velocity = dir.multiplyScalar(m.userData.finalSpeed);
                    m.lookAt(m.position.clone().add(dir));
                }
            } else {
                if (m.userData.velocity) m.position.add(m.userData.velocity);
            }
            
            if (m.position.distanceTo(this.camera.position) > 200) {
                this.scene.remove(m); this.missiles.splice(i, 1);
            }
            if (this.mode === 'story' && m.userData.state !== 'launching') {
                let hit = false;
                let hitDist = m.userData.type === 'big' ? 6 : m.userData.type === 'nuke' ? 8 : 4;
                for(const e of this.enemies) {
                     if (m.position.distanceTo(e.position) < hitDist) { this.createExplosion(m.position, m.userData.type); hit = true; break; }
                }
                if (!hit && this.bossActive && m.position.distanceTo(this.bossActive.mesh.position) < hitDist + 6) {
                    this.createExplosion(m.position, m.userData.type); hit = true;
                }
                if (hit) { this.scene.remove(m); this.missiles.splice(i, 1); }
            }
        }

        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            const move = b.userData.velocity.clone().multiplyScalar(dt);
            b.position.add(move);
            
            // --- NEW: BOUNCE LOGIC (Arena 35 -> Bounce at 33) ---
            if (b.position.x > 33 || b.position.x < -33) {
                b.userData.velocity.x *= -1; 
                b.position.x = b.position.x > 33 ? 33 : -33; 
            }
            
            let intercepted = false;
            for(const p of this.particles) {
                if (p.center && p.radius && b.position.distanceTo(p.center) < p.radius) {
                    if (p.age < p.maxAge * 0.9) { intercepted = true; break; }
                }
            }
            if (intercepted) { this.scene.remove(b); this.enemyBullets.splice(i, 1); continue; }

            if (b.position.y < -50) { this.scene.remove(b); this.enemyBullets.splice(i, 1); continue; }
            if (b.position.y < -35) { this.damagePlayer(3); this.scene.remove(b); this.enemyBullets.splice(i, 1); }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.position.add(e.userData.velocity);
            if (e.userData.rotates) e.children[0].rotation.z += 0.05;
            if (e.position.y < -35) {
                this.damagePlayer(e.userData.dmg || 10);
                this.scene.remove(e);
                this.enemies.splice(i, 1);
            }
        }
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age++;
            const t = p.age / p.maxAge;
            
            if (p.type === 'sphere') {
                const pos = p.points.geometry.attributes.position.array;
                const v = p.velocities;
                for(let j=0; j<v.length; j++) {
                    v[j].multiplyScalar(0.95);
                    pos[j*3] += v[j].x; pos[j*3+1] += v[j].y; pos[j*3+2] += v[j].z;
                }
                p.points.geometry.attributes.position.needsUpdate = true;
                p.points.material.opacity = Math.max(0, 1.0 - t);
            } else if (p.type === 'fireball') {
                 const progress = p.age / p.maxAge;
                 let scale = 1;
                 if (progress < 0.2) scale = (progress / 0.2) * p.maxRadius;
                 else scale = p.maxRadius;
                 p.mesh.scale.set(scale, scale, scale);
                 p.mesh.material.opacity = Math.max(0, 0.9 * (1 - progress));
            } else {
                const pos = p.points.geometry.attributes.position.array;
                const v = p.points.userData.velocities;
                if(v) {
                    for(let j=0; j<v.length; j++) {
                        v[j].multiplyScalar(0.95);
                        pos[j*3] += v[j].x; pos[j*3+1] += v[j].y; pos[j*3+2] += v[j].z;
                    }
                    p.points.geometry.attributes.position.needsUpdate = true;
                }
                p.points.material.opacity = 1 - t;
            }

            if(p.age >= p.maxAge) { 
                if (p.points) this.scene.remove(p.points); 
                if (p.mesh) this.scene.remove(p.mesh);
                this.particles.splice(i, 1); 
            }
        }
    }

    damagePlayer(amount: number) {
        if (this.mode === 'casual') return; 
        let newHealth = this.currentState.health - amount;
        if (newHealth <= 0) {
            newHealth = 0;
            this.isRunning = false;
            this.onGameOver();
        }
        this.onStateUpdate({ health: newHealth });
        this.currentState.health = newHealth;
    }

    animate = () => {
        requestAnimationFrame(this.animate);
        this.update();
        this.renderer.render(this.scene, this.camera);
    }

    onResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove = (e: MouseEvent) => {
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = -(e.clientY / window.innerHeight) * 2 + 1;
        const vec = new THREE.Vector3(x, y, 0.5);
        vec.unproject(this.camera);
        const dir = vec.sub(this.camera.position).normalize();
        const t = (0 - this.camera.position.z) / dir.z; 
        this.liveMouse3D.copy(this.camera.position.clone().add(dir.multiplyScalar(t)));
        this.lastMouseTime = performance.now(); 
    }

    handleClick(weapon: 'normal'|'big'|'nuke'): string | boolean {
        if (this.mode === 'casual') {
            this.missiles.forEach(m => this.createExplosion(m.position, m.userData.type));
            this.missiles.forEach(m => this.scene.remove(m));
            this.missiles = [];
            return true;
        } else if (this.mode === 'story') {
            return this.spawnMissile(weapon);
        }
        return false;
    }

    triggerDebug(key: string) {
        if (this.mode !== 'casual') return;
        if (key === 'p') {
             const type = Math.random() < 0.1 ? 'nuke' : Math.random() < 0.4 ? 'big' : 'normal';
             this.spawnMissile(type as any);
        }
        if (key === 'o') {
             for(let i=0; i<100; i++) this.spawnMissile('nuke');
        }
    }

    cleanupEntities() {
        [...this.missiles, ...this.enemies, ...this.enemyBullets].forEach(o => this.scene.remove(o));
        this.particles.forEach(p => {
             if (p.points) this.scene.remove(p.points);
             if (p.mesh) this.scene.remove(p.mesh);
        });
        if (this.bossActive) this.scene.remove(this.bossActive.mesh);
        if (this.particlesMesh) { this.scene.remove(this.particlesMesh); this.particlesMesh = null; }
        if (this.starfield) { this.scene.remove(this.starfield); this.starfield = null; }

        this.missiles = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.particles = [];
        this.bossActive = null;
        this.onStateUpdate({ bossStatus: null });
    }

    dispose() {
        this.container.removeChild(this.renderer.domElement);
        this.renderer.dispose();
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('mousemove', this.onMouseMove);
    }
}
