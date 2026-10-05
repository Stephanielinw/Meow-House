# Meeow House deployment check

From the repository, run `python3 tools/check_deployment_snapshot.py`.
Any FAIL means **do not deploy**. Files present locally but untracked are not
included in a Git deployment. The checker never stages or modifies them.

1. Review every reported runtime dependency and select its matching code/data
   deliberately. Do not use `git add .` or `git add -A`.
2. Inspect the exact staged files, then run
   `python3 tools/check_deployment_snapshot.py --index`.
3. Only after PASS, intentionally commit. Run
   `python3 tools/check_deployment_snapshot.py --ref HEAD` before pushing.
4. Pages runs the same commit check before uploading its artifact. Include this
   checker, its manifest and the workflow change in the controlled checkpoint.

Worktree PASS checks local consistency and tracking, not unstaged/index/commit
content. `--index` reads only staged blobs; `--ref` reads only that commit,
including its own manifest. Never borrow missing files from another snapshot.

The manifest classifies the entrypoint, direct startup scripts and dynamic
Renderer/pose dependencies. Producer/consumer contracts record startup globals;
update the manifest together with a deliberate startup dependency change.

This is a **static** gate: existence, snapshot membership, script references,
load order and syntax. Browser smoke is not implemented. CDN availability,
generated bank semantic compatibility and all runtime behavior remain unproven.
