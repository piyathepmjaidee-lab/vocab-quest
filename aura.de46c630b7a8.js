/* ════════════════════════════════════════════════════════════
   V14 · ออร่าคลาส 4 — บอกให้เห็นว่าคลาสสูงขึ้น (ผู้ใช้ขอ 13 พ.ย. 2026)

   ตั้งใจให้ต่างจากออร่าชุดประจำบท (v11-aura.js: หมอก + วงเวทใต้เท้า + ละออง) จึงซ้อนกันได้ไม่ปนกัน:
   - เสาแสงสูงด้านหลังตัว (ขึ้นไปเหนือหัว)
   - มงกุฎรัศมีหมุนลอยเหนือหัว
   - ริ้วแสงพุ่งขึ้นจากเท้า
   - ขอบเรืองรอบรูปร่างตัวละคร
   ท่าไม้ตาย/ชาร์จ/ชนะ ทำให้ออร่าลุกโชนชั่วครู่

   ฉาก 3D: ห่อ THREEART.hero(id) แบบเดียวกับ v11AuraSetup — id คือ id คลาส (V12Heroes ส่งมาตรง ๆ)
   เมนู/HUD/หน้าเลือกคลาส/โหมด 2D: ภาพ <img data-v12-hero="id"> ได้แสงเรืองด้วย CSS
   สีมาจาก window.VQ_CLASS4[id] = { parent, color, color2 } ที่ build-static.cjs ใส่ไว้
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MAP = window.VQ_CLASS4 || {};
  var ids = Object.keys(MAP);
  if (!ids.length) return;
  var reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 2D: แสงเรืองรอบภาพตัวละคร ── */
  (function css() {
    var rules = [];
    ids.forEach(function (id) {
      var c = MAP[id].color, c2 = MAP[id].color2 || c;
      var sel = 'img.v12-hero[data-v12-hero="' + id + '"]';
      var a = 'drop-shadow(0 0 3px ' + c + ') drop-shadow(0 0 10px ' + c + 'aa) drop-shadow(0 -6px 14px ' + c2 + '66)';
      var b = 'drop-shadow(0 0 5px ' + c + ') drop-shadow(0 0 18px ' + c + 'cc) drop-shadow(0 -10px 22px ' + c2 + '99)';
      rules.push(sel + '{filter:' + a + ';' + (reduced ? '' : 'animation:vqc4-' + id + ' 2.6s ease-in-out infinite;') + '}');
      rules.push('@keyframes vqc4-' + id + '{0%,100%{filter:' + a + '}50%{filter:' + b + '}}');
    });
    var st = document.createElement('style');
    st.textContent = rules.join('\n');
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ── 3D ── */
  var tex = null;
  function textures(T) {
    if (tex) return tex;
    function make(w, h, draw) {
      var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      var t = new T.CanvasTexture(c); if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t;
    }
    tex = {
      // เสาแสง: เข้มตรงกลางล่าง จางขึ้นด้านบนและด้านข้าง
      pillar: make(64, 256, function (g, w, h) {
        var gx = g.createLinearGradient(0, 0, w, 0);
        gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gx; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'destination-in';
        var gy = g.createLinearGradient(0, 0, 0, h);
        gy.addColorStop(0, 'rgba(255,255,255,0)'); gy.addColorStop(.35, 'rgba(255,255,255,.55)'); gy.addColorStop(1, 'rgba(255,255,255,1)');
        g.fillStyle = gy; g.fillRect(0, 0, w, h);
      }),
      // มงกุฎรัศมี: วงแหวน + แฉกดาว 8 แฉก
      halo: make(256, 256, function (g, n) {
        var c = n / 2; g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10;
        g.lineWidth = 7; g.beginPath(); g.arc(c, c, c - 40, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 2; g.beginPath(); g.arc(c, c, c - 56, 0, Math.PI * 2); g.stroke();
        for (var i = 0; i < 8; i++) {
          var a = i / 8 * Math.PI * 2, r0 = c - 36, r1 = c - (i % 2 ? 18 : 6), s = .13;
          g.beginPath();
          g.moveTo(c + Math.cos(a - s) * r0, c + Math.sin(a - s) * r0);
          g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
          g.lineTo(c + Math.cos(a + s) * r0, c + Math.sin(a + s) * r0);
          g.closePath(); g.fill();
        }
      }),
      // ริ้วแสง: เส้นตั้งบาง หัวสว่าง หางจาง
      wisp: make(16, 128, function (g, w, h) {
        var gy = g.createLinearGradient(0, 0, 0, h);
        gy.addColorStop(0, 'rgba(255,255,255,1)'); gy.addColorStop(.25, 'rgba(255,255,255,.7)'); gy.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gy; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
      })
    };
    return tex;
  }

  function attach(rig, id) {
    var T = window.THREE;
    if (!T || !rig || !rig.root || rig.vqC4Aura) return rig;
    var info = MAP[id], tx = textures(T);
    var col = new T.Color(info.color), col2 = new T.Color(info.color2 || info.color);
    var H = rig.opt.artHeight || rig.opt.height || 1.5, W = rig.opt.artWidth || H * .8;
    var group = new T.Group(), mats = [];
    rig.root.add(group);
    function mat(map, color, alphaOnly) {
      var m = new T.SpriteMaterial({ map: map, color: color, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: T.AdditiveBlending });
      if (alphaOnly) {
        m.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'diffuseColor.a *= texture2D( map, vMapUv ).a;'); };
        m.customProgramCacheKey = function () { return 'vq-c4-rim'; };
      }
      mats.push(m); return m;
    }
    // เสาแสงด้านหลัง
    var pillar = new T.Sprite(mat(tx.pillar, col)); pillar.center.set(.5, 0); pillar.renderOrder = -3; group.add(pillar);
    // มงกุฎรัศมีเหนือหัว
    var halo = new T.Sprite(mat(tx.halo, col2)); halo.renderOrder = 2; group.add(halo);
    // ขอบเรืองตามรูปร่าง (ภาพเฟรมเดียวกับตัวละคร ใช้แค่ alpha)
    var art = null;
    rig.root.traverse(function (n) { if (!art && n.isSprite && n.material && n.material.map && n !== pillar && n !== halo) art = n; });
    var rim = null;
    if (art && art.parent) { rim = new T.Sprite(mat(art.material.map, col, true)); rim.renderOrder = (art.renderOrder || 0) - 1; art.parent.add(rim); }
    // ริ้วแสงพุ่งขึ้น
    var wisps = [];
    for (var i = 0; i < 9; i++) {
      var s = new T.Sprite(mat(tx.wisp, i % 3 ? col : col2)); group.add(s);
      var w = { s: s }; spawn(w, true); wisps.push(w);
    }
    function spawn(w, anywhere) {
      w.life = .9 + Math.random() * .8; w.age = anywhere ? Math.random() * w.life : 0;
      w.x = (Math.random() - .5) * W * 1.1; w.z = (Math.random() - .5) * .3;
      w.rise = H * (.9 + Math.random() * .6); w.len = H * (.16 + Math.random() * .12);
    }
    var t = 0, flare = 0;
    function update(dt) {
      dt = dt || 0; t += dt; if (flare > 0) flare = Math.max(0, flare - dt * .8);
      var pulse = reduced ? 0 : Math.sin(t * 1.8) * .1, boost = 1 + flare * 1.4;
      var ry = rig.root.rotation.y;
      pillar.position.set(.3 * Math.sin(ry), -.02, -.3 * Math.cos(ry));
      pillar.scale.set(W * (.95 + pulse * .4) * (1 + flare * .4), H * (1.75 + flare * .4), 1);
      pillar.material.opacity = Math.min(1, (.38 + pulse) * boost);
      var bob = reduced ? 0 : Math.sin(t * 2.4) * H * .015;
      halo.position.set(0, H * 1.05 + bob, .02);
      halo.scale.set(W * .62 * (1 + flare * .25), W * .62 * .42 * (1 + flare * .25), 1);   // เอียงเป็นวงรี เหมือนมงกุฎลอย
      halo.material.rotation = reduced ? 0 : t * .9;
      halo.material.opacity = Math.min(1, (.8 + pulse) * boost);
      if (rim && art) {
        rim.material.map = art.material.map; rim.center.copy(art.center); rim.position.copy(art.position);
        rim.scale.set(art.scale.x * 1.06, art.scale.y * 1.06, 1);
        rim.material.opacity = Math.min(1, (.55 + pulse * 2) * boost) * (art.material.opacity == null ? 1 : art.material.opacity);
      }
      for (var i = 0; i < wisps.length; i++) {
        var w = wisps[i];
        if (!reduced) { w.age += dt * (1 + flare); if (w.age >= w.life) spawn(w, false); }
        var q = reduced ? .4 : w.age / w.life;
        w.s.position.set(w.x, q * w.rise + w.len / 2, w.z);
        w.s.scale.set(H * .035, w.len, 1);
        w.s.material.opacity = Math.min(1, q / .15) * Math.min(1, (1 - q) / .4) * .9;
      }
    }
    var baseUpdate = rig.update, basePlay = rig.play, baseDispose = rig.dispose;
    rig.update = function (dt) { if (baseUpdate) baseUpdate.apply(rig, arguments); update(dt); };
    rig.play = function (c) {
      var r = basePlay ? basePlay.apply(rig, arguments) : undefined;
      if (c === 'ultimate') flare = 1.4; else if (c === 'charge' || c === 'win') flare = 1; else if (c === 'attack' || c === 'cast') flare = Math.max(flare, .35);
      return r;
    };
    rig.dispose = function () {
      if (group.parent) group.parent.remove(group);
      if (rim && rim.parent) rim.parent.remove(rim);
      mats.forEach(function (m) { m.dispose(); });
      if (baseDispose) baseDispose.apply(rig, arguments);
    };
    rig.vqC4Aura = group;
    update(0);
    return rig;
  }

  function setup() {
    var TA = window.THREEART;
    if (!TA || typeof TA.hero !== 'function' || TA.hero.vqC4) return;
    var base = TA.hero;
    TA.hero = function (id) {
      var rig = base.apply(this, arguments);
      try { if (rig && Object.prototype.hasOwnProperty.call(MAP, id)) attach(rig, id); } catch (e) {}
      return rig;
    };
    TA.hero.vqC4 = true;
    if (base.v11) TA.hero.v11 = true;   // อย่าให้ v11AuraSetup ห่อซ้ำเพราะธงหาย
  }
  setup();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);

  window.VQClass4Aura = { attach: attach };
})();
