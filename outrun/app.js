(() => {
  const webBuild = "20261118-14";
  const dbName = "outrun-web-data";
  const $ = id => document.getElementById(id);
  const romInput = $("romZip");
  const play = $("play");
  const roomPanel = $("roomPanel");
  const createPanel = $("createPanel");
  const joinPanel = $("joinPanel");
  const codeInput = $("roomCode");
  let romFiles = null;
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
    play.disabled = true;
    $("romStatus").textContent = "Lecture locale de l’archive ZIP…";
    $("message").textContent = "";
    try {
      const extracted = await OutRunZip.extract(file);
      await storeRoms(extracted);
      setRoms(extracted, file.name);
    } catch (error) {
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
    return `mode=${mode === "create" ? "internet_create" : mode === "join" ? "internet_join" : "offline"}\naddress=\nport=30800\nprotocol=10\nroom=${room}\nplayer=${player}\n`;
  }

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
    const lastScores = new Map();
    const module = {
      canvas,
      runtimeInitialized: false,
      saveRace(score, initials, first) {
        try {
          if (first) currentRace = racePrefix + Date.now() + "." + crypto.getRandomValues(new Uint32Array(1))[0];
          localStorage.setItem(currentRace, initials + " · " + (score >>> 0).toString(16).padStart(8, "0"));
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
        if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(console.warn);
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
      const root = document.documentElement;
      const enterFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
      if (enterFullscreen && !document.fullscreenElement) {
        try { Promise.resolve(enterFullscreen.call(root)).catch(() => {}); } catch (_) {}
      }
      launch({ config, room: selected ? selected[1] : "----" });
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

  document.querySelectorAll("[data-control]").forEach(button => {
    const control = Number(button.dataset.control);
    const set = pressed => {
      if (window.Module && Module.runtimeInitialized && Module.ccall)
        Module.ccall("outrun_web_set_touch_control", null, ["number", "number"], [control, pressed ? 1 : 0]);
      button.classList.toggle("pressed", pressed);
    };
    button.addEventListener("pointerdown", event => { event.preventDefault(); button.setPointerCapture(event.pointerId); set(true); });
    button.addEventListener("pointerup", event => { event.preventDefault(); set(false); });
    button.addEventListener("pointercancel", () => set(false));
    button.addEventListener("lostpointercapture", () => set(false));
  });

  $("newCode").textContent = newRoomCode;
  loadRoms().then(files => { if (files) setRoms(files, "Archive enregistrée"); }).catch(() => {});
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
