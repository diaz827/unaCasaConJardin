/* Tocadiscos interactivo — Una casa con jardín.
   Vanilla JS. Se lanza desde componentDidMount() de la clase Component (index.html).
   Reutiliza las clases .vinyl/.disc/.lbl/.sheen del CSS global.
   Sin librerías. No usa localStorage. */
(function () {
  'use strict';

  /* ===== Configuración de pistas =====
     Los MP3 están en ./canciones/ (esta carpeta NO se sube a GitHub).
     Si falta un archivo, la interfaz muestra "Pista no disponible" y salta a la siguiente. */
  var TRACKS = [
    { n: 1,  titulo: 'Lista de cosas que me hacen feliz', colab: '',           src: './canciones/1-Enol - LISTA DE COSAS QUE ME HACEN FELIZ (VIDEO OFICIAL) - Enol.mp3' },
    { n: 2,  titulo: 'Las nubes',                          colab: '',           src: './canciones/2-Enol - LAS NUBES (VIDEO OFICIAL) - Enol.mp3' },
    { n: 3,  titulo: 'Bodas de plata',                     colab: 'con Marmi',  src: './canciones/3-Enol, Marmi - BODAS DE PLATA (VIDEOCLIP OFICIAL) - Enol.mp3' },
    { n: 4,  titulo: 'Y qué bonito',                       colab: 'con Marlon', src: './canciones/4-Enol, Marlon - Y QUÉ BONITO (VIDEOCLIP OFICIAL) - Enol.mp3' },
    { n: 5,  titulo: 'Peter Pan',                          colab: '',           src: './canciones/5-Enol - PETER PAN (VIDEOCLIP OFICIAL) - Enol.mp3' },
    { n: 6,  titulo: '¿Sales hoy?',                        colab: '',           src: './canciones/6-Enol - SALES HOY (VIDEO OFICIAL) - Enol.mp3' },
    { n: 7,  titulo: 'Amalfi',                             colab: '',           src: './canciones/7-Enol - AMALFI (VIDEOCLIP OFICIAL) - Enol.mp3' },
    { n: 8,  titulo: 'Claudia',                            colab: '',           src: './canciones/8-Enol - CLAUDIA (VIDEO OFICIAL) - Enol.mp3' },
    { n: 9,  titulo: 'Yo soy de aquí',                     colab: '',           src: './canciones/9-Enol - YO SOY DE AQUÍ (VIDEO OFICIAL) - Enol.mp3' },
    { n: 10, titulo: 'Una ventana',                        colab: 'con Xavibo', src: './canciones/10-Enol, Xavibo - UNA VENTANA (VIDEO OFICIAL) - Enol.mp3' },
    { n: 11, titulo: 'Dellafuente',                        colab: '',           src: './canciones/11-Enol - DELLAFUENTE (VIDEO OFICIAL) - Enol.mp3' },
    { n: 12, titulo: 'Serenata',                           colab: 'con Walls',  src: './canciones/12-Enol, Walls - SERENATA (VIDEO OFICIAL) - Enol.mp3' }
  ];

  /* ===== Geometría del brazo (grados). Ajusta aquí el recorrido. =====
     Pivote a la derecha (73%,23% del deck); giro negativo = púa hacia abajo. */
  var REST = -62;      // púa levantada, apoyada en el soporte (fuera del disco)
  var PLAY_OUTER = -54; // surco exterior (borde del disco)
  var PLAY_INNER = -36; // surco interior (junto a la etiqueta)
  var DROP_ZONE = -58; // por encima de este ángulo el brazo "flota" sobre el disco (zona de contacto / imán)
  var ARM_MIN = REST - 14;
  var ARM_MAX = PLAY_INNER;
  var TARGET_RPS = 40;           // segundos por vuelta (misma velocidad que el CSS spin)
  var TARGET_VEL = 360 / TARGET_RPS; // grados por segundo
  var FADE_MS = 450;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===== Estado ===== */
  var st = {
    inited: false,
    accent: '#DC5000',
    section: null, arm: null, armBar: null, disc: null,
    now: null, title: null, bar: null, prog: null, cur: null, dur: null,
    prevBtn: null, nextBtn: null, armBtn: null, stage: null, parallax: null,
    audio: null, crackle: null,
    idx: 0, playing: false, dragging: false, interactive: false, entered: false,
    angle: REST, spin: { angle: 0, vel: 0, target: 0, raf: 0, last: 0 },
    io: null, observed: null, listenersBound: false, armRaf: 0,
    rafParallax: 0, fadeTimer: 0, unavailable: {}, uiNodes: null
  };

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function setAccent(a) {
    if (!a) return;
    st.accent = a;
    if (st.section) st.section.style.setProperty('--accent', a);
  }

  /* ===== Inicialización ===== */
  function init(accent) {
    if (accent) st.accent = accent;
    if (!queryNodes()) return;
    setAccent(st.accent);
    if (!st.audio) {
      st.audio = new Audio();
      st.audio.preload = 'metadata';
      st.audio.volume = 0.85;
      bindAudio();
    }
    bindUI();
    if (reduced) { st.entered = true; st.interactive = true; }
    if (st.entered) setArm(st.angle, true);
    else setArm(REST - 26, true);
    loadTrack(0, false);
    refresh();
    st.inited = true;
  }

  /* Re-consulta los nodos (React puede recrearlos en un re-render). */
  function queryNodes() {
    st.section = $('tocadiscos');
    if (!st.section) return false;
    st.arm = $('ttArm'); st.armBar = st.arm && st.arm.querySelector('.tt-arm-bar');
    st.disc = st.section.querySelector('.tt-vinyl .disc');
    st.now = $('ttNow'); st.title = $('ttTitle'); st.bar = $('ttBar'); st.prog = $('ttProgress');
    st.cur = $('ttCur'); st.dur = $('ttDur');
    st.prevBtn = $('ttPrev'); st.nextBtn = $('ttNext'); st.armBtn = $('ttArmBtn');
    st.stage = st.section.querySelector('.tt-stage'); st.parallax = st.section.querySelector('.tt-parallax');
    return !!(st.arm && st.disc);
  }

  /* Aplica el estado actual a los nodos vivos (seguro tras re-renders). */
  function refresh() {
    if (!queryNodes()) return;
    bindUI();
    setAccent(st.accent);
    st.section.classList.add('tt-anim');
    if (st.entered) {
      st.section.classList.add('tt-in');
      if (st.interactive) st.section.classList.add('tt-ready');
    } else if (reduced) {
      st.section.classList.add('tt-in');
    }
    setArm(st.angle, true);
    updateNow(null);
    updateArmBtn();
    if (!st.entered && !reduced) ensureObserver();
  }

  /* ===== Entrada con scroll (IntersectionObserver + respaldo) ===== */
  function ensureObserver() {
    if (st.entered || reduced) return;
    if (!('IntersectionObserver' in window)) { reveal(); return; }
    if (st.io && st.observed === st.section) return;
    if (st.io) { st.io.disconnect(); st.io = null; }
    st.io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { reveal(); break; }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    st.observed = st.section;
    st.io.observe(st.section);
    if (!st.listenersBound) {
      st.listenersBound = true;
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
    }
    onScroll(); // por si ya está en vista
  }

  function onScroll() {
    onScrollParallax();
    if (st.entered || reduced) return;
    if (isInView()) reveal();
  }

  function isInView() {
    if (!st.section) return false;
    var r = st.section.getBoundingClientRect();
    var vh = window.innerHeight || 800;
    return r.top < vh * 0.9 && r.bottom > 0;
  }

  function reveal() {
    if (st.entered || !st.section) return;
    st.entered = true;
    st.section.classList.add('tt-in');
    animateArm(REST, 850);
    setTimeout(function () { enableInteraction(); }, reduced ? 0 : 2350);
    if (st.io) { st.io.disconnect(); st.io = null; st.observed = null; }
  }

  function showFinal() {
    st.entered = true;
    if (st.section) st.section.classList.add('tt-in');
    enableInteraction();
  }

  function enableInteraction() {
    st.interactive = true;
    if (st.section) st.section.classList.add('tt-ready');
  }

  /* ===== Parallax muy sutil ===== */
  function onScrollParallax() {
    if (reduced || !st.parallax || st.rafParallax) return;
    st.rafParallax = requestAnimationFrame(function () {
      st.rafParallax = 0;
      if (!st.section || !st.parallax) return;
      var r = st.section.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      var p = (vh / 2 - (r.top + r.height / 2)) / vh;
      var y = clamp(p * 14, -14, 14);
      st.parallax.style.transform = 'translateY(' + y.toFixed(2) + 'px)';
    });
  }

  /* ===== Brazo ===== */
  function setArm(deg, instant) {
    st.angle = clamp(deg, ARM_MIN, ARM_MAX);
    if (st.armBar) st.armBar.style.setProperty('--arm', st.angle.toFixed(2));
    if (st.arm) {
      var pct = Math.round(((st.angle - ARM_MIN) / (ARM_MAX - ARM_MIN)) * 100);
      st.arm.setAttribute('aria-valuenow', String(pct));
      var down = st.angle >= DROP_ZONE;
      st.arm.setAttribute('aria-valuetext', down ? 'Púa sobre el disco' : 'Púa levantada');
    }
    if (instant && st.armBar) {
      var prev = st.armBar.style.transition;
      st.armBar.style.transition = 'none';
      // forzar reflow para aplicar sin transición
      void st.armBar.offsetWidth;
      st.armBar.style.transition = prev || '';
    }
  }

  function animateArm(to, dur, cb) {
    if (st.armRaf) { cancelAnimationFrame(st.armRaf); st.armRaf = 0; }
    var from = st.angle, start = 0;
    if (reduced || dur <= 0) { setArm(to, true); if (cb) cb(); return; }
    if (st.armBar) st.armBar.style.transition = 'none';
    function step(ts) {
      if (!start) start = ts;
      var t = clamp((ts - start) / dur, 0, 1);
      var e = 1 - Math.pow(1 - t, 3); // ease-out
      setArm(from + (to - from) * e, true);
      if (t < 1) st.armRaf = requestAnimationFrame(step);
      else { st.armRaf = 0; if (cb) cb(); }
    }
    st.armRaf = requestAnimationFrame(step);
  }

  /* ===== Giro del vinilo (rAF, arranque/frenado suaves) ===== */
  function spinStart() {
    if (reduced) return;
    st.spin.target = TARGET_VEL;
    if (!st.spin.raf) { st.spin.last = 0; st.spin.raf = requestAnimationFrame(spinFrame); }
  }
  function spinStop() {
    st.spin.target = 0;
    if (!st.spin.raf && st.spin.vel > 0) { st.spin.last = 0; st.spin.raf = requestAnimationFrame(spinFrame); }
    if (!st.spin.raf && st.spin.vel === 0 && st.disc) st.disc.style.transform = 'rotate(' + st.spin.angle + 'deg)';
  }
  function spinFrame(ts) {
    var s = st.spin;
    if (!s.last) s.last = ts;
    var dt = (ts - s.last) / 1000; s.last = ts;
    if (dt > 0.1) dt = 0.1; // salto tras suspensión
    var accel = TARGET_VEL / 0.7; // rampa ~0.7s
    if (s.vel < s.target) s.vel = Math.min(s.target, s.vel + accel * dt);
    else if (s.vel > s.target) s.vel = Math.max(s.target, s.vel - accel * dt);
    s.angle = (s.angle + s.vel * dt) % 360;
    if (st.disc) st.disc.style.transform = 'rotate(' + s.angle.toFixed(2) + 'deg)';
    if (s.target !== 0 || Math.abs(s.vel) > 0.05) s.raf = requestAnimationFrame(spinFrame);
    else { s.vel = 0; s.raf = 0; s.last = 0; }
  }

  /* ===== Audio ===== */
  function bindAudio() {
    var a = st.audio;
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
  }
  function onMeta() { if (st.dur) st.dur.textContent = fmt(a_duration()); }
  function a_duration() { return st.audio && st.audio.duration ? st.audio.duration : 0; }
  function onTime() {
    var d = a_duration(), c = st.audio.currentTime || 0;
    var p = d ? (c / d) : 0;
    if (st.bar) st.bar.style.width = (p * 100).toFixed(2) + '%';
    if (st.prog) st.prog.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    if (st.cur) st.cur.textContent = fmt(c);
    if (st.dur && d) st.dur.textContent = fmt(d);
    // el brazo avanza hacia el centro conforme gira el disco
    if (st.playing && !st.dragging) {
      var ang = PLAY_OUTER + p * (PLAY_INNER - PLAY_OUTER);
      setArm(ang, true);
    }
  }
  function onError() {
    // archivo no disponible: marcamos y saltamos
    st.unavailable[st.idx] = true;
    updateNow('Pista no disponible');
    if (st.playing) { setTimeout(function () { next(true); }, 900); }
  }
  function loadTrack(i, autoplay) {
    st.idx = clamp(i, 0, TRACKS.length - 1);
    var t = TRACKS[st.idx];
    updateNow(null);
    if (st.bar) st.bar.style.width = '0%';
    if (st.cur) st.cur.textContent = '0:00';
    if (st.dur) st.dur.textContent = '0:00';
    st.audio.src = encodeURI(t.src);
    if (autoplay) { safePlay(); }
  }
  function safePlay() {
    var p = st.audio.play();
    if (p && p.catch) p.catch(function () { /* autoplay bloqueado: no romper */ });
  }
  function fadeTo(vol, ms, done) {
    clearInterval(st.fadeTimer);
    var from = st.audio.volume, start = Date.now();
    st.fadeTimer = setInterval(function () {
      var t = clamp((Date.now() - start) / ms, 0, 1);
      st.audio.volume = clamp(from + (vol - from) * t, 0, 1);
      if (t >= 1) { clearInterval(st.fadeTimer); if (done) done(); }
    }, 16);
  }

  /* ===== Reproducción ===== */
  function play() {
    if (st.playing) return;
    st.playing = true;
    if (st.audio.volume === 0) st.audio.volume = 0.85;
    safePlay();
    spinStart();
    playCrackle();
    updateArmBtn();
  }
  function pause() {
    if (!st.playing) return;
    st.playing = false;
    spinStop();
    var v = st.audio.volume;
    fadeTo(0, FADE_MS, function () { st.audio.pause(); st.audio.volume = v; });
    updateArmBtn();
  }
  function next(auto) {
    var start = st.idx + 1;
    for (var k = 0; k < TRACKS.length; k++) {
      var i = (start + k) % TRACKS.length;
      if (!st.unavailable[i]) { loadTrack(i, st.playing || auto); return; }
    }
    // todas no disponibles
    stopAll();
  }
  function prev() {
    var i = st.idx - 1; if (i < 0) i = TRACKS.length - 1;
    loadTrack(i, st.playing);
  }
  function stopAll() {
    st.playing = false;
    if (st.audio) { st.audio.pause(); }
    spinStop();
    updateArmBtn();
  }
  function onEnded() { next(true); }

  /* ===== Púa (bajar/subir) ===== */
  function dropNeedle() {
    if (!st.interactive) return;
    animateArm(PLAY_OUTER, 500, function () { play(); });
    st.armBtn.textContent = 'Subir púa';
    st.armBtn.setAttribute('aria-label', 'Subir la púa y pausar');
  }
  function liftNeedle() {
    if (!st.interactive) return;
    pause();
    animateArm(REST, 500);
    st.armBtn.textContent = 'Bajar púa';
    st.armBtn.setAttribute('aria-label', 'Bajar la púa y reproducir');
  }
  function toggleNeedle() {
    if (st.playing || st.angle >= DROP_ZONE) liftNeedle(); else dropNeedle();
  }
  function updateArmBtn() {
    if (!st.armBtn) return;
    if (st.playing || st.angle >= DROP_ZONE) { st.armBtn.textContent = 'Subir púa'; st.armBtn.setAttribute('aria-label', 'Subir la púa y pausar'); }
    else { st.armBtn.textContent = 'Bajar púa'; st.armBtn.setAttribute('aria-label', 'Bajar la púa y reproducir'); }
  }

  /* ===== Arrastre del brazo (pointer events) ===== */
  function bindUI() {
    var nodes = [st.armBtn, st.prevBtn, st.nextBtn, st.prog, st.arm];
    if (st.uiNodes && st.uiNodes.every(function (n, i) { return n === nodes[i]; })) return;
    st.uiNodes = nodes;
    if (st.armBtn) st.armBtn.addEventListener('click', toggleNeedle);
    if (st.prevBtn) st.prevBtn.addEventListener('click', function () { prev(); });
    if (st.nextBtn) st.nextBtn.addEventListener('click', function () { next(false); });
    if (st.prog) st.prog.addEventListener('click', seek);

    if (st.arm) {
      st.arm.addEventListener('pointerdown', onDragStart);
      st.arm.addEventListener('keydown', onKey);
    }
  }

  function seek(e) {
    var d = a_duration(); if (!d) return;
    var r = st.prog.getBoundingClientRect();
    var p = clamp((e.clientX - r.left) / r.width, 0, 1);
    st.audio.currentTime = p * d;
  }

  function pointerAngle(e) {
    var deck = st.section.querySelector('.tt-deck');
    if (!deck) return st.angle;
    var dr = deck.getBoundingClientRect();
    // pivote del brazo: left:73%, top:23% del deck
    var px = dr.left + 0.73 * dr.width;
    var py = dr.top + 0.23 * dr.height;
    var dx = e.clientX - px, dy = e.clientY - py;
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;      // 0=dcha, 90=abajo
    var arm = ang - 180;                               // 0=izquierda (hacia el disco), negativo=hacia abajo
    while (arm > 180) arm -= 360;
    while (arm < -180) arm += 360;
    return arm;
  }

  function onDragStart(e) {
    if (!st.interactive) return;
    e.preventDefault();
    st.dragging = true;
    st.arm.classList.add('dragging');
    try { st.arm.setPointerCapture(e.pointerId); } catch (err) {}
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  }
  function onDragMove(e) {
    if (!st.dragging) return;
    setArm(pointerAngle(e), true);
  }
  function onDragEnd() {
    if (!st.dragging) return;
    st.dragging = false;
    st.arm.classList.remove('dragging');
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    // imán / snap
    if (st.angle >= DROP_ZONE) {
      // "cae" sobre el surco con rebote ligero
      animateArm(clamp(st.angle, PLAY_OUTER, PLAY_INNER), 380, function () { play(); });
      st.armBtn.textContent = 'Subir púa';
    } else {
      animateArm(REST, 380);
      if (st.playing) pause();
      st.armBtn.textContent = 'Bajar púa';
    }
  }

  function onKey(e) {
    if (!st.interactive) return;
    var k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); toggleNeedle(); return; }
    var d = 0;
    if (k === 'ArrowRight' || k === 'ArrowUp') d = 4;
    else if (k === 'ArrowLeft' || k === 'ArrowDown') d = -4;
    else return;
    e.preventDefault();
    var to = clamp(st.angle + d, ARM_MIN, ARM_MAX);
    setArm(to, true);
    // soltar sobre el disco inicia; fuera, detiene
    if (st.angle >= DROP_ZONE && !st.playing) { /* suave: no auto-play hasta soltar/Enter */ }
  }

  /* ===== Panel "Sonando ahora" ===== */
  function updateNow(msg) {
    if (!st.title) return;
    if (msg) { st.title.textContent = msg; return; }
    var t = TRACKS[st.idx];
    var num = (t.n < 10 ? '0' : '') + t.n;
    st.title.innerHTML = '';
    var numEl = document.createElement('span'); numEl.className = 'num'; numEl.textContent = num + ' — ';
    var ttlEl = document.createElement('span'); ttlEl.textContent = t.titulo;
    st.title.appendChild(numEl); st.title.appendChild(ttlEl);
    if (t.colab) { var c = document.createElement('span'); c.className = 'col'; c.textContent = ' (' + t.colab + ')'; st.title.appendChild(c); }
  }

  /* ===== Crackle opcional ===== */
  function playCrackle() {
    try {
      if (!st.crackle) { st.crackle = new Audio('./assets/audio/crackle.mp3'); st.crackle.volume = 0.25; }
      st.crackle.currentTime = 0;
      var p = st.crackle.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) { /* si no existe, no falla */ }
  }

  /* ===== Limpieza ===== */
  function destroy() {
    if (st.io) { st.io.disconnect(); st.io = null; st.observed = null; }
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    clearInterval(st.fadeTimer);
    if (st.armRaf) { cancelAnimationFrame(st.armRaf); st.armRaf = 0; }
    if (st.spin.raf) cancelAnimationFrame(st.spin.raf);
    if (st.audio) { st.audio.pause(); }
    st.inited = false;
  }

  window.initTocadiscos = init;
  window.refreshTocadiscos = function () { if (st.inited) refresh(); };
  window.destroyTocadiscos = destroy;
})();
