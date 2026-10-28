# Subtract — DICOM workspace

Browser-local prototype for loading two DICOM volumes, rigid registration, independent DICOM LINEAR windows and signed subtraction. No DICOM data leaves the browser. All dependencies and WebAssembly codecs are served with the app; no CDN or remote processing service is used.

## Run

Serve `dist/` from an HTTP server. ES modules and workers do not work reliably over `file://`. There is no build step. `npm ci` installs development dependencies; `npm test` runs the computational and DICOM tests. Static vendored assets are committed for deployment. The interface defaults to English; append `?lang=ru` for Russian or use the EN/RU links. Changing language reloads the page, so save or export your work first; loaded real series and non-default alignment trigger a confirmation. The demo is labelled as synthetic data.

## Behavior

- A is the fixed reference. A complete Float32 B-on-A volume is built in a Web Worker after loading, registration or manual correction. Its dimensions, voxel matrix, origin and frame of reference exactly match A. Slice rendering, subtraction and NIfTI export use this same volume. Original B is retained for registration; repeated corrections resample from the original, never from the last resampled output.
- Downsampling applies an optional separable Gaussian anti-alias filter in source space. Sigma matches the diagonal difference between the target voxel footprint variance (projected into source voxel coordinates) and the source voxel variance. The filter ignores padded samples, preserves missing center voxels and is bypassed for equal or finer grids. This approximates voxel-footprint matching, not the scanner slice profile or true PSF matching. The UI shows original SliceThickness separately from 3D grid spacing. Upsampling cannot restore missing through-plane detail.
- Subtraction is grayscale only: signed differences use mid-gray for zero, and an optional magnitude mode uses black for zero. Nonoverlap is shown as a neutral gray hatch.
- The third viewer also has a frameless movable comparison window: A fills the background and resampled B is shown only inside the rectangle. Move it with the mouse or touch, and adjust its size with the slider. This is a display-only comparison, not a spatial deformation or a subtraction; NIfTI export still contains the numerical difference.
- Automatic registration estimates 3 translations and 3 Euler rotations, with a coarse-to-fine coordinate search using NCC or normalized mutual information. It is a local optimizer, not an exhaustive search or a substitute for ITK/elastix validation. Large pose changes, changing anatomy, small overlap and repetitive structure can cause incorrect convergence.
- Manual correction uses the result viewer instead of six coordinate inputs: enable “Двигать B”, drag B over A in overlay mode, and use the ±1° buttons to rotate around the displayed plane normal. The drag preview is a fast 2D shift of the previously aligned slice; on release the full B-on-A 3D volume is resampled from original B. Reset restores the DICOM geometry. Verify alignment in all three planes before exporting.
- Parameter mapping: `pB = Rz Ry Rx (pA − centerA) + centerA + t` in DICOM LPS mm. A→B is the sampling transform, not B→A. JSON exports include the full 4×4 matrix.
- Display planes follow the voxel axes of A (including oblique acquisitions), with patient orientation labels. They are not reoriented to canonical anatomical axes. Anisotropic pixel aspect ratios are preserved; gantry tilt/shear is preserved by the physical sampling map, although the 2D display is rectangular.
- The initial display plane is identified from A's physical DICOM slice normal (or B's until A is loaded), rather than assuming that the third array dimension is axial. The axial/coronal/sagittal controls pick the closest source-grid axis to each patient plane. For oblique acquisitions these remain oblique voxel-axis views, not canonical orthogonal reformatting; check the orientation labels.
- Windowed subtraction is `W(A) − k W(B)` or its negation; W uses independent WL/WW, maps to 0–1, and clips outside the window. Raw subtraction uses rescaled intensities before windowing. No histogram matching, bias-field correction, SUV conversion, decay correction or deformable registration is applied.
- Nonoverlap/pixel padding are excluded rather than zero-filled. NIfTI exports contain NaN outside valid overlap. Display scale, gain and palette do not alter exported differences.
- PNG exports the current result view. NIfTI exports Float32 data in A's grid with an LPS→RAS sform, gzip-compressed as `.nii.gz` when the browser supports CompressionStream. JSON preserves parameters, settings and geometry. NIfTI/JSON may contain study geometry and a series description; the app never uploads these exports.
- Treat JSON exports as potentially identifying: series descriptions, frame-of-reference UIDs and geometry are not anonymized. Files are saved locally, not uploaded by the application.
- The first view uses an explicitly labelled analytic synthetic phantom; it is not a clinical examination. Its known A→B transform is `[5, -3, 2]` mm and `[1.5, -1, 3]` degrees. A focal intensity change is intentionally retained after alignment.

## DICOM compatibility

Regular monochrome scalar volumes with ImagePositionPatient, ImageOrientationPatient and PixelSpacing are required. Classic single-frame slices and Enhanced multiframe with per-frame positions are supported. Files group by SeriesInstanceUID, echo number, temporal identifier and ImageType; no patient identifiers are displayed. Repeated positions, missing slices, inconsistent orientations, MONOCHROME1, Siemens MOSAIC and Modality LUT are rejected explicitly. Time/echo arrays must be separated into volumes. RescaleSlope/Intercept and signed BitsStored/HighBit are honored. Raw inputs are not automatically calibrated between scanners or modalities.

Codecs: uncompressed implicit/explicit LE, explicit BE, Deflated Explicit LE, RLE, JPEG Lossless 57/70, JPEG-LS 80/81, JPEG2000 90/91 and JPEG Baseline 8 bit 50. HTJ2K, JPEG Extended 12 bit, RGB and classic multiframe without frame positions are not supported. Compressed multiframe requires a usable offset table or one fragment per frame.

The current memory cap is 100 million voxels per volume (Float32). Large data may exhaust browser memory earlier, especially when creating worker copies, Gaussian prefilter buffers, the full B-on-A cache or exports. NIfTI export is capped at 60 million voxels. Loaded files, transforms and windows are cleared on reload; save the JSON/NIfTI first if needed.

## Verification

`tests/` covers physical geometry, anisotropic/oblique mapping, trilinear interpolation, missing/padded voxels, DICOM windowing, intensity normalization, known 6-DOF recovery, MI with inverted contrast, sorting/rescale, signed 12-bit LE/BE, grouping, invalid spacing, RLE and compressed codec round trips. `scripts/fixtures.mjs <directory>` creates anonymous synthetic DICOM ZIPs for browser QA. These are engineering checks, not clinical validation.

Third-party licenses are in `dist/vendor/LICENSES.txt`.
