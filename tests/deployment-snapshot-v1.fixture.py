"""Focused deployment checker proof. Git blobs/index/commits exist only in temporary repos."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "tools/check_deployment_snapshot.py"
spec = importlib.util.spec_from_file_location("deploy_check", CHECKER)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


with TemporaryDirectory(prefix="meeow-deploy-fixture-") as directory:
    root = Path(directory)

    def git(*args, data=None):
        env = {**os.environ, "GIT_AUTHOR_NAME": "Fixture", "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
               "GIT_COMMITTER_NAME": "Fixture", "GIT_COMMITTER_EMAIL": "fixture@example.invalid"}
        return subprocess.run(["git", "-C", str(root), *args], input=data, env=env,
                              capture_output=True, check=True).stdout.decode().strip()

    def write(path, text):
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def stage(path):
        # No git add/commit/reset: only temporary fixture blobs and its isolated index.
        oid = git("hash-object", "-w", "--stdin", data=(root / path).read_bytes())
        git("update-index", "--add", "--cacheinfo", "100644," + oid + "," + path)

    def commit():
        return git("commit-tree", git("write-tree"), data=b"isolated static fixture\n")

    git("init", "--quiet")
    dynamic = {name: "js/" + name + ".js" for name in ("renderer", "sitting", "standing", "crouching", "lying")}
    manifest = {"version": 1, "entrypoint": "index.html",
                "startupScripts": ["js/producer.js", "js/consumer.js"], "dynamicScripts": dynamic,
                "loadOrder": [{"producer": "js/producer.js", "provides": "Meeow.fixture",
                               "consumers": ["js/consumer.js"]}],
                "externalGlobals": {"Vue": "https://example.invalid/vue.js"}}
    html = '''<script src="https://example.invalid/vue.js"></script>
<script src="./js/producer.js?v=1#version"></script>
<script src="./js/consumer.js"></script>
<script type="module">
const CAT_VISUAL_POSE_SCRIPTS = Object.freeze({
 standing: './js/standing.js', crouching: './js/crouching.js', lying: './js/lying.js'
});
await loadCatVisualScript('./js/renderer.js');
await loadCatVisualScript('./js/sitting.js');
</script>'''
    write(gate.CHECKER, CHECKER.read_text())
    write(gate.MANIFEST, json.dumps(manifest))
    write("index.html", html)
    write("js/producer.js", "globalThis.Meeow = {fixture: true};")
    write("js/consumer.js", "const ready = globalThis.Meeow.fixture;")
    for path in dynamic.values():
        write(path, "const fixture = true;")
    for path in [gate.CHECKER, gate.MANIFEST, "index.html", *manifest["startupScripts"], *dynamic.values()]:
        stage(path)
    good = commit()

    def checked(mode="worktree", ref=None):
        return gate.check(gate.Snapshot(root, index=mode == "index", ref=ref))

    def fails(fragment, mode="worktree", ref=None):
        errors, _, _ = checked(mode, ref)
        assert any(fragment in error for error in errors), errors

    for mode, ref in [("worktree", None), ("index", None), ("commit", good)]:
        errors, _, count = checked(mode, ref)
        assert not errors, errors
        assert count == 8
    (root / "js/consumer.js").unlink()
    fails("missing or not a regular file")
    write("js/consumer.js", "const ready = globalThis.Meeow.fixture;")
    git("update-index", "--force-remove", "js/consumer.js")
    fails("untracked by Git: js/consumer.js")
    fails("missing or not a regular file in Git index", "index")
    missing = commit()
    fails("missing or not a regular file in commit", "commit", missing)
    stage("js/consumer.js")

    write("index.html", html.replace("producer.js?v=1#version", "typo.js"))
    fails("startup reference absent from manifest: js/typo.js")
    fails("missing or not a regular file")
    write("index.html", html.replace('<script src="./js/producer.js?v=1#version"></script>', '')
          .replace('</script>\n<script type="module">', '</script><script src="./js/producer.js"></script>\n<script type="module">', 1))
    fails("load order:")
    stage("index.html")
    bad_order = commit()
    write("index.html", html)  # Correct local HTML must not hide staged/committed wrong order.
    assert not checked()[0]
    assert checked()[1]
    fails("load order:", "index")
    fails("load order:", "commit", bad_order)
    assert not checked("commit", good)[0]
    stage("index.html")

    for altered, fragment in [
        (html.replace('./js/consumer.js', '../consumer.js'), "escapes"),
        (html.replace('./js/consumer.js', '%2e%2e/consumer.js'), "escapes"),
        (html.replace('./js/consumer.js', ''), "invalid startup path"),
        (html.replace('./js/consumer.js', 'javascript:alert(1)'), "unsupported startup"),
        (html.replace('<script src="./js/consumer.js">', '<script async src="./js/consumer.js">'), "synchronously"),
        (html + '<script src="./js/consumer.js"></script>', "duplicate startup"),
        (html.replace('const CAT_VISUAL_POSE_SCRIPTS', 'const = CAT_VISUAL_POSE_SCRIPTS'), "startup syntax failed"),
        (html.replace('./js/lying.js', './js/wrong-bank.js'), "dynamic startup references"),
        (html.replace('https://example.invalid/vue.js', 'https://example.invalid/wrong-vue.js'), "external global producer Vue"),
    ]:
        write("index.html", altered)
        fails(fragment)
    write("index.html", html)
    write("js/consumer.js", "const = ;")
    fails("startup syntax failed: js/consumer.js")
    stage("js/consumer.js")
    bad_syntax = commit()
    write("js/consumer.js", "const ready = globalThis.Meeow.fixture;")
    fails("startup syntax failed", "index")
    fails("startup syntax failed", "commit", bad_syntax)
    stage("js/consumer.js")

    git("update-index", "--force-remove", gate.MANIFEST)
    fails("deployment tooling is untracked")
    fails("deployment tooling missing", "index")
    absent_manifest = commit()
    fails("deployment tooling missing", "commit", absent_manifest)
    stage(gate.MANIFEST)
    write(gate.MANIFEST, "{broken")
    fails("invalid runtime-critical manifest")
    write(gate.MANIFEST, json.dumps({**manifest, "version": 2}))
    fails("invalid runtime-critical manifest")
    write(gate.MANIFEST, json.dumps(manifest))
    for args, expected in [((), 0), (("--index",), 0), (("--ref", good), 0), (("--ref", absent_manifest), 1)]:
        result = subprocess.run([sys.executable, str(CHECKER), *args], cwd=root, capture_output=True, text=True)
        assert result.returncode == expected, result.stdout + result.stderr
        assert "Traceback" not in result.stdout + result.stderr

workflow = (ROOT / ".github/workflows/static.yml").read_text()
assert workflow.index("actions/checkout@") < workflow.index("python3 tools/check_deployment_snapshot.py --ref HEAD") < workflow.index("actions/upload-pages-artifact@")
assert "continue-on-error" not in workflow
assert 'branches: ["main"]' in workflow and "path: '.'" in workflow
print("PASS — deployment gate: good/missing/untracked/path/order/syntax/dynamic/global checks, index/commit isolation and Pages pre-upload enforcement")
