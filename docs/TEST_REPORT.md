# Test report — Aggregation Explorer 0.1

## Actual test scope

The independent JavaScript CPU solver was executed under v22.16.0. The complete built HTML was loaded into a real Chromium 144.0.7559.96 page, with real Blob Web Worker execution and UI interaction. The environment blocks browser URL navigation, so the exact built HTML was supplied through Playwright `set_content` in an about:blank context. This is not a test of a mocked DOM.

That context does not expose WebGPU. **The GPU code was statically inspected but not compiled/executed in the browser here.** Automatic fallback to the CPU for missing GPU API was exercised. No claim is made about a hardware GPU benchmark or pixel identity with the CPU.

The external file picker/writer was mocked in export tests; the actual export button, rasterizer, metadata builder, grayscale PNG encoder, and output bytes ran. Native Windows save dialogs were not tested.

## CPU model checks

11 tests passed:

- Identical seed gives identical starting fields.
- Changing the seed changes starting placement.
- Material budget is consistent across seeds.
- Selected parameters participate in initialization.
- Rectangular closed and periodic domains stay finite and balanced.
- Checkpoint restore and forward replay are bit-identical.
- Changing numerical batch size does not change the CPU result.
- Cache remains bounded and always retains initial state.
- Invalid parameter combinations are rejected explicitly.
- Finite extremes of initialization and short evolution.
- Longer default CPU run shows genuine patch loss.

Full numerical details are retained in `tests/core_results.json`. The conservation checks use float32 storage, not an assumed exact real-arithmetic sum.

## Browser/UI checks

17 checks passed:

- App opens and renders the default starting mask.
- Forward evolution and rectangular rendering.
- Backward / forward timeline replay recovers bit-identical CPU state.
- Selected stage can be pinned.
- Threshold and inversion do not change the continuous fields.
- Extending the horizon preserves state and seed.
- Saved recipe reload reproduces selected stage and pins.
- New seek supersedes a long in-flight seek.
- Stop calculation settles at a valid completed step.
- 8-bit and 16-bit grayscale exports encode through the UI.
- Model notes dialog opens and closes.
- Play and pause use the same evolution timeline.
- Return to start restores the initial state.
- Reference perturbation initialization evolves and disables irrelevant shape controls.
- Default 192-wide run through model age 200.
- Mobile viewport has no horizontal overflow.
- No uncaught main-page JavaScript errors.

A default-grid example actually run in the browser used seed 4281, 192 × 192 cells, model width 96, and default DDA/initialization settings. At age zero, there were 67 four-connected thresholded patches and 30.5447% occupied area. At model age 200:

| Measurement | Observed value |
|---|---:|
| Patch count | 46 |
| Occupied area | 32.7908% |
| Mean u+v | 4.000031371 |
| Relative budget drift | 7.86134009e-06 |
| Retained-field maximum | 11.793781 |

This is evidence of this finite-grid experimental run, not a published-figure reproduction, general coarsening-rate validation, or proof of a calibrated dune model.

## PNG validation

Both exported files were opened with Pillow, and every PNG chunk CRC was independently checked with Python zlib. Both are 512 × 340 (rectangular test case), PNG color type 0, one grayscale channel, with no alpha.

- 8-bit file contains exactly 0 and 255.
- 16-bit file contains exactly 0 and 65535.
- Embedded description metadata parsed as JSON and matched the selected export depth.
- The no-CompressionStream zlib fallback also passed a 170,000-byte multi-block roundtrip test using Node's independent inflater.

See `tests/png_results.json` and `tests/test_export_8.png` / `test_export_16.png`.

## Local launcher

The standard-library Python launcher was started on a free loopback port in the Linux test environment. GET returned the exact app bytes; HEAD returned appropriate headers; an unrelated file request received 404. These tests are recorded in `tests/launcher_results.json`.

The Windows BAT wrapper was statically reviewed, **not executed on Windows**. The normal browser-opening action was not exercised against a user's desktop. No change was made to the user's computer or World Machine installation.

## Limits remaining

WebGPU runtime compilation and execution on the target Windows browser/GPU; native save dialogs; native WM import and exact physical placement; native WM Code Device implementation; spatial/time convergence of long-time coarsening; published ecological calibration; exact agreement across CPU/GPU/backends. High-age and coarse-grid results remain experimental.

## Re-run instructions for developers

`node tests/core_tests.js` runs the dependency-free CPU checks. `python tests/browser_tests.py` requires Playwright and a suitable Chromium executable; the supplied path is the test container's Chromium path and must be changed elsewhere. These tools are not required for ordinary app use.

`docs/app_initial.png`, `docs/app_evolved.png`, and `docs/app_mobile.png` are captures from actual running browser tests, not generated interface illustrations.
