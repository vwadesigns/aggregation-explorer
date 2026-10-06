# GitHub Pages edition

This repository packages Aggregation Explorer 0.1 for browser access. **The hosted `index.html` is byte-for-byte identical to the working `Aggregation_Explorer.html`; no simulation or UI changes were made for hosting.**

The intended project-site address, after Pages is enabled under `vwadesigns/aggregation-explorer`, is:

https://vwadesigns.github.io/aggregation-explorer/

This packaging step does not itself create the repository or publish the site. Follow [PUBLISHING.md](PUBLISHING.md) to enable **Deploy from a branch → main → /(root)**. The built page is already supplied; no build service, Python installation, or account is needed by visitors to use it. The local launcher remains an optional offline route.

For later source edits, run `python build_site.py` and commit both HTML outputs. Committing only `src/` changes will not update the hosted page. Research credits and scientific limits are retained below and in [docs/MODEL.md](docs/MODEL.md). No additional software license is selected by this hosting package.

---

# Aggregation Explorer 0.1

A local browser app for exploring a seeded family of black-and-white masks through density-dependent aggregation (DDA). Built for personal experimentation and subsequent use of exported masks in World Machine.

## Start on Windows

1. Extract the whole ZIP into a normal folder. Do not run the launcher inside the ZIP preview.
2. Double-click **Launch_Aggregation_Explorer.bat**. It uses Python 3's standard library, opens your default browser, and serves only the HTML app on a free loopback port. No pip, NumPy, Node, npm, account, or internet connection is required to use the app.
3. Keep the small console window open. Close it, or press Ctrl+C, when finished.

The launcher also prints the local address, so it can be opened in a different browser. A current Chromium-based browser is the intended GPU target; the app detects availability rather than assuming it.

**Portable alternative:** open `Aggregation_Explorer.html` directly. All application code is inside that single file. Local-file worker/GPU availability depends on browser policy; unavailable WebGPU automatically selects the CPU worker. Use the launcher when local-file access is restricted. Neither route installs or changes World Machine.

On other systems, run `python3 launch.py` from the extracted folder. Python is used only to serve the HTML file, not to calculate the model.

## First run

Leave seed **4281** and the initial settings unchanged. Inspect age **0**, then type **25**, **100**, and **200** into **Go to age**. The browser may need time to calculate a stage that has not yet been reached. The status line reports the actual calculated age separately from the requested age.

Move backward and forward with **Evolution**, or use **Play**. **Return to start** keeps the seed and restores age zero. **New seed** starts a different realization. **Extend ×2** increases the timeline horizon without changing the current state or seed; **Build to end** requests that horizon. The numerical time step does not increase when you extend the timeline. Timeline maximum in this prototype: 65,536 model-time units, not years. Very late uncached stages can take a long time.

Changes to starting geometry or model parameters reset the history after a short input debounce. Changes to threshold or inversion do not change the simulation.

The defaults are creative prototype settings, not a published calibration of the dune animation. The model can shrink some features, grow others, join neighbors, and relax boundaries. Do not expect component count to decrease at every increment or expect every late stage to be visually better.

## Controls

| Control | Function |
|---|---|
| Seed / New seed | Repeatable starting realization. Seed is not a monotonic size control. |
| Starting character | Irregular, small scattered, broad connected, or reference perturbations. |
| Initial patch scale | Typical radius in model units. Larger scale generally uses fewer initial stamps for a given coverage target. |
| Initial coverage target | Approximate random-union geometry target; the thresholded area can differ. Actual occupied area is reported. |
| Size variation | Broadens the starting size distribution. |
| Starting irregularity | Initial outline lobes and occasional overlapping secondary lobes; no fresh noise is injected as time advances. |
| Evolution / Go to age | Select elapsed model time along the same history. Logarithmic scrub, exact numeric entry. |
| Patch threshold | Fixed contour of the retained field. Higher threshold generally contracts the displayed black area. Display/export only. |
| Invert | Reverse black/white output without changing the fields or reported patch statistics. |
| Pin stage | Store up to 12 age bookmarks for this setup. Pins do not reserve every underlying cache entry. |
| Material budget T | Initial domain mean of u+v. Consistent between seeds to float32 precision. |
| Feedback a, b | Coefficients of the saturating loss/exchange term. These can change the dynamical regime. |
| Retained/mobile diffusion | The two transport coefficients. Not generic post-process blur controls. |
| Domain width | Dimensionless/model-space width, distinct from pixels and real-world meters. |
| Simulation width / aspect | Changes the computational grid and rebuilds the experiment. Height is rounded to a whole number of cells. |
| Numerical step | Conservative automatic fixed step, or half that step. Fixed per run. |
| Closed boundary | Zero material flux through the outer cell faces. |
| Periodic boundary | Opposite edges of this one simulated domain exchange material. Not a promise about separately simulated neighboring WM tiles. |
| Compute engine | Automatic WebGPU with CPU fallback at startup; CPU-only; or GPU-only with explicit failure. |

