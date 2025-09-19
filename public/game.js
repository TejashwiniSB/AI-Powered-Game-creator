/* public/game.js
  Frontend: calls POST /generate { prompt } (if available)
  Fallback: local presets (so demo always works)
*/

const PRESETS = {
  jungle_runner: {
    "type":"runner","width":14,"height":8,"tileSize":48,
    "player":{"x":1,"y":6,"speed":220},
    "obstacles":[{"x":4,"y":6},{"x":7,"y":6},{"x":10,"y":6}],
    "collectibles":[{"x":3,"y":5,"type":"banana","value":1},{"x":6,"y":5,"type":"banana","value":1},{"x":9,"y":5,"type":"banana","value":1},{"x":11,"y":5,"type":"banana","value":1},{"x":12,"y":5,"type":"banana","value":1}],
    "rules":{"jump":true,"gravity":true,"win_condition":"collect_all"}
  },
  maze_cat_cheese: {
    "type":"maze","width":12,"height":8,"tileSize":48,
    "player":{"x":0,"y":0,"speed":180},
    "goal":{"x":11,"y":7},
    "obstacles":[{"x":1,"y":0},{"x":1,"y":1},{"x":1,"y":2},{"x":3,"y":2},{"x":4,"y":2},{"x":6,"y":1},{"x":6,"y":2},{"x":6,"y":3},{"x":8,"y":5},{"x":9,"y":5}],
    "enemies":[{"x":5,"y":4,"behavior":"patrol","patrol":[[5,4],[7,4]]}],
    "collectibles":[{"x":2,"y":3,"type":"cheese","value":10}],
    "rules":{"jump":false,"gravity":false,"win_condition":"reach_goal"}
  },
  space_shooter: {
    "type":"shooter","width":12,"height":10,"tileSize":48,
    "player":{"x":6,"y":8,"speed":200},
    "enemies":[{"x":3,"y":2,"behavior":"move_down","hp":1},{"x":6,"y":1,"behavior":"move_down","hp":1},{"x":9,"y":2,"behavior":"move_down","hp":1}],
    "rules":{"jump":false,"gravity":false,"win_condition":"score_target"}
  }
};

function ruleFallback(prompt) {
  const p = (prompt||"").toLowerCase();
  if (p.includes("jungle") || p.includes("banana") || p.includes("runner")) return PRESETS.jungle_runner;
  if (p.includes("maze") || p.includes("cheese") || p.includes("cat")) return PRESETS.maze_cat_cheese;
  if (p.includes("space") || p.includes("shooter") || p.includes("asteroid")) return PRESETS.space_shooter;
  return PRESETS.jungle_runner;
}

