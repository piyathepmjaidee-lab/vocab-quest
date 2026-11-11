/* ════════════════════════════════════════════════════════════
   V13 · โหมดเสียง (เล่นแบบไม่ใช้มือ)

   เกมอ่านคำศัพท์กับตัวเลือกให้ฟัง ผู้เล่นพูดเลขข้อ ("หนึ่ง"–"สี่", "ก"–"ง")
   หรือพูดความหมายเองก็ได้ จากนั้นเกมจะกดปุ่มคำตอบนั้นแทน
   หน้าผลการต่อสู้ ฉากเนื้อเรื่อง และหน้าต่างรางวัลก็ไปต่อด้วยเสียงได้

   หลักการ:
   - ไฟล์นี้กดปุ่มเดียวกับที่นิ้วกด จึงไม่แตะตรรกะต่อสู้ คะแนน หรือเซฟเลย
   - เสียงห้ามลงโทษผู้เล่น: ฟังไม่ชัดหรือจับคำไม่ได้ก็แค่ถามใหม่
     และในเกมมี hook (ใส่ตอน build) ที่ปิดตัวจับเวลาตลอดที่โหมดเสียงเปิดอยู่
   - ท่าจารอักษร (แตะเรียงตัวอักษร) พูดไม่ได้ จึงมี hook ไม่ให้สุ่มท่านี้ตอนโหมดเสียงเปิด
   - ค่าเปิด/ปิดเก็บใน localStorage ของเครื่อง (ไม่ใช่ในเซฟ ไม่ขึ้นคลาวด์)

   ใช้ Web Speech API: SpeechRecognition (Chrome, Edge, Safari) + speechSynthesis
   ต้องเปิดผ่าน HTTPS ที่ไม่อยู่ใน iframe (iframe ของ Apps Script บล็อกไมค์)
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis;
  var PREF_KEY = 'vq.voice.v1';

  /* ─────────── ค่าที่จำไว้ในเครื่อง ─────────── */
  /* listenLang: ระบบฟังของเบราว์เซอร์ฟังได้ทีละภาษา ไม่แยกเองว่าพูดไทยหรืออังกฤษ
     ตั้งเป็นอังกฤษไว้ก่อน (ผู้ใช้ขอ 11 พ.ย.) — พูด one/two/three/four หรือคำอังกฤษ
     เปลี่ยนเป็นไทยได้ใน ⚙ ถ้าอยากพูดความหมายภาษาไทย */
  var pref = { on: false, readChoices: true, readStory: true, listenLang: 'en', beep: true };
  try {
    var saved = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.readChoices === 'boolean') pref.readChoices = saved.readChoices;
      if (typeof saved.readStory === 'boolean') pref.readStory = saved.readStory;
      if (saved.listenLang === 'th' || saved.listenLang === 'en') pref.listenLang = saved.listenLang;
      if (typeof saved.beep === 'boolean') pref.beep = saved.beep;
      // ไม่เปิดโหมดเสียงเองตอนโหลดหน้า: เบราว์เซอร์ต้องการการแตะก่อนจึงจะพูด/ขอไมค์ได้
    }
  } catch (e) {}
  function savePref() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        readChoices: pref.readChoices, readStory: pref.readStory, listenLang: pref.listenLang, beep: pref.beep
      }));
    } catch (e) {}
  }
  function isEn() { return pref.listenLang === 'en'; }

  /* ─────────── ตัวช่วยทั่วไป ─────────── */
  function $(id) { return document.getElementById(id); }
  function visible(el) {
    if (!el || el.hidden) return false;
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.hidden) return false;
    }
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  var THAI = /[฀-๿]/;
  function langOf(s) { return THAI.test(s) ? 'th-TH' : 'en-US'; }

  /* ═══════════ การจับคำพูด ═══════════ */

  // ตัวเล็ก ตัดวงเล็บ/เครื่องหมาย เหลือช่องว่างเดียวระหว่างคำ (ยังแยกคำอังกฤษได้)
  function normSp(s) {
    s = String(s || '').toLowerCase();
    s = s.replace(/\([^)]*\)/g, ' ');
    s = s.replace(/['‘’]/g, '');   // it's → its
    s = s.replace(/[.,!?"“”()\[\]\-–—\/;:…·~#]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    // คำลงท้ายสุภาพไม่ใช่ส่วนของคำตอบ
    s = s.replace(/\s*(ครับผม|ครับ|ค่ะ|คะ|ค่า|นะคะ|นะครับ|นะ|จ้ะ|จ้า|please)$/, '');
    return s;
  }
  function norm(s) { return normSp(s).replace(/\s+/g, ''); }

  /* คำนำหน้าภาษาอังกฤษตัดเฉพาะเมื่อเป็น "คำ" เต็ม ๆ ตามด้วยช่องว่าง
     (ตัดแบบติดกันจะทำให้ island → land, notice → tice) */
  var LEAD_EN = /^(?:(?:the answer is|answer is|its|it is|i choose|i want|i pick|i mean|number|no|choice|option|answer|letter|the|is|uh|um|ok|okay)\s+)+/;
  // คำนำหน้าภาษาไทยใช้กับการอ่านเลขข้อเท่านั้น ("ข้อ" อยู่ต้นคำอย่าง "ข้อมูล" ได้)
  var LEAD_TH_NUM = /^(?:คำตอบคือ|คำตอบ|ตอบว่า|ตอบ|เลือกข้อ|เลือก|ข้อที่|ข้อ|อันที่|อัน|ตัวเลือกที่|ตัวเลือก|เบอร์|หมายเลข)+/;
  var LEAD_TH = /^(?:คำตอบคือ|ตอบว่า)/;
  function stripLead(s) { return normSp(s).replace(LEAD_EN, '').replace(/\s+/g, '').replace(LEAD_TH, ''); }

  /* ระบบฟังภาษาอังกฤษมักเขียนเลขสั้น ๆ ผิดเป็นคำพ้องเสียง ("two" → to/too, "four" → for)
     จึงรับคำพ้องเสียงที่พบบ่อยด้วย · ตัวอักษร A–D ตรงกับ ก–ข–ค–ง บนปุ่ม */
  var NUM = {
    '1': 0, '๑': 0, 'หนึ่ง': 0, 'นึง': 0, 'ที่หนึ่ง': 0, 'ก': 0, 'กอ': 0, 'กอไก่': 0,
    'one': 0, 'won': 0, 'wan': 0, 'juan': 0, 'first': 0, 'a': 0, 'eh': 0, 'hey': 0, 'ay': 0,
    '2': 1, '๒': 1, 'สอง': 1, 'ที่สอง': 1, 'ข': 1, 'ขอ': 1, 'ขอไข่': 1,
    'two': 1, 'to': 1, 'too': 1, 'tu': 1, 'second': 1, 'b': 1, 'be': 1, 'bee': 1, 'bea': 1,
    '3': 2, '๓': 2, 'สาม': 2, 'ที่สาม': 2, 'ค': 2, 'คอ': 2, 'คอควาย': 2,
    'three': 2, 'tree': 2, 'free': 2, 'third': 2, 'c': 2, 'see': 2, 'sea': 2, 'she': 2,
    '4': 3, '๔': 3, 'สี่': 3, 'ที่สี่': 3, 'ง': 3, 'งอ': 3, 'งองู': 3,
    'four': 3, 'for': 3, 'fore': 3, 'fourth': 3, 'forth': 3, 'd': 3, 'dee': 3
  };
  function parseNumber(raw) {
    var s = stripLead(raw).replace(LEAD_TH_NUM, '');
    if (Object.prototype.hasOwnProperty.call(NUM, s)) return NUM[s];
    return -1;
  }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function partsOf(choice) {
    return String(choice || '').split(/[,/;、]|หรือ/).map(norm).filter(function (p) { return p.length > 0; });
  }
  function similarity(u, part) {
    if (!u || !part) return 0;
    var sc = 1 - lev(u, part) / Math.max(u.length, part.length);
    if (u.length >= 2 && part.indexOf(u) >= 0) sc = Math.max(sc, 0.6 + 0.4 * u.length / part.length);
    if (part.length >= 2 && u.indexOf(part) >= 0) sc = Math.max(sc, 0.6 + 0.4 * part.length / u.length);
    return sc;
  }

  /* alts = ผลที่ระบบฟังได้หลายแบบ · choices = ข้อความบนปุ่มตามลำดับบนจอ
     คืน { pos: 0-3 } เมื่อมั่นใจ, { ambiguous: true } เมื่อก้ำกึ่ง, หรือ { pos: -1 } */
  function matchAnswer(alts, choices) {
    var i, j, p;
    // ตรงกับข้อความบนปุ่มเป๊ะ ๆ ชนะเสมอ — เผื่อความหมายเป็นคำอย่าง "สอง" ของคำว่า two
    for (i = 0; i < alts.length; i++) {
      var exact = stripLead(alts[i]);
      for (j = 0; j < choices.length; j++) {
        if (exact && exact === norm(choices[j])) return { pos: j, by: 'exact', heard: alts[i] };
      }
    }
    for (i = 0; i < alts.length; i++) {
      var n = parseNumber(alts[i]);
      if (n >= 0 && n < choices.length) return { pos: n, by: 'number', heard: alts[i] };
    }
    var best = -1, bestSc = 0, second = 0, heard = '';
    for (i = 0; i < alts.length; i++) {
      var u = stripLead(alts[i]);
      if (!u) continue;
      var scores = choices.map(function (c) {
        var parts = partsOf(c), m = 0;
        for (p = 0; p < parts.length; p++) m = Math.max(m, similarity(u, parts[p]));
        m = Math.max(m, similarity(u, norm(c)));
        return m;
      });
      for (j = 0; j < scores.length; j++) {
        if (scores[j] > bestSc) {
          if (best !== j) second = Math.max(second, bestSc);
          bestSc = scores[j]; best = j; heard = alts[i];
        } else if (j !== best && scores[j] > second) {
          second = scores[j];
        }
      }
    }
    if (best >= 0 && bestSc >= 0.6 && bestSc - second >= 0.12) return { pos: best, by: 'meaning', heard: heard };
    if (best >= 0 && bestSc >= 0.6) return { pos: -1, ambiguous: true };
    return { pos: -1 };
  }

  var CMD = {
    repeat: ['อีกครั้ง', 'ซ้ำ', 'ฟังอีก', 'ฟังอีกครั้ง', 'อ่านใหม่', 'อ่านอีกครั้ง', 'พูดอีกครั้ง', 'อะไรนะ',
      'repeat', 'again', 'say again', 'say it again', 'one more time', 'what', 'pardon', 'sorry', 'read again'],
    stop: ['หยุด', 'หยุดฟัง', 'ปิดเสียง', 'ปิดโหมดเสียง', 'เลิกฟัง', 'stop', 'stop listening', 'voice off', 'quit'],
    next: ['ไปต่อ', 'ต่อ', 'ต่อไป', 'ถัดไป', 'เล่นต่อ', 'สเตจถัดไป', 'ด่านถัดไป', 'ฝึกอีกครั้ง', 'ทบทวนอีกรอบ',
      'next', 'continue', 'go', 'go on', 'next stage', 'next one', 'keep going', 'play', 'play again', 'try again', 'retry', 'yes'],
    ok: ['ตกลง', 'โอเค', 'รับ', 'รับรางวัล', 'รับกล่องรางวัล', 'ยินดีที่ได้เจอกัน', 'ปิด', 'ต่อ', 'ไปต่อ', 'ถัดไป',
      'ok', 'okay', 'o k', 'yes', 'yeah', 'got it', 'close', 'next', 'continue', 'go', 'thanks', 'thank you'],
    map: ['แผนที่', 'กลับแผนที่', 'กลับ', 'กลับไปแผนที่', 'map', 'the map', 'back', 'go back', 'back to map', 'home'],
    normal: ['ปกติ', 'โหมดปกติ', 'ธรรมดา', 'normal', 'normal mode', 'easy'],
    hard: ['ยาก', 'โหมดยาก', 'hard', 'hard mode'],
    cancel: ['ยกเลิก', 'cancel', 'no'],
    skip: ['ข้าม', 'ข้ามฉาก', 'ข้ามฉากนี้', 'skip']
  };
  function isCmd(alts, name) {
    var list = CMD[name];
    for (var i = 0; i < alts.length; i++) {
      var s = norm(alts[i]);
      for (var j = 0; j < list.length; j++) if (s === norm(list[j])) return true;
    }
    return false;
  }

  /* ═══════════ เสียงพูด (อ่านออกเสียง) ═══════════ */

  var voices = { th: null, en: null };
  function pickVoices() {
    if (!synth) return;
    var vs = synth.getVoices() || [];
    voices.th = null; voices.en = null;
    for (var i = 0; i < vs.length; i++) {
      if (!voices.th && /^th[-_]/i.test(vs[i].lang)) voices.th = vs[i];
      if (!voices.en && /^en[-_]US/i.test(vs[i].lang)) voices.en = vs[i];
    }
    if (!voices.en) for (i = 0; i < vs.length; i++) if (/^en[-_]/i.test(vs[i].lang)) { voices.en = vs[i]; break; }
  }
  if (synth) {
    pickVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoices);
  }

  var speakGen = 0;
  /* พูดทีละท่อนตามลำดับ แล้วเรียก done เมื่อจบ (หรือเมื่อถูกยกเลิกด้วย speakGen ใหม่ ก็ไม่เรียก)
     ท่อนเป็นข้อความ หรือฟังก์ชันที่คืน Promise (เช่น ให้เกมออกเสียงคำเอง) */
  function say(parts, done) {
    var g = ++speakGen;
    stopListening();
    setStatus('speak');
    var i = 0;
    function next() {
      if (g !== speakGen) return;
      if (i >= parts.length) { setStatus('idle'); if (done) done(); return; }
      var part = parts[i++];
      if (typeof part === 'function') { Promise.resolve(part()).then(next, next); return; }
      if (!part || !synth) { next(); return; }
      speakOne(part).then(next, next);
    }
    next();
  }
  function speakOne(text) {
    return new Promise(function (resolve) {
      var lang = langOf(text), finished = false;
      function end() { if (finished) return; finished = true; clearTimeout(guard); resolve(); }
      // บางเบราว์เซอร์ไม่ยิง onend (โดยเฉพาะ Chrome บน Android) จึงมีตัวกันค้างตามความยาวข้อความ
      var guard = setTimeout(end, 1500 + text.length * (lang === 'th-TH' ? 140 : 110));
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        var v = lang === 'th-TH' ? voices.th : voices.en;
        if (v) u.voice = v;
        u.rate = lang === 'th-TH' ? 1 : 0.85;
        u.onend = end; u.onerror = end;
        synth.speak(u);
      } catch (e) { end(); }
    });
  }
  function waitSilence(maxMs) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      (function poll() {
        if (!synth || (!synth.speaking && !synth.pending) || performance.now() - t0 > maxMs) { resolve(); return; }
        setTimeout(poll, 120);
      })();
    });
  }
  function pause(ms) { return function () { return new Promise(function (r) { setTimeout(r, ms); }); }; }

  /* ═══════════ การฟัง ═══════════ */

  /* ── เสียงสัญญาณสั้น ๆ ──
     "ติ๊ง" ขึ้น = ไมค์เปิดจริงแล้ว พูดได้ · "ตึ้ด" ต่ำ = ได้ยินแต่จับคำตอบไม่ได้ ให้พูดใหม่
     แทนประโยคยาว ๆ ซึ่งเดิมกินเวลา 2 วินาทีและปิดไมค์ระหว่างนั้น (ผู้เล่นพูดซ้ำทับพอดีเลยหาย) */
  var audioCtx = null;
  function unlockAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx && AC) audioCtx = new AC();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }
  function tone(freqs, ms) {
    if (!pref.beep || !audioCtx) return;
    try {
      var t = audioCtx.currentTime;
      freqs.forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = t + i * (ms / 1000 + 0.03);
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
      });
    } catch (e) {}
  }
  function beepReady() { tone([880, 1320], 70); }
  function beepMiss() { tone([330, 247], 110); }

  /* ── ระบบฟัง ──
     ของเดิม (ก่อน 11 พ.ย.) ฟังทีละประโยค (continuous=false) แล้วเปิดใหม่ทุกครั้งที่จบ
     และขึ้น "พูดได้เลย" ตั้งแต่สั่ง start ทั้งที่ไมค์ยังไม่เปิด + ค้างคำนั้นไว้ระหว่างรอเปิดรอบใหม่
     (เงียบเกิน 6 รอบรอถึง 2 วินาที) คำที่พูดในช่วงนั้นหายเงียบ = "บางทีต้องพูดหลายรอบ"
     ตอนนี้: ฟังต่อเนื่องรอบยาว (continuous=true) · บอก "พูดได้เลย" + ติ๊ง เฉพาะตอนไมค์เปิดจริง
     (onaudiostart) · ระหว่างรอเปิดใหม่ขึ้นว่า "รอสักครู่" · เปิดใหม่ทันทีไม่หน่วง */
  var rec = null, recGen = 0, missCount = 0;
  var fakeMic = false, fakeDeliver = null;   // ทดสอบในเบราว์เซอร์โดยไม่ใช้ไมค์จริง
  function stopListening() {
    recGen++;
    fakeDeliver = null;
    if (rec) { try { rec.abort(); } catch (e) {} rec = null; }
  }
  /* onHeard(alts) คืน true = จัดการแล้ว เลิกฟัง · false = ฟังต่อ (ไมค์ยังเปิดอยู่) */
  function listen(onHeard) {
    if (!state.on || (!SR && !fakeMic)) return;
    stopListening();
    var g = recGen, handled = false, announced = false;
    function deliver(alts) {
      if (g !== recGen || handled) return;
      showHeard(alts[0]);
      if (isCmd(alts, 'stop')) { handled = true; setOn(false); return; }
      handled = !!onHeard(alts);
      if (handled && rec && g === recGen) { try { rec.abort(); } catch (e) {} }
    }
    if (fakeMic) {
      fakeDeliver = function (alts) { deliver(alts); };
      setStatus('listen');
      return;
    }
    var r;
    try { r = new SR(); } catch (e) { return; }
    r.lang = isEn() ? 'en-US' : 'th-TH';
    r.interimResults = true;     // เห็นคำที่กำลังได้ยินบนแถบสถานะ รู้ว่าไมค์รับเสียงอยู่
    r.continuous = true;
    r.maxAlternatives = 5;
    r.onaudiostart = function () {
      if (g !== recGen || announced) return;
      announced = true;
      setStatus('listen');
      beepReady();
    };
    r.onresult = function (e) {
      if (g !== recGen || handled) return;
      for (var k = e.resultIndex; k < e.results.length; k++) {
        var res = e.results[k];
        if (!res.isFinal) { showHeard(res[0].transcript + ' …'); continue; }
        var alts = [];
        for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
        deliver(alts);
        if (handled) return;
      }
    };
    r.onerror = function (e) {
      if (g !== recGen) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        handled = true;
        setOn(false);
        showMsg('ยังไม่ได้รับอนุญาตให้ใช้ไมโครโฟน · กดอนุญาตที่แถบที่อยู่เว็บ แล้วเปิดโหมดเสียงอีกครั้ง');
      } else if (e.error === 'audio-capture') {
        showMsg('ไม่พบไมโครโฟน หรือมีแอปอื่นใช้ไมค์อยู่');
      } else if (e.error === 'network') {
        showMsg('ระบบฟังเสียงต้องใช้อินเทอร์เน็ต · เน็ตหลุดอยู่หรือเปล่า');
      }
    };
    r.onend = function () {
      if (g !== recGen) return;
      rec = null;
      if (handled || !state.on) { setStatus('idle'); return; }
      setStatus('wait');
      setTimeout(function () { if (g === recGen && state.on) listen(onHeard); }, 60);
    };
    setStatus('wait');
    try { r.start(); rec = r; } catch (e) { setStatus('idle'); }
  }

  /* ═══════════ อ่านว่าจออยู่ในสถานะไหน ═══════════ */

  var KNOWN_OVERLAYS = ['overlay-mode', 'overlay-mastery', 'overlay-hatch', 'overlay-daily'];
  function readContext() {
    var story = $('v10-story');
    if (story && !story.hidden) {
      var card = $('v10s-card'), box = $('v10s-box');
      if (visible(card) && txt(card)) return { kind: 'story-card', key: 'sc:' + txt(card), el: card };
      return { kind: 'story', key: 'sl:' + txt($('v10s-who')) + '|' + txt($('v10s-text')) };
    }
    for (var i = 0; i < KNOWN_OVERLAYS.length; i++) {
      var o = $(KNOWN_OVERLAYS[i]);
      if (o && !o.hidden && visible(o)) return { kind: KNOWN_OVERLAYS[i], key: 'ov:' + KNOWN_OVERLAYS[i] + ':' + txt(o.querySelector('h2')), el: o };
    }
    var res = $('overlay-result');
    if (res && !res.hidden && visible(res)) return { kind: 'result', key: 'res:' + txt($('result-title')) + txt($('btn-result-next')), el: res };
    var battle = $('screen-battle');
    if (battle && battle.classList.contains('active')) {
      var box2 = $('choices');
      if (box2 && box2.classList.contains('spell')) return { kind: 'spell', key: 'sp:' + txt($('battle-qcount')) + txt($('word')) };
      var btns = box2 ? box2.querySelectorAll('.choice') : [];
      if (btns.length && !btns[0].disabled) {
        return { kind: 'question', key: 'q:' + txt($('battle-qcount')) + '|' + txt($('word')) + '|' + txt(box2), btns: btns };
      }
      return { kind: 'battle-wait', key: 'bw' };
    }
    var map = $('screen-map');
    if (map && map.classList.contains('active')) return { kind: 'map', key: 'map' };
    return { kind: 'other', key: 'other' };
  }

  /* ═══════════ สิ่งที่ทำในแต่ละสถานะ ═══════════ */

  var lastKey = '', storyTimer = 0;

  // "อีกครั้ง" = อ่านข้อเดิมใหม่ทั้งข้อ
  function onQuestion() { lastKey = ''; tick(); }

  /* แยกออกมาเพื่อให้ "ลองอีกครั้ง" กลับมาฟังคำตอบของข้อเดิมได้ */
  function questionListener(ctx, choices) {
    var key = ctx.key, btns = ctx.btns;
    return function heard(alts) {
      if (lastKey !== key) return true;
      if (isCmd(alts, 'repeat')) { onQuestion(ctx); return true; }
      var m = matchAnswer(alts, choices);
      if (m.pos >= 0) {
        var b = btns[m.pos];
        if (!b || b.disabled) return true;
        b.click();
        setTimeout(function () { feedback(b); }, 80);
        return true;
      }
      /* จับคำตอบไม่ได้: ส่งเสียง "ตึ้ด" แล้วฟังต่อทันทีโดยไม่ปิดไมค์
         พูดคำแนะนำยาว ๆ เฉพาะเมื่อพลาดติดกันหลายครั้ง หรือได้ยินก้ำกึ่งระหว่างสองข้อ */
      missCount++;
      if (m.ambiguous || missCount % 3 === 0) {
        say(numberHint(m.ambiguous), function () { if (lastKey === key) listen(heard); });
        return true;
      }
      beepMiss();
      return false;
    };
  }
  function numberHint(ambiguous) {
    var head = ambiguous ? 'ยังไม่แน่ใจว่าข้อไหน' : 'ยังจับคำตอบไม่ได้';
    return isEn() ? [head, 'ลองพูดว่า', 'number one', 'ถึง', 'number four']
                  : [head, 'ลองพูดเลขข้อ หนึ่ง ถึง สี่'];
  }
  function feedback(btn) {
    missCount = 0;
    if (btn.classList.contains('correct')) { say(['ถูกต้อง'], afterSpeech); return; }
    var right = document.querySelector('#choices .choice.correct span');
    say(['ยังไม่ใช่', right ? 'คำตอบคือ ' + txt(right) : ''], afterSpeech);
  }

  function onResult(ctx) {
    var nextLabel = txt($('btn-result-next')) || 'ไปต่อ';
    var how = isEn() ? ['พูดว่า', 'next', 'เพื่อ' + nextLabel, 'หรือ', 'map', 'เพื่อกลับแผนที่']
                     : ['พูดว่า ไปต่อ เพื่อ' + nextLabel + ' หรือ แผนที่ เพื่อกลับแผนที่'];
    say([txt($('result-title'))].concat(how), function () {
      listenFor(ctx.key, [
        ['next', function () { click('btn-result-next'); }],
        ['map', function () { click('btn-result-map'); }]
      ]);
    });
  }
  function onMode(ctx) {
    say(isEn() ? ['เลือกโหมด พูดว่า', 'normal', 'หรือ', 'hard'] : ['เลือกโหมด พูดว่า ปกติ หรือ ยาก'], function () {
      listenFor(ctx.key, [
        ['normal', function () { click('btn-mode-normal'); }],
        ['hard', function () { click('btn-mode-hard'); }],
        ['cancel', function () { click('btn-mode-cancel'); }]
      ]);
    });
  }
  function onPopup(ctx) {
    var title = txt(ctx.el.querySelector('h2'));
    var btn = ctx.el.querySelector('.btn-primary') || ctx.el.querySelector('button');
    say([title].concat(isEn() ? ['พูดว่า', 'okay', 'เพื่อไปต่อ'] : ['พูดว่า ตกลง เพื่อไปต่อ']), function () {
      listenFor(ctx.key, [['ok', function () { if (btn && visible(btn)) btn.click(); }]]);
    });
  }
  function listenFor(key, table) {
    listen(function (alts) {
      if (lastKey !== key) return true;
      if (isCmd(alts, 'repeat')) { lastKey = ''; tick(); return true; }
      for (var i = 0; i < table.length; i++) {
        if (isCmd(alts, table[i][0])) { table[i][1](); return true; }
      }
      beepMiss();
      return false;
    });
  }
  function click(id) { var b = $(id); if (b && !b.disabled) b.click(); }

  /* เนื้อเรื่อง: อ่านแต่ละบรรทัดแล้วเลื่อนเอง (ข้อความพิมพ์ทีละตัว ต้องรอให้นิ่งก่อน) */
  function onStory(ctx) {
    clearTimeout(storyTimer);
    var key = ctx.key;
    storyTimer = setTimeout(function () {
      var now = readContext();
      if (now.key !== key) { tick(); return; }
      var advance = function () {
        if (lastKey !== key) return;
        var box = ctx.kind === 'story-card' ? $('v10s-card') : $('v10s-box');
        if (box) box.click();
      };
      if (!pref.readStory) { advance(); return; }
      var parts = ctx.kind === 'story-card' ? [txt($('v10s-card')).replace(/แตะเพื่อเริ่มบท/, '')]
        : [txt($('v10s-who')), txt($('v10s-text'))];
      say(parts, function () { setTimeout(advance, 500); });
    }, 450);
  }

  function afterSpeech() { /* ข้อถัดไปจะถูกจับได้จาก MutationObserver */ }

  var announcedMap = false;
  function handle(ctx) {
    switch (ctx.kind) {
      case 'question':
        var choices = [];
        for (var i = 0; i < ctx.btns.length; i++) choices.push(txt(ctx.btns[i].querySelector('span')) || txt(ctx.btns[i]));
        speakQuestion(ctx, choices);
        break;
      case 'spell':
        say(['ข้อนี้ต้องแตะเรียงตัวอักษรเอง'], null);
        break;
      case 'result': onResult(ctx); break;
      case 'overlay-mode': onMode(ctx); break;
      case 'overlay-mastery': case 'overlay-hatch': case 'overlay-daily': onPopup(ctx); break;
      case 'story': case 'story-card': onStory(ctx); break;
      case 'map':
        stopListening(); setStatus('idle');
        if (!announcedMap) { announcedMap = true; say(['อยู่ที่แผนที่ แตะเลือกด่าน แล้วเล่นด้วยเสียงต่อได้เลย'], null); }
        break;
      default:
        stopListening(); setStatus('idle');
    }
  }
  function speakQuestion(ctx, choices) {
    var wordEl = $('word'), word = txt(wordEl), parts = [];
    // อ่านเลขข้อเป็นภาษาเดียวกับที่ระบบฟังอยู่ ผู้เล่นจะได้พูดตามได้เลย
    var NUMS = isEn() ? ['one', 'two', 'three', 'four'] : ['หนึ่ง', 'สอง', 'สาม', 'สี่'];
    if (wordEl && wordEl.classList.contains('audio')) {
      parts.push(function () {
        var b = $('btn-speak');
        if (b) b.click();
        return pause(300)().then(function () { return waitSilence(4000); });
      });
    } else if (word && word !== '—') {
      parts.push(word);
    }
    if (pref.readChoices) {
      for (var i = 0; i < choices.length; i++) {
        parts.push(pause(120));
        if (langOf(NUMS[i]) === langOf(choices[i])) {
          parts.push(NUMS[i] + ' ' + choices[i]);
        } else {
          parts.push(NUMS[i]);
          parts.push(choices[i]);
        }
      }
    }
    missCount = 0;
    var heard = questionListener(ctx, choices);
    say(parts, function () { if (lastKey === ctx.key) listen(heard); });
  }

  var pending = 0;
  function tick() {
    if (!state.on) return;
    var ctx = readContext();
    if (ctx.key === lastKey) return;
    lastKey = ctx.key;
    if (ctx.kind !== 'map') announcedMap = false;
    handle(ctx);
  }
  function schedule() {
    if (!state.on || pending) return;
    pending = setTimeout(function () { pending = 0; tick(); }, 200);
  }

  /* ═══════════ เปิด/ปิด ═══════════ */

  var state = { on: false };
  var observer = null, wakeLock = null;

  function requestWake() {
    if (!state.on || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }, function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (!state.on) return;
    if (document.visibilityState === 'visible') { requestWake(); lastKey = ''; schedule(); }
    else { stopListening(); speakGen++; if (synth) synth.cancel(); }
  });

  function setOn(on) {
    if (on && !SR && !fakeMic) {
      showMsg('เบราว์เซอร์นี้ฟังเสียงไม่ได้ · ใช้ Chrome, Edge หรือ Safari');
      return;
    }
    state.on = on;
    if (on) unlockAudio();   // ต้องสร้างเสียงสัญญาณในจังหวะที่ผู้เล่นแตะ
    ui.btn.classList.toggle('on', on);
    ui.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    ui.panel.hidden = !on;
    if (on) {
      if (!observer) {
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'disabled'], characterData: true });
      }
      requestWake();
      pickVoices();
      lastKey = '';
      var intro = ['เปิดโหมดเสียงแล้ว'];
      if (!voices.th) intro.push('เครื่องนี้ไม่มีเสียงภาษาไทย อาจอ่านตัวเลือกไม่ชัด');
      // ต้องเริ่มพูดในจังหวะที่ผู้เล่นแตะ ไม่งั้น iPhone จะไม่ยอมให้เว็บพูด
      say(intro, function () { tick(); });
    } else {
      stopListening();
      speakGen++;
      if (synth) synth.cancel();
      if (observer) { observer.disconnect(); observer = null; }
      if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
      clearTimeout(storyTimer);
      setStatus('off');
    }
  }

  /* ═══════════ ปุ่มและแถบสถานะ ═══════════ */

  var ui = {};
  function buildUI() {
    var css = document.createElement('style');
    css.textContent = [
      '.vqv-btn{position:fixed;right:max(10px,env(safe-area-inset-right));top:calc(58px + env(safe-area-inset-top));z-index:9000;width:46px;height:46px;border-radius:50%;border:2px solid #fff;background:#5b6b7f;color:#fff;font-size:21px;line-height:1;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
      '.vqv-btn.on{background:#e53935}',
      '.vqv-btn.on.listen{animation:vqvPulse 1.2s ease-in-out infinite}',
      '@keyframes vqvPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,57,53,.55)}50%{box-shadow:0 0 0 12px rgba(229,57,53,0)}}',
      '@media (prefers-reduced-motion:reduce){.vqv-btn.on.listen{animation:none;outline:3px solid #ffcdd2}}',
      '.vqv-panel{position:fixed;right:calc(max(10px,env(safe-area-inset-right)) + 60px);top:calc(58px + env(safe-area-inset-top));z-index:9000;max-width:min(300px,calc(100vw - 86px));background:rgba(20,28,40,.88);color:#fff;border-radius:14px;padding:8px 12px;font:14px/1.45 system-ui,"Noto Sans Thai",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)}',
      '.vqv-panel[hidden]{display:none}',
      '.vqv-status{font-weight:700}',
      '.vqv-heard{opacity:.85;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.vqv-opts{display:none;gap:10px;flex-wrap:wrap;margin-top:4px;font-size:12px}',
      '.vqv-panel.open .vqv-opts{display:flex}',
      '.vqv-top{display:flex;align-items:center;gap:8px}',
      '.vqv-gear{margin-left:auto;background:none;border:0;color:#fff;font-size:15px;cursor:pointer;padding:2px 4px}',
      '.vqv-opts label{display:flex;align-items:center;gap:4px;cursor:pointer}',
      '.vqv-opts select{color:#1d2b3a;background:#fff;border:0;border-radius:6px;font:inherit;padding:1px 4px}',
      '.vqv-msg{position:fixed;left:50%;transform:translateX(-50%);bottom:76px;z-index:9001;background:#1d2b3a;color:#fff;padding:10px 14px;border-radius:12px;font:14px/1.5 system-ui,"Noto Sans Thai",sans-serif;max-width:calc(100vw - 32px);text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.3)}'
    ].join('\n');
    document.head.appendChild(css);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vqv-btn';
    btn.textContent = '🎤';
    btn.title = 'โหมดเสียง (เล่นแบบไม่ใช้มือ)';
    btn.setAttribute('aria-label', 'โหมดเสียง');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () { setOn(!state.on); });

    var panel = document.createElement('div');
    panel.className = 'vqv-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'status');
    panel.innerHTML =
      '<div class="vqv-top"><div class="vqv-status">🎤 โหมดเสียง</div><button type="button" class="vqv-gear" aria-label="ตั้งค่าโหมดเสียง" aria-expanded="false">⚙</button></div>' +
      '<div class="vqv-heard"></div>' +
      '<div class="vqv-opts">' +
      '<label><input type="checkbox" data-k="readChoices"> อ่านตัวเลือก</label>' +
      '<label><input type="checkbox" data-k="readStory"> อ่านเนื้อเรื่อง</label>' +
      '<label><input type="checkbox" data-k="beep"> เสียงติ๊งตอนเริ่มฟัง</label>' +
      '<label>ฟังภาษา <select data-k="listenLang"><option value="en">อังกฤษ</option><option value="th">ไทย</option></select></label>' +
      '</div>';
    panel.querySelectorAll('input[data-k]').forEach(function (cb) {
      cb.checked = !!pref[cb.dataset.k];
      cb.addEventListener('change', function () { pref[cb.dataset.k] = cb.checked; savePref(); });
    });
    var langSel = panel.querySelector('select[data-k="listenLang"]');
    langSel.value = pref.listenLang;
    langSel.addEventListener('change', function () {
      pref.listenLang = langSel.value === 'th' ? 'th' : 'en';
      savePref();
      if (state.on) { lastKey = ''; tick(); }   // เริ่มฟังใหม่ด้วยภาษาที่เลือก
    });

    var gear = panel.querySelector('.vqv-gear');
    gear.addEventListener('click', function () {
      var open = panel.classList.toggle('open');
      gear.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    ui.btn = btn; ui.panel = panel;
    ui.status = panel.querySelector('.vqv-status');
    ui.heard = panel.querySelector('.vqv-heard');
  }
  var STATUS = { off: '🎤 โหมดเสียง', idle: '🎤 โหมดเสียงเปิดอยู่', speak: '🔊 กำลังอ่าน… รอฟังก่อน', wait: '⏳ กำลังเปิดไมค์…', listen: '👂 พูดได้เลย' };
  function setStatus(s) {
    if (!ui.btn) return;
    ui.btn.classList.toggle('listen', s === 'listen');
    ui.status.textContent = STATUS[s] || STATUS.idle;
  }
  function showHeard(t) { if (ui.heard) ui.heard.textContent = 'ได้ยิน: ' + t; }
  var msgTimer = 0;
  function showMsg(t) {
    var el = document.querySelector('.vqv-msg');
    if (!el) { el = document.createElement('div'); el.className = 'vqv-msg'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
    el.textContent = t;
    el.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { el.hidden = true; }, 6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();

  /* hook ในตัวเกมเรียก active() · ส่วนที่ขึ้นต้นด้วย _ มีไว้ทดสอบ */
  window.VQVoice = {
    active: function () { return state.on; },
    setOn: setOn,
    _match: matchAnswer,
    _number: parseNumber,
    _context: readContext,
    _fakeMic: function (on) { fakeMic = !!on; },
    _hear: function (alts) {
      if (!fakeDeliver) return false;
      fakeDeliver(typeof alts === 'string' ? [alts] : alts);
      return true;
    },
    _status: function () { return ui.status ? ui.status.textContent : ''; }
  };
})();
