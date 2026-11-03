// Browser-native, stored ZIP of grayscale Secondary Capture Part 10 instances.
const encoder = new TextEncoder();
const SC = '1.2.840.10008.5.1.4.1.1.7';
const TS = '1.2.840.10008.1.2.1';
const LONG_VR = new Set(['OB', 'OW', 'OF', 'OD', 'OL', 'OV', 'SQ', 'UC', 'UR', 'UT', 'UN']);
const uidPattern = /^[0-9]+(?:\.[0-9]+)+$/;
function requireUID(value, name) {
  if (typeof value !== 'string' || value.length > 64 || !uidPattern.test(value)) throw new Error(`${name} must be a valid DICOM UID`);
  return value;
}
function generatedUID(factory) {
  const value = factory ? factory() : `2.25.${BigInt(`0x${globalThis.crypto.randomUUID().replaceAll('-', '')}`).toString()}`;
  return requireUID(value, 'generated UID');
}
function geometry(volume) {
  const { dims, matrix, origin, sliceThicknessMm } = volume || {};
  if (!Array.isArray(dims) || dims.length !== 3 || !dims.every(n => Number.isSafeInteger(n) && n > 0) || dims[0] > 65535 || dims[1] > 65535 || dims[2] > 65535 || dims[0] * dims[1] > 0xffffffff - 1 ||
      !Array.isArray(matrix) || matrix.length !== 9 || !matrix.every(Number.isFinite) ||
      !Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite) ||
      !Number.isFinite(sliceThicknessMm) || sliceThicknessMm <= 0) throw new Error('Invalid B volume geometry');
  const cols = [0, 1, 2].map(j => [matrix[j], matrix[j + 3], matrix[j + 6]]);
  const lengths = cols.map(c => Math.hypot(...c));
  if (lengths.some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Invalid B volume geometry');
  const unit = cols.map((c, j) => c.map(n => n / lengths[j]));
  const dot = (a, b) => a.reduce((sum, n, j) => sum + n * b[j], 0);
  if (Math.abs(dot(unit[0], unit[1])) > 1e-4 || Math.abs(dot(unit[0], unit[2])) > 1e-4 || Math.abs(dot(unit[1], unit[2])) > 1e-4) throw new Error('Invalid B volume geometry: axes must be orthogonal');
  return { dims, cols, lengths, unit, origin, sliceThicknessMm };
}
const ds = n => {
  const value = Number(n.toPrecision(10)).toString();
  if (value.length > 16) throw new Error('Geometry exceeds DICOM DS precision');
  return value;
};
const ascii = (s, pad = 0x20) => {
  const raw = encoder.encode(String(s ?? ''));
  if (raw.length % 2 === 0) return raw;
  const out = new Uint8Array(raw.length + 1); out.set(raw); out[raw.length] = pad; return out;
};
const u16 = n => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
function tag(group, element, vr, value) {
  const bytes = value instanceof Uint8Array ? value : ascii(value, vr === 'UI' ? 0 : 0x20);
  const long = LONG_VR.has(vr);
  const out = new Uint8Array((long ? 12 : 8) + bytes.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, group, true); view.setUint16(2, element, true);
  out.set(encoder.encode(vr), 4);
  if (long) view.setUint32(8, bytes.length, true);
  else {
    if (bytes.length > 65534) throw new Error('DICOM element too large');
    view.setUint16(6, bytes.length, true);
  }
  out.set(bytes, long ? 12 : 8);
  return out;
}
function concat(parts) {
  const size = parts.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(size);
  let p = 0;
  for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}