See `docs/MODEL.md` for all parameter identifiers, limits, equations, initial conditions, and numerical details.

## PNG export

Scroll down the settings panel to **Keep this stage**. Export is enabled when the requested stage is complete.

- Single-channel grayscale PNG, selectable **8-bit** or **16-bit**. No alpha or RGB packing.
- Only black and white values: 0/255 in 8-bit, 0/65535 in 16-bit. 16-bit does not add information to a binary mask.
- Native width or 512/1024/2048/4096 pixels; height preserves the actual simulation grid aspect.
- The retained field is bilinearly sampled at the selected export size, then thresholded. This is **resampling**, not a higher-resolution simulation. It can change small contour details compared with native-grid counting.
- Top row remains the top row. No horizontal or vertical flip is added.
- No real-world origin, meters-per-pixel, terrain elevation scale, tile coordinates, or receiver-specific interpretation is silently assigned. This is a pattern mask, not a calibrated heightmap.
- Filename and embedded PNG description record seed, model age, dimensions, precision, recipe, actual backend, and mask settings.

Where permitted, the app requests a Save dialog. Otherwise, it uses the browser's normal download behavior. It cannot override browser or administrator save policies.

## Save and load setups

**Save setup** writes a JSON recipe with the full configuration, selected age, mask settings, timeline horizon, and pins. The resolved compute backend is saved explicitly. It does not include all cached continuous fields; loading reconstructs the selected age.

For the same app version, configuration, numerical grid, and CPU backend, replay is tested to recover identical state bytes. Browser/GPU floating-point behavior can differ, and this app does not promise CPU/GPU pixel identity. Switch to CPU before saving a recipe when a portable CPU reference is important.

In-memory checkpoints store both float32 fields. Age zero is always retained, and a bounded least-recently-used cache holds up to 48 MiB / 96 states. Older evicted stages are recalculated from an available earlier checkpoint. No reverse diffusion or image crossfading is used.

## Troubleshooting

**Blank image:** inspect the status/notice first. A stopped numerical check is reported explicitly. A valid threshold can also select everything or nothing; return the threshold to 3.0 and try Defaults. The solver does not replace failures with a flat map.

**Slow calculation:** first try Simulation width 128. Use a moderate age, then extend. Larger grids require more updates for the same model time. Previously cached stages are easier to revisit, but an evicted stage may need rebuilding. CPU calculation runs in a worker so the controls remain usable.

**GPU unavailable or shader failure:** Automatic mode falls back to the CPU during startup and records the reason under Advanced. GPU-only mode reports failure. A GPU failure mid-run stops the history; it does not silently continue that history on a different backend.

**History changes after changing quality:** that is a new numerical experiment. Use the same simulation grid when comparing seeds/stages. PNG size is a separate presentation/export setting.

**Late-stage changes stall or align with pixels:** finite-grid effects can alter/pin interfaces. Compare a finer spatial grid over the same model-space domain. Fine time steps alone do not improve spatial resolution. This first version is a visual experiment, not a convergence-certified long-time solver.

**Mask works in the app but differently in WM:** this release contains no native WM device. Keep the exported mask's dimensions and polarity explicit; assign world placement/scale in your receiving workflow. Do not interpret pure black/white as authored terrain elevations automatically.

## Source and scope

Mathematical basis: Siteur et al. (2023), *Phase-separation physics underlies new theory for the resilience of patchy ecosystems*, PNAS 120(2), e2202683120, DOI 10.1073/pnas.2202683120.

Repository reference: `liuqx315/PS-Resilience-in-Ecosystems`, specifically `Figure3/DDA Model_LS.ipynb` (reviewed blob SHA `6cbecf45691c514a32a8db5fc553316fa1aa6c49`). The explorer is independently written. The authors' notebook/helper source is not distributed in this package, and no endorsement or license over their code is claimed.

This app preserves the selected DDA equations. Seeded patch initialization, synchronous updates, conservative cell-face boundary handling, deterministic seeds, checkpointing, mask conversion, and interface are clearly documented adaptations. It is not the exact dune-grass animation, a reproduction of all 2023 figures, or an implemented SDF mode.

## What was tested

`docs/TEST_REPORT.md` records actual tests, their scope, and important untested behavior. The CPU solver and real Chromium UI/worker were exercised. The WebGPU implementation is included and statically inspected, **but could not be executed in the restricted test environment**. Windows launcher and native save dialogs were not exercised on a Windows machine. The Python launcher's HTTP behavior was checked separately.

## Editing the app

Editable source is in `src/`. Run `python build.py` to rebuild the single HTML file after edits. Optional developer checks: `node tests/core_tests.js` and the Python/Playwright browser tests. Node and Playwright are **not required to use the app**.
