import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { createOverlayDicomZip, createOverlayDicomZipAsync } from '../dist/overlay-dicom.mjs';

// Independent readers for stored ZIP and explicit-VR LE Part 10 DICOM.
const decoder = new TextDecoder();
const text = bytes => decoder.decode(bytes).replace(/[\0 ]+$/g, '');
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, 'ZIP end directory exists');
  const count = v.getUint16(eocd + 10, true);
  const entries = [];
  let p = v.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    assert.equal(v.getUint16(p + 10, true), 0, 'ZIP entry is stored');
    const size = v.getUint32(p + 20, true);
    const nameLength = v.getUint16(p + 28, true);
    const extraLength = v.getUint16(p + 30, true);
    const commentLength = v.getUint16(p + 32, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    const local = v.getUint32(p + 42, true);
    assert.equal(v.getUint32(local, true), 0x04034b50);
    const data = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    entries.push({ name, bytes: bytes.subarray(data, data + size) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
function readDicom(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(decoder.decode(bytes.subarray(128, 132)), 'DICM');
  const tags = new Map();
  let p = 132;
  let metaEnd;
  while (p < bytes.length) {
    if (metaEnd !== undefined && p >= metaEnd) assert.notEqual(v.getUint16(p, true), 2, 'meta group length is exact');
    const key = [v.getUint16(p, true), v.getUint16(p + 2, true)].map(n => n.toString(16).padStart(4, '0')).join(',');
    const vr = decoder.decode(bytes.subarray(p + 4, p + 6));
    const long = ['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'UC', 'UR', 'UT', 'UN'].includes(vr);
    const length = v[long ? 'getUint32' : 'getUint16'](p + (long ? 8 : 6), true);
    const start = p + (long ? 12 : 8);
    assert.ok(start + length <= bytes.length, `tag ${key} fits file`);
    tags.set(key, { vr, value: bytes.subarray(start, start + length), offset: p });
    if (key === '0002,0000') metaEnd = start + length + v.getUint32(start, true);
    p = start + length;
  }
  assert.equal(p, bytes.length);
  assert.equal(metaEnd, tags.get('0008,0005').offset);
  return {
    tags,
    str: key => text(tags.get(key).value),
    uint16: key => new DataView(tags.get(key).value.buffer, tags.get(key).value.byteOffset).getUint16(0, true),
  };
}
const volume = {
  dims: [3, 2, 2], matrix: [2, 0, 0, 0, 3, 0, 0, 0, 4],
  origin: [11, -20, 30], sliceThicknessMm: 4, frameUID: '1.2.826.0.1.3680043.2.1125.1',
};
const study = { studyUID: '1.2.826.0.1.3680043.2.1125.2', patientName: 'SYNTHETIC^TEST', patientID: 'SYNTHETIC', patientBirthDate: '20000101', patientSex: 'O', studyDate: '20200102', studyTime: '121314', accessionNumber: 'SYNTHETIC', studyID: 'TEST' };

test('exports readable two-slice stored ZIP with Part 10 SC pixels and geometry', async () => {
  const calls = [];
  const blob = createOverlayDicomZip({ volume, study, renderSlice(z) { calls.push(z); return Uint8Array.from({ length: 6 }, (_, i) => z * 10 + i); } });
  assert.ok(blob instanceof Blob);
  const archive = new Uint8Array(await blob.arrayBuffer());
  const entries = readZip(archive);
  const independentUnzip = unzipSync(archive);
  assert.deepEqual(Object.keys(independentUnzip).sort(), entries.map(e => e.name).sort());
  for (const entry of entries) assert.deepEqual(independentUnzip[entry.name], entry.bytes);
  assert.equal(entries.length, 2);
  assert.equal(new Set(entries.map(e => e.name)).size, 2);
  assert.deepEqual(calls, [0, 1]);
  const series = new Set(), sop = new Set();
  for (const [z, entry] of entries.entries()) {
    const d = readDicom(entry.bytes);
    const s = d.str;
    assert.equal(s('0002,0010'), '1.2.840.10008.1.2.1');
    assert.equal(s('0002,0002'), '1.2.840.10008.5.1.4.1.1.7');
    assert.equal(s('0008,0016'), s('0002,0002'));
    assert.equal(s('0008,0018'), s('0002,0003'));
    assert.equal(s('0020,000d'), study.studyUID);
    assert.equal(s('0020,0052'), volume.frameUID);
    assert.equal(s('0010,0010'), study.patientName);
    assert.equal(s('0008,0008'), 'DERIVED\\SECONDARY');
    assert.equal(s('0008,0060'), 'OT');
    assert.equal(s('0008,0064'), 'WSD');
    assert.equal(s('0008,103e'), 'Subtract Lab grayscale overlay');
    assert.match(s('0008,2111'), /windowed A\+B blend/i);
    assert.equal(s('0028,0004'), 'MONOCHROME2');
    assert.equal(d.uint16('0028,0010'), 2);
    assert.equal(d.uint16('0028,0011'), 3);
    assert.equal(d.uint16('0028,0002'), 1);
    assert.equal(d.uint16('0028,0100'), 8);
    assert.equal(d.uint16('0028,0101'), 8);
    assert.equal(d.uint16('0028,0102'), 7);
    assert.equal(d.uint16('0028,0103'), 0);
    assert.equal(s('0028,0030'), '3\\2');
    assert.equal(s('0020,0037'), '1\\0\\0\\0\\1\\0');
    assert.equal(s('0020,0032'), `11\\-20\\${30 + 4 * z}`);
    assert.equal(s('0018,0050'), '4');
    assert.equal(s('0018,0088'), '4');
    assert.equal(s('0020,0013'), String(z + 1));
    assert.deepEqual([...d.tags.get('7fe0,0010').value], [z * 10, z * 10 + 1, z * 10 + 2, z * 10 + 3, z * 10 + 4, z * 10 + 5]);
    series.add(s('0020,000e')); sop.add(s('0008,0018'));
  }
  assert.equal(series.size, 1);
  assert.equal(sop.size, 2);
  assert.match([...series][0], /^2\.25\.\d+$/);
  assert.ok([...sop].every(uid => /^2\.25\.\d+$/.test(uid)));
});

test('rejects missing UIDs and invalid geometry before rendering', () => {
  const input = { volume, study, renderSlice: () => { throw Error('render must not run'); } };
  assert.throws(() => createOverlayDicomZip({ ...input, study: { ...study, studyUID: '' } }), /studyUID/);
  assert.throws(() => createOverlayDicomZip({ ...input, volume: { ...volume, frameUID: null } }), /frameUID/);
  assert.throws(() => createOverlayDicomZip({ ...input, volume: { ...volume, dims: [3, 0, 2] } }), /geometry/);
  assert.throws(() => createOverlayDicomZip({ ...input, volume: { ...volume, matrix: [[1, 1, 0], [0, 0, 0], [0, 0, 1]] } }), /geometry/);
  assert.throws(() => createOverlayDicomZip({ ...input, volume: { ...volume, origin: [0, NaN, 0] } }), /geometry/);
});

test('rejects invalid render result and duplicate supplied UIDs', () => {
  assert.throws(() => createOverlayDicomZip({ volume, study, renderSlice: () => new Uint8Array(3) }), /renderSlice/);
  assert.throws(() => createOverlayDicomZip({ volume, study, renderSlice: () => new Array(6).fill(0) }), /renderSlice/);
  assert.throws(() => createOverlayDicomZip({ volume, study, renderSlice: () => new Uint8Array(6), uidFactory: () => '2.25.42' }), /unique/);
});

test('async export yields between slices, reports progress, and writes a readable ZIP', async () => {
  const events = [];
  const result = createOverlayDicomZipAsync({volume,study,renderSlice:z=>{
    events.push(['render',z]);return new Uint8Array(6);
  },onProgress:(completed,total)=>events.push(['progress',completed,total])});
  assert.ok(result instanceof Promise);
  assert.deepEqual(events,[['render',0],['progress',1,2]]);
  const archive = new Uint8Array(await (await result).arrayBuffer());
  assert.equal(readZip(archive).length,2);
  assert.deepEqual(events,[['render',0],['progress',1,2],['render',1],['progress',2,2]]);
});

test('new export uses new series UID; odd pixel count is padded and oblique geometry stays in B space', async () => {
  const oblique = { ...volume, dims: [1, 3, 1], matrix: [0, -2, 0, 3, 0, 0, 0, 0, 5], origin: [7, 8, 9] };
  const make = () => createOverlayDicomZip({ volume: oblique, study, renderSlice: () => Uint8Array.of(20, 30, 40) });
  const first = readDicom(readZip(new Uint8Array(await make().arrayBuffer()))[0].bytes);
  const second = readDicom(readZip(new Uint8Array(await make().arrayBuffer()))[0].bytes);
  assert.notEqual(first.str('0020,000e'), second.str('0020,000e'));
  assert.equal(first.str('0020,0037'), '0\\1\\0\\-1\\0\\0');
  assert.equal(first.str('0028,0030'), '2\\3');
  assert.equal(first.str('0020,0032'), '7\\8\\9');
  assert.deepEqual([...first.tags.get('7fe0,0010').value], [20, 30, 40, 0]);
});
