import { inverse3, mv, samplingMap, sample, windowValue } from './core.mjs';
import { composeGrayFusion } from './fusion.mjs';

// The stored registration maps fixed voxel indices to moving voxel indices.
// Invert it once; each output voxel remains on B's unmodified native grid.
export function createBGridOverlay(a, b, params, { windows, opacity, threshold, variableAlpha }) {
  const forward = samplingMap(a, b, params),
    inverse = inverse3(forward.matrix);
  const offset = mv(inverse, forward.offset).map(x => -x);
  const [nx, ny, nz] = b.dims;
  function at(x, y, z) {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z) ||
      x < 0 ||
      y < 0 ||
      z < 0 ||
      x >= nx ||
      y >= ny ||
      z >= nz
    )
      throw RangeError('B voxel is outside the source grid');
    const qx = inverse[0] * x + inverse[1] * y + inverse[2] * z + offset[0];
    const qy = inverse[3] * x + inverse[4] * y + inverse[5] * z + offset[1];
    const qz = inverse[6] * x + inverse[7] * y + inverse[8] * z + offset[2];
    const fixed = windowValue(sample(a, qx, qy, qz), windows.a.level, windows.a.width);
    const moving = windowValue(b.data[(z * ny + y) * nx + x], windows.b.level, windows.b.width);
    if (!Number.isFinite(fixed) && !Number.isFinite(moving)) return 0;
    return composeGrayFusion(fixed, moving, opacity, threshold, variableAlpha);
  }
  function slice(z) {
    if (!Number.isInteger(z) || z < 0 || z >= nz)
      throw RangeError('B slice is outside the source grid');
    const pixels = new Uint8Array(nx * ny);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) pixels[y * nx + x] = at(x, y, z);
    return pixels;
  }
  return { at, slice };
}
