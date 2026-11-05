// Broom Flight 3D scene (three.js, MIT). Loaded only on the Broom Flight page.
//
// Built upon "The Aviator" by Karim Maaloul (Codrops, https://tympanus.net/codrops/?p=26501,
// licence: free to integrate or build upon in personal and commercial projects, not to be
// republished as-is). Ideas kept from it: a big rotating cylinder as the ground, low-poly
// cube clouds circling the world, a pilot that eases towards its target height and tilts with
// its speed, and pooled particles. Everything else is new: a night wizard world (hills with
// pine trees, a castle, stars and a moon), a wizard on a broom, word rings at three heights,
// a magic-dust trail and spell bursts. Written for modern three.js (BufferGeometry, no
// TweenMax). The game rules live in the React reducer (broom-flight.tsx); this file only draws.

import * as THREE from "three";

export type SceneColors = {
  night1: string;
  night2: string;
  night3: string;
  star: string;
  moon: string;
  castle: string;
  window: string;
  parchment: string;
  parchmentEdge: string;
  ink: string;
  gold: string;
  spell: string;
  good: string;
  bad: string;
  fire: string;
  ember: string;
  displayFont: string;
};

/** What the scene draws this frame (written by React, read every frame). */
export type SceneInput = {
  round: number; // changes when a new set of rings comes
  words: string[]; // top, middle, bottom ring
  gate: number; // 0 = rings far right, 1 = rings at the broom
  lane: number; // 0 top, 1 middle, 2 bottom
  result: "" | "right" | "wrong"; // the rings were passed
  resultLane: number;
  speed: number; // 1 = start speed
  paused: boolean;
  reduced: boolean;
};

const WORLD_R = 600;
const LANE_GAP = 38;
const MID_Y = 72;

