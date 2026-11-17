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
  // Cannonball v0.34 labels this chip epr-10381a.132; its CRC matches the engine ROM.
  const ROM_ALIASES = new Map([["epr-10381a.132", "epr-10381b.132"]]);
  const ROM_ALIAS_CRC32 = new Map([["epr-10381a.132", 0xbe8c412b]]);
  const u16 = (view, at) => view.getUint16(at, true);
  const u32 = (view, at) => view.getUint32(at, true);

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

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

  async function readEntry(file, entry) {
    if (entry.localAt + 30 > file.size) throw new Error("L’index ZIP est endommagé.");
    const localBytes = new Uint8Array(await file.slice(entry.localAt, entry.localAt + 30).arrayBuffer());
    const localView = new DataView(localBytes.buffer, localBytes.byteOffset, localBytes.byteLength);
    if (u32(localView, 0) !== 0x04034b50) throw new Error("Un fichier ROM de l’archive est endommagé.");
    const dataAt = entry.localAt + 30 + u16(localView, 26) + u16(localView, 28);
    const endAt = dataAt + entry.compressedSize;
    if (endAt > file.size) throw new Error("Un fichier ROM de l’archive est tronqué.");
    const compressed = new Uint8Array(await file.slice(dataAt, endAt).arrayBuffer());
    const content = entry.method === 0 ? compressed : entry.method === 8 ? await inflateRaw(compressed) : null;
    if (!content) throw new Error("Méthode de compression ZIP non prise en charge.");
    return content;
  }

  async function extract(file) {
    // Read only the ZIP footer, its directory, and the required ROM entries.
    // Full Cannonball distributions can be hundreds of megabytes due to bundled music.
    const tailStart = Math.max(0, file.size - 65557);
    const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
    const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (i + 22 <= tail.length && u32(tailView, i) === 0x06054b50 &&
          tailStart + i + 22 + u16(tailView, i + 20) === file.size) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Ce fichier ne semble pas être une archive ZIP valide.");
    const entryCount = u16(tailView, eocd + 10);
    const directorySize = u32(tailView, eocd + 12);
    const directoryAt = u32(tailView, eocd + 16);
    if (directoryAt + directorySize > file.size) throw new Error("L’index ZIP est endommagé.");
    const directory = new Uint8Array(await file.slice(directoryAt, directoryAt + directorySize).arrayBuffer());
    const directoryView = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
    const decoder = new TextDecoder();
    const wanted = new Set(ROM_NAMES);
    const entries = new Map();
    let at = 0;

    for (let i = 0; i < entryCount; i++) {
      if (at + 46 > directory.length || u32(directoryView, at) !== 0x02014b50)
        throw new Error("L’index ZIP est endommagé.");
      const method = u16(directoryView, at + 10);
      const compressedSize = u32(directoryView, at + 20);
      const nameLength = u16(directoryView, at + 28);
      const extraLength = u16(directoryView, at + 30);
      const commentLength = u16(directoryView, at + 32);
      const localAt = u32(directoryView, at + 42);
      const next = at + 46 + nameLength + extraLength + commentLength;
      if (next > directory.length) throw new Error("L’index ZIP est endommagé.");
      const name = decoder.decode(directory.subarray(at + 46, at + 46 + nameLength))
        .replace(/\\/g, "/").split("/").pop().toLowerCase();
      const canonicalName = ROM_ALIASES.get(name) || name;
      if (wanted.has(canonicalName)) {
        const existing = entries.get(canonicalName);
        const isAlias = canonicalName !== name;
        if (!existing || (existing.name !== canonicalName && !isAlias))
          entries.set(canonicalName, {name, method, compressedSize, localAt});
      }
      at = next;
    }

    const found = new Map();
    for (const [canonicalName, entry] of entries) {
      const content = await readEntry(file, entry);
      if (entry.name !== canonicalName && crc32(content) !== ROM_ALIAS_CRC32.get(entry.name)) continue;
      found.set(canonicalName, content);
    }
    const missing = ROM_NAMES.filter(name => !found.has(name));
    if (missing.length) throw new Error("ROMs manquantes dans le ZIP (" + missing.length + ") : " + missing.slice(0, 5).join(", ") + (missing.length > 5 ? "…" : ""));
    return Object.fromEntries(found.entries());
  }

  window.OutRunZip = { ROM_NAMES, extract };
})();