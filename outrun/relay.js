(() => {
  const brokers = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://test.mosquitto.org:8081",
    "wss://mqtt.eclipseprojects.io:443/mqtt"
  ];
  let socket = null;
  let roomTopic = "";
  let retryTimer = 0;
  let brokerIndex = 0;
  let packetId = 0;
  let subscribed = false;
  let stopped = false;
  let nativeModule = null;
  const pendingPackets = [];
  const textEncoder = new TextEncoder();

  function mqttString(text) {
    const encoded = textEncoder.encode(text);
    return [encoded.length >> 8, encoded.length & 255, ...encoded];
  }

  function mqttPacket(header, body) {
    let remaining = body.length;
    const length = [];
    do {
      let digit = remaining % 128;
      remaining = Math.floor(remaining / 128);
      if (remaining > 0) digit |= 0x80;
      length.push(digit);
    } while (remaining > 0);
    return new Uint8Array([header, ...length, ...body]);
  }

  function setNativeStatus(connected) {
    if (nativeModule && nativeModule.runtimeInitialized && nativeModule.ccall)
      nativeModule.ccall("outrun_web_on_relay_status", null, ["number"], [connected ? 1 : 0]);
    const badge = document.getElementById("gameStatus");
    if (badge && roomTopic)
      badge.textContent = connected ? `Salle ${roomTopic.slice(roomTopic.lastIndexOf("/") + 1)} · connectée` :
        `Salle ${roomTopic.slice(roomTopic.lastIndexOf("/") + 1)} · connexion au relais…`;
  }

  function deliver(payload) {
    if (!nativeModule || !nativeModule.runtimeInitialized || !nativeModule.ccall) {
      pendingPackets.push(payload);
      if (pendingPackets.length > 64) pendingPackets.shift();
      return;
    }
    const ptr = nativeModule._malloc(payload.length);
    if (!ptr) return;
    nativeModule.HEAPU8.set(payload, ptr);
    nativeModule.ccall("outrun_web_on_relay_packet", null,
      ["number", "number"], [ptr, payload.length]);
    nativeModule._free(ptr);
  }

  function flushPending() {
    while (pendingPackets.length) deliver(pendingPackets.shift());
  }

  function subscribe() {
    if (!socket || socket.readyState !== WebSocket.OPEN || subscribed) return;
    const id = (++packetId) & 0xffff;
    socket.send(mqttPacket(0x82, [id >> 8, id & 255, ...mqttString(roomTopic), 0]));
  }

  function parsePackets(data) {
    let at = 0;
    while (at + 2 <= data.length) {
      const header = data[at++];
      let remaining = 0;
      let multiplier = 1;
      let digit;
      do {
        if (at >= data.length) return;
        digit = data[at++];
        remaining += (digit & 0x7f) * multiplier;
        multiplier *= 128;
      } while (digit & 0x80);
      if (at + remaining > data.length) return;
      const end = at + remaining;
      const type = header >> 4;
      if (type === 2 && remaining >= 2) {
        if (data[at + 1] === 0) subscribe();
        else setNativeStatus(false);
      } else if (type === 9) {
        subscribed = true;
        setNativeStatus(true);
        flushPending();
      } else if (type === 3 && remaining >= 2) {
        const topicLength = (data[at] << 8) | data[at + 1];
        let payloadAt = at + 2 + topicLength;
        const qos = (header >> 1) & 3;
        if (qos > 0) payloadAt += 2;
        if (payloadAt <= end) {
          const payload = data.slice(payloadAt, end);
          if (payload.length === 49 && payload[0] === 0x4f && payload[1] === 0x52)
            deliver(payload);
        }
      }
      at = end;
    }
  }

  function attemptBroker() {
    if (stopped) return;
    const url = brokers[brokerIndex++ % brokers.length];
    subscribed = false;
    try {
      socket = new WebSocket(url, "mqtt");
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        if (stopped) { socket.close(); return; }
        const client = `outrun-web-${crypto.getRandomValues(new Uint32Array(2)).join("")}`;
        const body = [0, 4, 77, 81, 84, 84, 4, 2, 0, 20, ...mqttString(client)];
        socket.send(mqttPacket(0x10, body));
      };
      socket.onmessage = event => {
        if (event.data instanceof ArrayBuffer) parsePackets(new Uint8Array(event.data));
        else if (event.data instanceof Blob) event.data.arrayBuffer().then(buffer => parsePackets(new Uint8Array(buffer)));
      };
      socket.onerror = () => setNativeStatus(false);
      socket.onclose = () => {
        socket = null;
        subscribed = false;
        setNativeStatus(false);
        if (!stopped) retryTimer = window.setTimeout(attemptBroker, 2200);
      };
    } catch (_) {
      retryTimer = window.setTimeout(attemptBroker, 2200);
    }
  }

  window.OutRunRelay = {
    start(room) {
      if (!/^[A-Z0-9]{4}$/.test(room)) return false;
      this.stop();
      roomTopic = `outrun/v10/${room}`;
      stopped = false;
      brokerIndex = 0;
      attemptBroker();
      return true;
    },
    publish(payload) {
      if (!subscribed || !socket || socket.readyState !== WebSocket.OPEN || payload.length !== 49) return;
      socket.send(mqttPacket(0x30, [...mqttString(roomTopic), ...payload]));
    },
    setModule(module) {
      nativeModule = module;
      flushPending();
    },
    stop() {
      stopped = true;
      window.clearTimeout(retryTimer);
      retryTimer = 0;
      subscribed = false;
      const current = socket;
      socket = null;
      if (current) {
        current.onclose = null;
        try { current.close(); } catch (_) {}
      }
      setNativeStatus(false);
    }
  };
})();