function dicom(g, study, seriesUID, sopUID, z, pixels) {
  const metaElements = [
    tag(2, 1, 'OB', Uint8Array.of(0, 1)),
    tag(2, 2, 'UI', SC), tag(2, 3, 'UI', sopUID), tag(2, 16, 'UI', TS),
    tag(2, 18, 'UI', '2.25.274293262408782891150449205953155179101'),
  ];
  const meta = concat([tag(2, 0, 'UL', u32(metaElements.reduce((n, t) => n + t.length, 0))), ...metaElements]);
  const T = (group, element, vr, value) => tag(group, element, vr, value);
  const position = g.origin.map((n, j) => ds(n + z * g.cols[2][j])).join('\\');
  const orientation = [...g.unit[0], ...g.unit[1]].map(ds).join('\\');
  const data = [
    T(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
    T(0x0008, 0x0008, 'CS', 'DERIVED\\SECONDARY'),
    T(0x0008, 0x0016, 'UI', SC), T(0x0008, 0x0018, 'UI', sopUID),
    T(0x0008, 0x0020, 'DA', study.studyDate), T(0x0008, 0x0030, 'TM', study.studyTime),
    T(0x0008, 0x0050, 'SH', study.accessionNumber), T(0x0008, 0x0060, 'CS', 'OT'),
    T(0x0008, 0x0064, 'CS', 'WSD'),
    T(0x0008, 0x103e, 'LO', 'Subtract Lab grayscale overlay'),
    T(0x0008, 0x2111, 'ST', 'Windowed A+B blend; display-only derived grayscale overlay, not quantitative.'),
    T(0x0010, 0x0010, 'PN', study.patientName), T(0x0010, 0x0020, 'LO', study.patientID),
    T(0x0010, 0x0030, 'DA', study.patientBirthDate), T(0x0010, 0x0040, 'CS', study.patientSex),
    T(0x0018, 0x0050, 'DS', ds(g.sliceThicknessMm)), T(0x0018, 0x0088, 'DS', ds(g.lengths[2])),
    T(0x0020, 0x000d, 'UI', study.studyUID), T(0x0020, 0x000e, 'UI', seriesUID),
    T(0x0020, 0x0010, 'SH', study.studyID), T(0x0020, 0x0013, 'IS', z + 1),
    T(0x0020, 0x0032, 'DS', position), T(0x0020, 0x0037, 'DS', orientation),
    T(0x0020, 0x0052, 'UI', g.frameUID),
    T(0x0028, 0x0002, 'US', u16(1)), T(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    T(0x0028, 0x0010, 'US', u16(g.dims[1])), T(0x0028, 0x0011, 'US', u16(g.dims[0])),
    T(0x0028, 0x0030, 'DS', `${ds(g.lengths[1])}\\${ds(g.lengths[0])}`),
    T(0x0028, 0x0100, 'US', u16(8)), T(0x0028, 0x0101, 'US', u16(8)),
    T(0x0028, 0x0102, 'US', u16(7)), T(0x0028, 0x0103, 'US', u16(0)),
    T(0x7fe0, 0x0010, 'OB', asciiPixels(pixels)),
  ];
  const preamble = new Uint8Array(132); preamble.set(encoder.encode('DICM'), 128);
  return concat([preamble, meta, ...data]);
}
function asciiPixels(pixels) {
  if (!(pixels.length % 2)) return pixels;
  const padded = new Uint8Array(pixels.length + 1); padded.set(pixels); return padded;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipHeader(signature, size) {
  const b = new Uint8Array(size);
  new DataView(b.buffer).setUint32(0, signature, true);
  return b;
}
/** Assemble a browser-downloadable stored ZIP using one B-space slice at a time. */
function* buildOverlayDicomZip({ volume, study, renderSlice, uidFactory } = {}) {
  const g = geometry(volume);
  requireUID(g.frameUID = volume.frameUID, 'frameUID');
  if (!study || typeof study !== 'object') throw new Error('study is required');
  requireUID(study.studyUID, 'studyUID');
  if (typeof renderSlice !== 'function') throw new Error('renderSlice must be a function');
  if (uidFactory !== undefined && typeof uidFactory !== 'function') throw new Error('uidFactory must be a function');
  const seriesUID = generatedUID(uidFactory);
  const parts = [], central = [];
  const seen = new Set([seriesUID]);
  let offset = 0, centralSize = 0;
  for (let z = 0; z < g.dims[2]; z++) {
    const pixels = renderSlice(z);
    if (!(pixels instanceof Uint8Array) || pixels.length !== g.dims[0] * g.dims[1]) throw new Error(`renderSlice(${z}) must return Uint8Array(cols*rows)`);
    const sopUID = generatedUID(uidFactory);
    if (seen.has(sopUID)) throw new Error('Generated UIDs must be unique');
    seen.add(sopUID);
    const bytes = dicom(g, study, seriesUID, sopUID, z, pixels);
    const name = encoder.encode(`overlay-${String(z + 1).padStart(5, '0')}-${sopUID}.dcm`);
    const crc = crc32(bytes);
    const local = zipHeader(0x04034b50, 30);
    const lv = new DataView(local.buffer);
    lv.setUint16(4, 20, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, name.length, true);
    const record = zipHeader(0x02014b50, 46);
    const rv = new DataView(record.buffer);
    rv.setUint16(4, 20, true); rv.setUint16(6, 20, true); rv.setUint32(16, crc, true);
    rv.setUint32(20, bytes.length, true); rv.setUint32(24, bytes.length, true);
    rv.setUint16(28, name.length, true); rv.setUint32(42, offset, true);
    parts.push(local, name, bytes);
    central.push(record, name); centralSize += record.length + name.length;
    offset += local.length + name.length + bytes.length;
    if (offset + centralSize + 22 > 0xffffffff) throw new Error('ZIP exceeds 4 GiB limit');
    yield z + 1;
  }
  if (g.dims[2] > 65535) throw new Error('ZIP exceeds entry count limit');
  const end = zipHeader(0x06054b50, 22);
  const ev = new DataView(end.buffer);
  ev.setUint16(8, g.dims[2], true); ev.setUint16(10, g.dims[2], true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
export function createOverlayDicomZip(options) {
  const builder = buildOverlayDicomZip(options);
  let step;
  do { step = builder.next(); } while (!step.done);
  return step.value;
}
export async function createOverlayDicomZipAsync(options) {
  const builder = buildOverlayDicomZip(options);
  let step = builder.next();
  while (!step.done) {
    options?.onProgress?.(step.value, options.volume.dims[2]);
    await new Promise(resolve => setTimeout(resolve, 0));
    step = builder.next();
  }
  return step.value;
}
