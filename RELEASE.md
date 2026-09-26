# Paid Zhongyao V1 release lock

`index.html` in this repository is the canonical V1 production artifact.
V1 uses reviewed direct artifact edits. Do not regenerate it from legacy scripts.
The three-subject repositories and external JSON files are references, not production sources.

Approved local artifact baseline: `6fc8d57ba40a32b4183a29320d782a9aafc0619f`.
SHA-256: `f390f67beba79d2c94efd45ee7b969de7a1a2d9ea478314f894615291d643be4`.
This is a local release candidate, not a claim of deployment or completed production verification.

The baseline includes:
- 374 unique herbs and 46 categories.
- Seven approved corrections: 沙棘, 西洋参, 桑寄生, 何首乌, 荆芥, 半夏, 天南星; disputed mnemonics for the first two are cleared.
- Server-approved first activation; no offline/hash fallback. Previously server-approved browsers may reopen locally.
- Phase 3 empty-pool, keyboard-focus, stored-progress recovery, and reverse-prompt refresh fixes.
- Production API: `https://zhongyao-license-backend.vercel.app`.

## Legacy overwrite paths

Paths below are relative to the parent workspace, not this repository:

1. `work/build_license_demo.py` directly overwrites `work/license-demo/index.html` from `outputs/zhongyao_random_review_full.html`. It still embeds activation hashes and offline fallback; omitting `LICENSE_API_URL` selects static activation.
2. `work/build_review_app.py` regenerates that upstream full HTML (and the trial output). It reads the first existing file in this order: `herbs_docx_verified.json`, `herbs_formal_kuaikuaiji.json`, `herbs_formal.json`, `herbs_clean.json`, `herbs.json`, all under `work/`.
3. Upstream data writers: `work/extract_effects_from_docx.py`, `work/update_mnemonics_from_kuaikuaiji.py`, `work/extract_formal_effects.py`, `work/fix_herbs.py`, and `work/extract_herbs.py`. These do not directly write the paid HTML, but can change inputs used by the two generators above.

Do not use these legacy pipelines for production V1 until they are brought into parity and revalidated. No generator was changed for this release lock. The three-subject builder writes separate sites and must not be used as a replacement for this artifact.

## Local release checks

From this repository:

```sh
python3 verify_release.py
node --test ../activation-phase2.test.mjs ../review-phase3.test.mjs
git diff --check
```

The regression files remain local workspace evidence, outside this repository. A standalone clone must obtain them before claiming those tests passed. The Python check uses only the standard library, is read-only, and exits nonzero on failure. It checks the explicit content/activation invariants and the exact approved artifact checksum. The checksum also detects stale interaction code; it is not a security signature or proof of runtime correctness.

For an approved future direct edit, inspect the HTML diff, rerun content checks and both regression suites, then deliberately update the checksum and baseline record after review. Never update the checksum simply to make an unexplained failure pass. Keep a rollback checkpoint before publishing. Do not run a generator, push, or deploy as part of these checks.

Before release: verify actual Safari/WeChat interactions, live Supabase activation/device limits and deployed configuration, and confirm the backend candidate revision. These local checks do not validate live infrastructure.
