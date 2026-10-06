# Publish Aggregation Explorer on GitHub Pages

Prepared October 6, 2026. Status: upload package prepared; no repository or live site created by this package.

## 1. Create the repository

Sign in as **vwadesigns**, then open:

https://github.com/new?owner=vwadesigns&name=aggregation-explorer&visibility=public

Use owner `vwadesigns`, name `aggregation-explorer`, and Public visibility. Suggested description: `Interactive seeded aggregation explorer with timeline playback and black-and-white PNG export.` Leave initialization with README, .gitignore, and license disabled: files are supplied here, and no new software license is being selected. Do not select a template or ask a coding agent to generate replacement app code. Click **Create repository**.

A public repository makes its uploaded source and documentation public as well as the site. Only upload this app package, not unrelated personal or project files. Public repositories qualify for Pages on GitHub Free.

## 2. Upload the prepared files

Extract the ZIP and open the inner `aggregation-explorer` folder. Upload **its contents**, not the ZIP and not an additional outer folder. For a new empty repository, use its upload-existing-file link. If it already has a file list, use **Add file → Upload files**. Drag the files and the `src`, `docs`, and `tests` folders into the upload area, wait for them to finish, then commit directly to the initial branch.

Use commit message: `Publish working Aggregation Explorer 0.1 baseline`.

At the repository's top level, `index.html` must appear next to `README.md`. Keep `.nojekyll` there too. This file is empty by design. If a browser skips it during upload, use Add file → Create new file, name it `.nojekyll`, enter a short comment such as `Static site; no Jekyll build.`, and commit it. The marker only needs to exist.

GitHub accepts up to 100 files in one browser upload; this package is below that count. Every supplied file is also below the browser's 25 MiB per-file limit.

## 3. Enable Pages

Open **Settings → Pages**. Under Build and deployment set:

- Source: **Deploy from a branch**
- Branch: **main** (or the actual branch containing the uploaded files if your account chose another name)
- Folder: **/(root)**, not `/docs`

Click **Save**. No custom workflow or theme is required for this prepared static page. Leave Custom domain empty.

GitHub's normal publication process runs after this. The Pages settings show the site address and deployment status; the Actions tab shows the deployment run. GitHub documents that publication can take up to 10 minutes.

With the owner and repository name above and no custom domain, the expected address is:

https://vwadesigns.github.io/aggregation-explorer/

Use the actual address GitHub reports if it differs. An expected address is not proof that the site is live.

## 4. Check the public page

Open **Visit site** from Pages settings in a private/incognito browser window. Confirm that the app appears, Play evolves the patches, backward seeking works, and PNG export works. A visitor does not need GitHub, Python, Codex, ChatGPT, or World Machine to use the already-built page. The simulation runs client-side. WebGPU availability varies by browser and hardware; Automatic mode has a CPU fallback.

The app has no analytics or network simulation service. Hosting still involves ordinary requests to GitHub Pages, and following a research-credit link navigates to that external site. Do not equate client-side processing with an absence of hosting-provider request logs.

## Preserve the working baseline

`index.html` and `Aggregation_Explorer.html` initially have SHA-256:

`6f115103270c3f8db267e418bf54e91058d203d28ffd9197cbd47ab8a4bc8c6f`

The editable app source, original build script, launcher, and original test assets are unchanged. The README has an added hosting section. `docs/ORIGINAL_PACKAGE_MANIFEST.json` preserves the delivered baseline manifest; the root manifest describes this hosting package.

Later changes should be intentional. To rebuild after editing `src/`, run `python build_site.py`, test locally, then upload/commit both HTML outputs. Pages is serving the committed build, not compiling JavaScript or running Python for you.

Keep the research attribution. The existing independently written implementation is included; the research authors' notebooks and OpenCL helper files are not. This publication package does not choose or grant a new software license.

## Official guidance checked for this setup

- Repository creation and prefilled form URLs: https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository
- Browser upload: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- Branch/folder publishing: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Entry point, `.nojekyll`, and publication status: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