export class BroomScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 1, 2000);
  private world = new THREE.Group();
  private sky = new THREE.Group();
  private clouds: THREE.Group[] = [];
  private player = new THREE.Group();
  private cape!: THREE.Mesh;
  private rings: { group: THREE.Group; ring: THREE.Mesh; label: THREE.Sprite; tex: THREE.CanvasTexture; mat: THREE.MeshStandardMaterial }[] = [];
  private dust: THREE.Points;
  private dustData: { x: number; y: number; z: number; vx: number; vy: number; life: number; max: number; r: number; g: number; b: number }[] = [];
  private col: Record<keyof Omit<SceneColors, "displayFont">, THREE.Color>;
  private font: string;
  private input: SceneInput;
  private raf = 0;
  private last = performance.now();
  private round = -1;
  private resultShown = "";
  private halfW = 100;
  private playerX = -60;
  private playerY = MID_Y;
  private vy = 0;
  private time = 0;
  private flash = 0;
  private shake = 0;
  private hemi: THREE.HemisphereLight;

  constructor(
    private canvas: HTMLCanvasElement,
    colors: SceneColors,
    input: SceneInput,
  ) {
    this.input = input;
    this.font = colors.displayFont;
    const { displayFont: _f, ...rest } = colors;
    void _f;
    this.col = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, new THREE.Color(v)])) as BroomScene["col"];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(this.col.night1);
    this.scene.fog = new THREE.Fog(this.col.night2, 260, 900);

    this.hemi = new THREE.HemisphereLight(this.col.night3, this.col.night1, 1.4);
    const moonLight = new THREE.DirectionalLight(this.col.moon, 1.6);
    moonLight.position.set(-150, 350, 250);
    const glow = new THREE.PointLight(this.col.gold, 2.2, 160, 1.2);
    glow.position.set(0, 0, 30);
    this.player.add(glow);
    this.scene.add(this.hemi, moonLight, new THREE.AmbientLight(this.col.night2, 0.6));

    this.buildSky();
    this.buildWorld();
    this.buildPlayer();
    this.buildRings();
    this.dust = this.buildDust();
    this.scene.add(this.world, this.sky, this.player);

    this.camera.position.set(0, MID_Y, 210);
    this.camera.lookAt(0, MID_Y, 0);
  }

  // ---------- building ----------

  private buildSky() {
    // Stars on a big sphere behind everything.
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = Math.random() * 700 - 120;
      pos.set([Math.cos(a) * 900, h, -500 - Math.random() * 300], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: this.col.star, size: 2.2, sizeAttenuation: false, fog: false }));
    this.scene.add(stars);

    const moon = new THREE.Mesh(new THREE.SphereGeometry(34, 32, 16), new THREE.MeshBasicMaterial({ color: this.col.moon, fog: false }));
    moon.position.set(180, 230, -420);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(this.col.moon), transparent: true, depthWrite: false, fog: false, opacity: 0.55 }));
    halo.scale.set(220, 220, 1);
    halo.position.copy(moon.position);
    this.scene.add(moon, halo);

    // Aviator-style clouds: a few tumbling cubes, here in night violet, circling the world.
    const mat = new THREE.MeshStandardMaterial({ color: this.col.night3, flatShading: true, roughness: 1 });
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      const blocks = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < blocks; b++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), mat);
        m.position.set(b * 15, Math.random() * 10, Math.random() * 10);
        m.rotation.set(0, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        const s = 0.2 + Math.random() * 0.9;
        m.scale.set(s, s, s);
        c.add(m);
      }
      const a = (i / 18) * Math.PI * 2;
      const h = WORLD_R + 160 + Math.random() * 160;
      c.position.set(Math.cos(a) * h, Math.sin(a) * h - WORLD_R, -180 - Math.random() * 300);
      c.rotation.z = a + Math.PI / 2;
      const s = 1 + Math.random() * 1.6;
      c.scale.set(s, s, s);
      this.clouds.push(c);
      this.sky.add(c);
    }
  }

  private buildWorld() {
    // Ground: a low-poly cylinder with bumpy hills, rotating under the broom.
    const geo = new THREE.CylinderGeometry(WORLD_R, WORLD_R, 900, 60, 8);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const r = Math.hypot(v.x, v.y);
      if (r > 1) {
        const k = 1 + (Math.random() * 10) / r;
        p.setXY(i, v.x * k, v.y * k);
      }
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: this.col.night2, flatShading: true, roughness: 1 }));
    this.world.add(ground);

    // Pine trees around the cylinder.
    const treeMat = new THREE.MeshStandardMaterial({ color: this.col.castle, flatShading: true, roughness: 1 });
    for (let i = 0; i < 90; i++) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(8 + Math.random() * 6, 30 + Math.random() * 30, 6), treeMat);
      const a = Math.random() * Math.PI * 2;
      const r = WORLD_R + 10;
      tree.position.set(Math.cos(a) * r, Math.sin(a) * r, -40 - Math.random() * 300);
      tree.rotation.z = a - Math.PI / 2;
      this.world.add(tree);
    }

    // Castles with lit windows, now and then along the way.
    const wallMat = new THREE.MeshStandardMaterial({ color: this.col.castle, flatShading: true });
    const roofMat = new THREE.MeshStandardMaterial({ color: this.col.night3, flatShading: true });
    const winMat = new THREE.MeshBasicMaterial({ color: this.col.window });
    for (let c = 0; c < 4; c++) {
      const castle = new THREE.Group();
      for (let t = 0; t < 4; t++) {
        const h = 50 + Math.random() * 70;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, h, 8), wallMat);
        tower.position.set(t * 26 - 39, h / 2, 0);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(13, 26, 8), roofMat);
        roof.position.set(tower.position.x, h + 13, 0);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 7), winMat);
        win.position.set(tower.position.x, h * 0.7, 11);
        castle.add(tower, roof, win);
      }
      const wall = new THREE.Mesh(new THREE.BoxGeometry(80, 34, 14), wallMat);
      wall.position.y = 17;
      castle.add(wall);
      const a = (c / 4) * Math.PI * 2 + 0.4;
      castle.position.set(Math.cos(a) * WORLD_R, Math.sin(a) * WORLD_R, -150 - c * 30);
      castle.rotation.z = a - Math.PI / 2;
      this.world.add(castle);
    }
    this.world.position.y = -WORLD_R;
  }

  private buildPlayer() {
    // A wizard on a broom, made of simple low-poly shapes.
    const flat = (color: THREE.Color, emissive?: THREE.Color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, emissive: emissive ?? new THREE.Color(0), emissiveIntensity: emissive ? 1 : 0 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 54, 6), flat(this.col.parchmentEdge));
    stick.rotation.z = Math.PI / 2;
    const bristles = new THREE.Mesh(new THREE.ConeGeometry(7, 20, 8), flat(this.col.ember));
    bristles.rotation.z = Math.PI / 2;
    bristles.position.x = -33;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3, 8), flat(this.col.gold));
    band.rotation.z = Math.PI / 2;
    band.position.x = -23;

    const robe = new THREE.Mesh(new THREE.ConeGeometry(9, 22, 8), flat(this.col.night3));
    robe.position.set(-4, 12, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), flat(this.col.parchment));
    head.position.set(-3, 27, 0);
    const beard = new THREE.Mesh(new THREE.ConeGeometry(3.5, 8, 6), flat(this.col.star));
    beard.position.set(1, 22, 0);
    beard.rotation.z = Math.PI;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.2, 12), flat(this.col.night2));
    brim.position.set(-3, 31, 0);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(6, 18, 10), flat(this.col.night2));
    hat.position.set(-6, 40, 0);
    hat.rotation.z = 0.35;
    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 16, 5), flat(this.col.parchmentEdge));
    wand.position.set(9, 16, 4);
    wand.rotation.z = -1;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), flat(this.col.spell, this.col.spell));
    tip.position.set(15.5, 20.5, 4);
    const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(this.col.spell), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    tipGlow.scale.set(16, 16, 1);
    tipGlow.position.copy(tip.position);
    this.cape = new THREE.Mesh(new THREE.PlaneGeometry(18, 16, 4, 2), new THREE.MeshStandardMaterial({ color: this.col.bad, side: THREE.DoubleSide, flatShading: true }));
    this.cape.position.set(-14, 16, -3);
    this.player.add(stick, bristles, band, robe, head, beard, brim, hat, wand, tip, tipGlow, this.cape);
    this.player.scale.setScalar(1.25);
  }

  private buildRings() {
    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: this.col.gold, emissive: this.col.gold, emissiveIntensity: 0.9, flatShading: true, metalness: 0.3, roughness: 0.4 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 2.2, 8, 28), mat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(this.col.gold), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
      glow.scale.set(60, 60, 1);
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 144;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      label.position.set(0, 0, 4);
      group.add(glow, ring, label);
      group.visible = false;
      this.scene.add(group);
      this.rings.push({ group, ring, label, tex, mat });
    }
  }

  private buildDust(): THREE.Points {
    const max = 400;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setDrawRange(0, 0);
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 5, map: this.glowTexture(new THREE.Color(1, 1, 1)), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(pts);
    return pts;
  }

  private glowTexture(color: THREE.Color): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `#${color.getHexString()}`);
    grd.addColorStop(0.3, `#${color.getHexString()}88`);
    grd.addColorStop(1, `#${color.getHexString()}00`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private drawLabel(i: number, word: string, state: "" | "right" | "wrong") {
    const { tex, label } = this.rings[i];
    const c = tex.image as HTMLCanvasElement;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    const edge = state === "right" ? this.col.good : state === "wrong" ? this.col.bad : this.col.parchmentEdge;
    // a parchment banner with rounded ends
    g.fillStyle = `#${this.col.parchment.getHexString()}`;
    g.strokeStyle = `#${edge.getHexString()}`;
    g.lineWidth = state ? 12 : 6;
    g.beginPath();
    g.roundRect(8, 16, c.width - 16, c.height - 32, 40);
    g.fill();
    g.stroke();
    g.fillStyle = `#${this.col.ink.getHexString()}`;
    let size = 64;
    g.font = `800 ${size}px ${this.font}`;
    while (g.measureText(word).width > c.width - 70 && size > 30) {
      size -= 4;
      g.font = `800 ${size}px ${this.font}`;
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(word, c.width / 2, c.height / 2 + 4);
    tex.needsUpdate = true;
    label.userData.aspect = c.width / c.height;
  }

  private burst(x: number, y: number, color: THREE.Color, n: number, power = 1) {
    for (let i = 0; i < n && this.dustData.length < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * power;
      this.dustData.push({ x, y, z: 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.6, r: color.r, g: color.g, b: color.b });
    }
  }

  // ---------- running ----------

  laneY(lane: number) {
    return MID_Y + (1 - lane) * LANE_GAP;
  }

  setInput(input: SceneInput) {
    this.input = input;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Visible half width at z = 0; the broom sits at 22% from the left edge.
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    this.halfW = halfH * this.camera.aspect;
    this.playerX = -this.halfW + this.halfW * 2 * 0.22;
    // Narrow screens: a smaller wizard so the rings keep room.
    this.player.scale.setScalar(THREE.MathUtils.clamp(this.halfW / 130, 0.75, 1.25));
  }

  start() {
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number) {
    const inp = this.input;
    const run = inp.paused ? 0 : dt;
    this.time += run;
    const speed = inp.speed;

    // World and sky turn under the broom (Aviator style).
    this.world.rotation.z += run * 0.18 * speed;
    this.sky.rotation.z += run * 0.06 * speed;
    if (!inp.reduced) for (const c of this.clouds) for (const [i, m] of c.children.entries()) m.rotation.z += run * 0.3 * (i + 1) * 0.2;

    // Broom: ease to the lane height, tilt with the vertical speed, bob, flap the cape.
    const target = this.laneY(inp.lane);
    const prev = this.playerY;
    this.playerY += (target - this.playerY) * Math.min(1, run * 7);
    this.vy = (this.playerY - prev) / Math.max(run, 0.001);
    const bob = inp.reduced ? 0 : Math.sin(this.time * 3) * 2.2;
    this.player.position.set(this.playerX, this.playerY + bob, 0);
    this.player.rotation.z = THREE.MathUtils.clamp(this.vy * 0.004, -0.4, 0.4);
    const cp = this.cape.geometry.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i);
      cp.setZ(i, inp.reduced ? 0 : Math.sin(this.time * 10 + x * 0.4) * (9 - x) * 0.15);
    }
    cp.needsUpdate = true;

    // Rings: a new set each round, moving from the right edge to the broom.
    if (inp.round !== this.round) {
      this.round = inp.round;
      this.resultShown = "";
      inp.words.forEach((w, i) => this.drawLabel(i, w, ""));
    }
    const startX = this.halfW + 40;
    const x = startX + (this.playerX - startX) * Math.min(1, inp.gate);
    const labelW = Math.min(60, this.halfW * 0.62);
    this.rings.forEach((r, i) => {
      r.group.visible = i < inp.words.length && inp.round > 0;
      r.group.position.set(x, this.laneY(i), 0);
      r.ring.rotation.y = inp.reduced ? 0 : Math.sin(this.time * 2 + i) * 0.3;
      const aspect = (r.label.userData.aspect as number) || 3.5;
      r.label.scale.set(labelW, labelW / aspect, 1);
      // The banner fades as the ring reaches the broom, so it never hides the wizard.
      (r.label.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp((0.92 - inp.gate) / 0.12, 0, 1);
      const passed = inp.result !== "" && i === inp.resultLane;
      r.mat.emissive.copy(passed ? (inp.result === "right" ? this.col.good : this.col.bad) : this.col.gold);
      r.mat.emissiveIntensity = passed ? 1.6 : 0.8 + Math.sin(this.time * 4 + i) * 0.2;
      const s = passed && inp.result === "right" ? 1 + Math.min(0.6, (this.flash > 0 ? 1 - this.flash : 1) * 0.6) : 1;
      r.group.scale.setScalar(s);
    });

    // A result: redraw that ring's banner, burst and flash (once per round).
    if (inp.result && this.resultShown !== inp.result) {
      this.resultShown = inp.result;
      const right = inp.result === "right";
      this.drawLabel(inp.resultLane, inp.words[inp.resultLane], inp.result);
      if (!inp.reduced) {
        this.burst(this.playerX + 10, this.laneY(inp.resultLane), right ? this.col.gold : this.col.bad, right ? 90 : 50, right ? 1.6 : 1.1);
        if (right) this.burst(this.playerX + 10, this.laneY(inp.resultLane), this.col.spell, 40, 1.2);
        this.flash = 1;
        if (!right) this.shake = 1;
      }
    }
    this.flash = Math.max(0, this.flash - run * 2.5);
    this.hemi.intensity = 1.4 + this.flash * (inp.result === "right" ? 1.5 : 0.8);

    // Magic dust trail from the bristles.
    if (!inp.reduced && !inp.paused && Math.random() < 0.9) {
      const c = Math.random() < 0.5 ? this.col.gold : this.col.spell;
      this.dustData.push({ x: this.playerX - 32, y: this.player.position.y + (Math.random() - 0.5) * 6, z: 0, vx: -0.6 - Math.random() * 0.6 * speed, vy: (Math.random() - 0.5) * 0.3, life: 0, max: 0.8 + Math.random() * 0.5, r: c.r, g: c.g, b: c.b });
    }
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.dust.geometry.attributes.color as THREE.BufferAttribute;
    this.dustData = this.dustData.filter((d) => (d.life += run) < d.max);
    this.dustData.forEach((d, i) => {
      d.x += d.vx * run * 60;
      d.y += d.vy * run * 60;
      d.vy -= run * 0.4;
      const k = 1 - d.life / d.max;
      pos.setXYZ(i, d.x, d.y, d.z);
      col.setXYZ(i, d.r * k, d.g * k, d.b * k);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.dust.geometry.setDrawRange(0, this.dustData.length);

    // Camera: follows the broom a little; shakes after a wrong ring.
    this.shake = Math.max(0, this.shake - run * 2.2);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 6 * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * 6 * this.shake : 0;
    this.camera.position.x = sx;
    this.camera.position.y = MID_Y + (this.playerY - MID_Y) * 0.25 + sy;
    this.camera.lookAt(0, MID_Y + (this.playerY - MID_Y) * 0.2, 0);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
