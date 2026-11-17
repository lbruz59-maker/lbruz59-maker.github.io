(() => {
  const ROM_NAMES = [
    "epr-10380b.133", "epr-10382b.118", "epr-10381b.132", "epr-10383b.117",
    "epr-10327a.76", "epr-10329a.58", "epr-10328a.75", "epr-10330a.57",
    "opr-10268.99", "opr-10232.102", "opr-10267.100", "opr-10231.103", "opr-10266.101", "opr-10230.104",
    "opr-10185.11", "opr-10186.47",
    "mpr-10371.9", "mpr-10373.10", "mpr-10375.11", "mpr-10377.12",
    "mpr-10372.13", "mpr-10374.14", "mpr-10376.15", "mpr-10378.16",
    "epr-10187.88", "opr-10193.66", "opr-10192.67", "opr-10191.68",
    "opr-10190.69", "opr-10189.70", "opr-10188.71"
  ];

  // Cannonball v0.34 labels this chip epr-10381a.132. Its CRC matches
  // the epr-10381b.132 expected by the engine.
  const ROM_ALIASES = new Map([["epr-10381a.132", "epr-10381b.132"]]);
  const ROM_ALIAS_CRC32 = new Map([["epr-10381a.132", 0xbe8c412b]]);
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const u16 = (view, at) => view.getUint16(at, true);
  const u32 = (view, at) => view.getUint32(at, true);

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function")
      throw new Error("Safari doit prendre en charge la décompression ZIP. Mets iOS à jour, puis réessaie.");
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (_) {
      throw new Error("Impossible de décompresser cette archive ZIP sur ce navigateur.");
    }
  }

  async function extract(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (u32(view, i) === 0x06054b50 && i + 22 + u16(view, i + 20) === bytes.length) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Ce fichier ne semble pas être une archive ZIP valide.");
    const entries = u16(view, eocd + 10);
    const directoryAt = u32(view, eocd + 16);
    const decoder = new TextDecoder();
    const wanted = new Set(ROM_NAMES);
    const found = new Map();
    let at = directoryAt;

    for (let i = 0; i < entries; i++) {
      if (u32(view, at) !== 0x02014b50) throw new Error("L’index ZIP est endommagé.");
      const method = u16(view, at + 10);
      const compressedSize = u32(view, at + 20);
      const nameLength = u16(view, at + 28);
      const extraLength = u16(view, at + 30);
      const commentLength = u16(view, at + 32);
      const localAt = u32(view, at + 42);
      const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)).replace(/\\/g, "/").split("/").pop().toLowerCase();
      const canonicalName = ROM_ALIASES.get(name) || name;
      at += 46 + nameLength + extraLength + commentLength;
      if (!wanted.has(canonicalName) || found.has(canonicalName)) continue;
      if (u32(view, localAt) !== 0x04034b50) throw new Error("Un fichier ROM de l’archive est endommagé.");
      const localNameLength = u16(view, localAt + 26);
      const localExtraLength = u16(view, localAt + 28);
      const dataAt = localAt + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataAt, dataAt + compressedSize);
      const content = method === 0 ? compressed.slice() : method === 8 ? await inflateRaw(compressed) : null;
      if (!content) throw new Error("Méthode de compression ZIP non prise en charge.");
      if (canonicalName === name || crc32(content) === ROM_ALIAS_CRC32.get(name))
        found.set(canonicalName, content);
    }

    const missing = ROM_NAMES.filter(name => !found.has(name));
    if (missing.length) throw new Error(`ROMs manquantes dans le ZIP (${missing.length}) : ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
    return Object.fromEntries(found.entries());
  }

  window.OutRunZip = { ROM_NAMES, extract };
})();