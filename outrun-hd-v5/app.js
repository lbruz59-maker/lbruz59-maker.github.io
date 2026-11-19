(() => {
  const webBuild = "20261120-v5-exact";
  const dbName = "outrun-web-data";
  const $ = id => document.getElementById(id);
  const romInput = $("romZip");
  const play = $("play");
  const roomPanel = $("roomPanel");
  const createPanel = $("createPanel");
  const joinPanel = $("joinPanel");
  const codeInput = $("roomCode");
  let romFiles = null;
  let importAttempt = 0;
  let newRoomCode = makeRoomCode();
  let installPrompt = null;

  function makeRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeRoms(files) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(files, "roms");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadRoms() {
    const db = await openDb();
    const files = await new Promise((resolve, reject) => {
      const request = db.transaction("files", "readonly").objectStore("files").get("roms");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return files;
  }

  function setRoms(files, label) {
    romFiles = files;
    $("romStatus").textContent = `${label} · ${OutRunZip.ROM_NAMES.length} ROMs prêtes sur cet appareil.`;
    play.disabled = false;
    play.textContent = "Lancer OutRun";
  }

  romInput.addEventListener("change", async () => {
    const file = romInput.files && romInput.files[0];
    if (!file) return;
    const attempt = ++importAttempt;
    play.disabled = true;
    $("romStatus").textContent = "Lecture locale de l’archive ZIP…";
    $("message").textContent = "";
    try {
      const extracted = await OutRunZip.extract(file);
      if (attempt !== importAttempt) return;
      setRoms(extracted, file.name);
      storeRoms(extracted).catch(() => {
        if (attempt === importAttempt) $("romStatus").textContent = file.name + " · ROMs prêtes pour cette session. Le navigateur ne peut pas les conserver.";
      });
    } catch (error) {
      if (attempt !== importAttempt) return;
      romFiles = null;
      $("romStatus").textContent = "Archive non installée.";
      $("message").textContent = error.message || "Lecture du ZIP impossible.";
      play.disabled = true;
      play.textContent = "L’archive ZIP des ROMs est requise";
    }
  });

  document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener("change", () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    roomPanel.hidden = mode === "offline";
    createPanel.hidden = mode !== "create";
    joinPanel.hidden = mode !== "join";
    if (mode === "create") {
      newRoomCode = makeRoomCode();
      $("newCode").textContent = newRoomCode;
    }
  }));

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  });

  function multiplayerSettings() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const room = mode === "create" ? newRoomCode : mode === "join" ? codeInput.value.trim() : "----";
    if (mode !== "offline" && !/^[A-Z0-9]{4}$/.test(room))
      throw new Error("Le code de salle doit contenir quatre lettres ou chiffres.");
    const player = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    return `mode=${mode === "create" ? "internet_create" : mode === "join" ? "internet_join" : "offline"}\naddress=\nport=30800\nmodel=${$("carModel").value}\nprotocol=10\nroom=${room}\nplayer=${player}\n`;
  }

  const driverName = $("driverName");
  const profileKey = "outrun.driverName";
  function arcadeInitials(name) {
    const letters = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
    return letters.length >= 3 ? letters.slice(0, 3) : "";
  }
  function updateDriverHint() {
    const initials = arcadeInitials(driverName.value);
    $("driverHint").textContent = initials ? "Tes initiales au classement arcade : " + initials :
      "Tu pourras choisir tes trois initiales en fin de course.";
  }
  try { driverName.value = localStorage.getItem(profileKey) || ""; } catch (_) {}
  driverName.addEventListener("input", () => {
    updateDriverHint();
    try {
      const name = driverName.value.trim();
      if (name) localStorage.setItem(profileKey, name);
      else localStorage.removeItem(profileKey);
    } catch (_) {}
  });
  updateDriverHint();

  const racePrefix = "outrun.race.";
  const scoreFiles = ["hiscores", "hiscores_jap", "hiscores_continuous", "hiscores_continuous_jap", "hiscores_timetrial", "hiscores_timetrial_jap"].map(name => name + ".xml");
  let currentRace;
  function showHistory() {
    const list = $("raceHistory");
    list.replaceChildren();
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith(racePrefix)).sort().reverse();
      for (const key of keys) {
        const row = document.createElement("li");
        row.textContent = localStorage.getItem(key);
        list.appendChild(row);
      }
      if (!keys.length) list.textContent = "Aucune course enregistrée.";
    } catch (_) { list.textContent = "Stockage indisponible."; }
  }
  $("scoresPanel").addEventListener("toggle", showHistory);

  function launch(settings) {
    $("setup").hidden = true;
    $("game").hidden = false;
    $("gameStatus").textContent = settings.room === "----" ? "OutRun · solo" : `Salle ${settings.room} · connexion au relais…`;
    const canvas = $("canvas");
    const name = driverName.value.trim();
    const lastScores = new Map();
    const AudioAPI = window.AudioContext || window.webkitAudioContext;
    let audio = null;
    let audioTime = 0;
    if (AudioAPI) {
      try {
        audio = new AudioAPI();
        const resume = () => {
          if (audio.state !== "running" && audio.state !== "closed") audio.resume().catch(() => {});
        };
        resume();
        window.addEventListener("pointerdown", resume);
        window.addEventListener("keydown", resume);
      } catch (_) {}
    }
    const module = {
      playSamples(ptr, samples, rate) {
        if (!audio || audio.state !== "running" || !samples || document.hidden) return;
        const now = audio.currentTime;
        if (audioTime > now + 0.18) return;
        const frames = samples >>> 1;
        const buffer = audio.createBuffer(2, frames, rate);
        const pcm = new Int16Array(module.HEAPU8.buffer, ptr, samples);
        for (let channel = 0; channel < 2; channel++) {
          const out = buffer.getChannelData(channel);
          for (let i = 0; i < frames; i++) out[i] = pcm[2 * i + channel] / 32768;
        }
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(audio.destination);
        audioTime = Math.max(audioTime, now + 0.012);
        source.start(audioTime);
        audioTime += buffer.duration;
      },
      canvas,
      runtimeInitialized: false,
      driverInitials: arcadeInitials(name),
      saveRace(score, initials, first) {
        try {
          if (first) currentRace = racePrefix + Date.now() + "." + crypto.getRandomValues(new Uint32Array(1))[0];
          localStorage.setItem(currentRace, (name ? name + " · " : "") + initials + " · " + (score >>> 0).toString(16).padStart(8, "0"));
        } catch (_) { $("gameStatus").textContent = "Sauvegarde des scores indisponible."; }
      },
      syncScores() {
        try {
          for (const name of scoreFiles) {
            const key = "outrun.table." + name;
            const value = module.FS.analyzePath("/" + name).exists ? module.FS.readFile("/" + name, {encoding: "utf8"}) : null;
            if (value === lastScores.get(name)) continue;
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
            lastScores.set(name, value);
          }
        } catch (_) { $("gameStatus").textContent = "Sauvegarde du classement indisponible."; }
      },
      print: text => console.log(text),
      printErr: text => {
        console.error(text);
        if (/ROM|failed|error|unable|failed/i.test(text)) $("gameStatus").textContent = text;
      },
      locateFile: path => `./${path}?v=${webBuild}`,
      preRun: [() => {
        const FS = module.FS;
        try {
          for (const name of scoreFiles) {
            const value = localStorage.getItem("outrun.table." + name);
            lastScores.set(name, value);
            if (value !== null) FS.writeFile("/" + name, value);
          }
        } catch (_) { $("gameStatus").textContent = "Lecture du classement indisponible."; }
        try { FS.mkdir("/roms"); } catch (_) {}
        for (const [name, data] of Object.entries(romFiles)) FS.writeFile(`/roms/${name}`, data);
        FS.writeFile("/multiplayer.cfg", settings.config);
      }],
      onRuntimeInitialized: () => {
        module.runtimeInitialized = true;
        canvas.focus();
        window.OutRunRelay.setModule(module);
        if ("serviceWorker" in navigator) Promise.resolve().catch(console.warn);
      },
      onAbort: reason => {
        $("gameStatus").textContent = `Le jeu ne démarre pas : ${reason}`;
      }
    };
    window.Module = module;
    const script = document.createElement("script");
    script.src = `./outrun.js?v=${webBuild}`;
    script.onerror = () => { $("gameStatus").textContent = "Fichiers du jeu absents. Le paquet WebAssembly doit être compilé et publié en HTTPS."; };
    document.body.appendChild(script);
  }

  play.addEventListener("click", () => {
    if (!romFiles) return;
    try {
      const config = multiplayerSettings();
      const selected = config.match(/^room=(.*)$/m);
      launch({ config, room: selected ? selected[1] : "----" });
      const root = document.documentElement;
      const enterFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
      if (enterFullscreen && !document.fullscreenElement) {
        try { Promise.resolve(enterFullscreen.call(root)).catch(() => {}); } catch (_) {}
      }
    } catch (error) {
      $("message").textContent = error.message;
    }
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    $("install").hidden = false;
  });
  $("install").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $("install").hidden = true;
  });

  const hud = $("touchHud");
  $("hudToggle").addEventListener("click", () => {
    hud.classList.toggle("hidden");
    $("hudToggle").textContent = hud.classList.contains("hidden") ? "Afficher commandes" : "Masquer commandes";
  });
  // Holding a pedal must not start WebKit text selection or its callout.
  for (const type of ["selectstart", "contextmenu"])
    hud.addEventListener(type, event => event.preventDefault());
  hud.addEventListener("touchstart", event => {
    if (event.target.closest("[data-control]") && event.cancelable) event.preventDefault();
  }, { passive: false });

  const touches = new Map();
  function updateTouch(id, button) {
    const before = touches.get(id);
    if (before === button) return;
    if (button) touches.set(id, button);
    else touches.delete(id);
    for (const changed of [before, button]) {
      if (!changed) continue;
      const pressed = [...touches.values()].includes(changed);
      changed.classList.toggle("pressed", pressed);
      if (window.Module?.runtimeInitialized)
        Module.ccall("outrun_web_set_touch_control", null, ["number", "number"], [+changed.dataset.control, +pressed]);
    }
  }
  function releaseTouches() {
    for (const id of [...touches.keys()]) updateTouch(id, null);
  }
  window.addEventListener("blur", releaseTouches);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseTouches(); });
  $("hudToggle").addEventListener("click", releaseTouches);
  document.querySelectorAll("[data-control]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      updateTouch(event.pointerId, button);
    });
    if (+button.dataset.control <= 1) button.addEventListener("pointermove", event => {
      if (!button.hasPointerCapture(event.pointerId)) return;
      const next = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-control]");
      updateTouch(event.pointerId, next && +next.dataset.control <= 1 ? next : null);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, event => updateTouch(event.pointerId, null));
  });

  $("newCode").textContent = newRoomCode;
  loadRoms().then(files => { if (!importAttempt && files) setRoms(files, "Archive enregistrée"); }).catch(() => {});
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    Promise.resolve().catch(() => {});
})();
