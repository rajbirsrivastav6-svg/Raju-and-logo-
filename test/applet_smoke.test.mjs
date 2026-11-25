import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = process.cwd();

test('metadata.json and index.html are synchronized and complete', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8'));
  assert.ok(meta.name.includes('Clockwork Sanctum'));
  assert.ok(meta.description.length > 20);
  assert.ok(Array.isArray(meta.requestFramePermissions));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes(`<title>${meta.name}</title>`));
  assert.ok(html.includes(`property="og:title" content="${meta.name}"`));
  assert.ok(html.includes(meta.description));
  assert.ok(html.includes('id="game-canvas"'));
  assert.ok(html.includes('id="hud-root"'));
});

test('all engine scripts and welcome screen sprites exist in public/', () => {
  const required = [
    'public/lib/three.min.js',
    'public/js/config.js',
    'public/js/levels.js',
    'public/js/textures.js',
    'public/js/world.js',
    'public/js/contraptions.js',
    'public/js/units.js',
    'public/js/vfx-post.js',
    'public/js/audio.js',
    'public/js/simulation.js',
    'public/js/hud.js',
    'public/js/main.js',
    'public/assets/welcome/logo_crest.png',
    'public/assets/welcome/btn_play.png',
    'public/assets/welcome/btn_islands.png',
    'public/assets/welcome/mascot_warrior.png',
    'public/assets/welcome/mascot_rogue.png',
    'public/assets/welcome/mascot_mage.png',
    'public/assets/welcome/cube_music.png',
    'public/assets/welcome/cube_stars.png',
    'public/assets/welcome/cube_guide.png',
    'public/assets/welcome/cube_gear.png',
  ];
  for (const rel of required) {
    const full = path.join(ROOT, rel);
    assert.ok(fs.existsSync(full), `Missing ${rel}`);
    assert.ok(fs.statSync(full).size > 100, `Empty ${rel}`);
  }
});

test('all 6 campaign levels load cleanly, expose threat highlights, and pass deterministic solutions', () => {
  const sandbox = {
    console,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    setTimeout,
    clearTimeout,
    document: null,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  for (const rel of ['public/js/config.js', 'public/js/levels.js', 'public/js/simulation.js']) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }

  assert.equal(Object.keys(sandbox.GAME.LEVELS).length, 6);

  // Mock World height oracle for audit checks on initial level states
  sandbox.GAME.World = {
    getHeightAt: () => 0.0,
    buildLevel: () => {},
    syncTiles: () => {},
    setTileHighlights: () => {}
  };

  for (let lv = 1; lv <= 6; lv++) {
    const st = sandbox.GAME.Simulation.loadLevel(lv, true);
    assert.equal(st.levelId, lv);
    const hasDanger = (st.validHighlights || []).some((hl) => hl.kind === 'danger');
    assert.ok(hasDanger, `Expected live Rogue danger highlight on Level ${lv}`);
    const audit = sandbox.GAME_TEST.runAuditSuite();
    assert.equal(audit.obstaclePenetrations, 0, `Obstacle penetration on Level ${lv}`);
    assert.equal(audit.agentOverlapPairs, 0, `Agent overlap on Level ${lv}`);
  }

  const suite = sandbox.GAME_TEST.runAllSolutions(true);
  assert.equal(suite.total, 6);
  assert.equal(suite.passedCount, 6, `Failed level results: ${JSON.stringify(suite.results)}`);
  assert.equal(suite.allPassed, true);
  for (const res of suite.results) {
    assert.equal(res.victory, true, `Level ${res.levelId} did not achieve victory`);
    assert.ok(res.steps <= res.parSteps, `Level ${res.levelId} exceeded par steps (${res.steps} > ${res.parSteps})`);
  }
});