async function generateSpec(prompt) {
  // Try backend first
  try {
    const resp = await fetch("http://172.20.10.2:5000/generate", { // UPDATED: Member 1 local IP
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    if (!resp.ok) throw new Error("non-200");
    const data = await resp.json();
    // backend may return { spec: {...} } or directly {...}
    const spec = data.spec || data;
    console.log("Got spec from backend:", spec);
    return spec;
  } catch (err) {
    console.warn("Backend /generate failed, using fallback. Err:", err);
    return ruleFallback(prompt);
  }
}

/* Phaser renderer: converts spec -> playable game */
let game = null;
const DEFAULT_TILE = 48;

function startPhaser(spec) {
  if (!spec) { alert("No spec provided"); return; }
  if (game) { game.destroy(true); game = null; }

  const tile = spec.tileSize || DEFAULT_TILE;
  const width = (spec.width || 12) * tile;
  const height = (spec.height || 8) * tile;

  const config = {
    type: Phaser.AUTO,
    parent: "gameContainer",
    width, height,
    physics: { default: "arcade", arcade: { gravity: { y: spec.rules?.gravity ? 300 : 0 }, debug: false } },
    scene: {
      preload() {
        const g = this.make.graphics();
        g.fillStyle(0x00aa00); g.fillRect(0,0,tile,tile); g.generateTexture('player', tile, tile);
        g.clear(); g.fillStyle(0xffcc00); g.fillRect(0,0,tile/2,tile/2); g.generateTexture('coin', tile, tile);
        g.clear(); g.fillStyle(0xff3333); g.fillRect(0,0,tile,tile); g.generateTexture('enemy', tile, tile);
        g.clear(); g.fillStyle(0x333333); g.fillRect(0,0,tile,tile); g.generateTexture('obst', tile, tile);
        g.destroy();
      },
      create() {
        const s = spec;
        this.obstacles = this.physics.add.staticGroup();
        (s.obstacles||[]).forEach(o => {
          const x = o.x*tile + tile/2, y = o.y*tile + tile/2;
          const rect = this.add.image(x, y, 'obst').setDisplaySize(tile, tile);
          this.obstacles.add(rect);
        });

        const px = (s.player?.x || 0) * tile + tile/2;
        const py = (s.player?.y || 0) * tile + tile/2;
        this.player = this.physics.add.sprite(px, py, 'player').setDisplaySize(tile*0.8, tile*0.8);
        this.player.setCollideWorldBounds(true);
        this.player.speed = s.player?.speed || 180;

        if (s.goal) {
          const gx = s.goal.x*tile + tile/2, gy = s.goal.y*tile + tile/2;
          this.goal = this.physics.add.staticImage(gx, gy, 'coin').setDisplaySize(tile*0.8, tile*0.8);
        }

        this.collectibles = this.physics.add.staticGroup();
        (s.collectibles||[]).forEach(c => {
          const cx = c.x*tile + tile/2, cy = c.y*tile + tile/2;
          const coin = this.add.image(cx, cy, 'coin').setDisplaySize(tile*0.5, tile*0.5);
          this.collectibles.add(coin);
        });

        this.enemies = this.physics.add.group();
        (s.enemies||[]).forEach(e => {
          const ex = e.x*tile + tile/2, ey = e.y*tile + tile/2;
          const en = this.physics.add.sprite(ex, ey, 'enemy').setDisplaySize(tile*0.8, tile*0.8);
          en.behavior = e.behavior || "idle"; en.patrol = e.patrol || [];
          this.enemies.add(en);
        });

        this.physics.add.collider(this.player, this.obstacles);
        this.physics.add.collider(this.player, this.enemies, () => {
          this.cameras.main.flash(200, 255, 0, 0);
          this.time.delayedCall(200, () => this.scene.restart());
        }, null, this);

        this.physics.add.overlap(this.player, this.collectibles, (p,c) => { c.destroy(); }, null, this);
        if (this.goal) {
          this.physics.add.overlap(this.player, this.goal, () => {
            setTimeout(()=>alert("You win!"), 50);
          }, null, this);
        }

        this.cursors = this.input.keyboard.createCursorKeys();
      },
      update() {
        const p = this.player;
        if (!p) return;
        p.setVelocity(0);
        if (this.cursors.left.isDown) p.setVelocityX(-p.speed);
        else if (this.cursors.right.isDown) p.setVelocityX(p.speed);
        if (this.cursors.up.isDown) p.setVelocityY(-p.speed);
        else if (this.cursors.down.isDown) p.setVelocityY(p.speed);

        this.enemies.children.iterate(en => {
          if (!en.patrol || en.patrol.length < 2) return;
          const tileSize = spec.tileSize || DEFAULT_TILE;
          const target = en.patrol[0];
          const targetX = target[0]*tile + tile/2;
          if (Math.abs(en.x - targetX) < 4) {
            en.patrol.push(en.patrol.shift());
            en.setVelocityX(0);
          } else {
            const dir = en.x < targetX ? 1 : -1;
            en.setVelocityX(50 * dir);
          }
        });
      }
    }
  };

  game = new Phaser.Game(config);
}

/* UI wiring */
document.getElementById('gen').onclick = async () => {
  const prompt = document.getElementById('prompt').value || "jungle runner";
  document.getElementById('gen').disabled = true;
  document.getElementById('gen').innerText = "Generating...";
  try {
    const spec = await generateSpec(prompt);
    startPhaser(spec);
  } catch (e) {
    alert("Error generating spec: " + e.message);
  } finally {
    document.getElementById('gen').disabled = false;
    document.getElementById('gen').innerText = "Generate & Play";
  }
};

document.getElementById('preset1').onclick = () => startPhaser(PRESETS.jungle_runner);
document.getElementById('preset2').onclick = () => startPhaser(PRESETS.maze_cat_cheese);
document.getElementById('preset3').onclick = () => startPhaser(PRESETS.space_shooter);

// Quick auto-start a default so the canvas isn't blank
startPhaser(PRESETS.jungle_runner);