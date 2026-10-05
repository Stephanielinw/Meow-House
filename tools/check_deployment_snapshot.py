#!/usr/bin/env python3
"""Check startup dependency closure in a worktree, index, or commit; never stage files."""
import argparse
import json
import re
import shutil
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from urllib.parse import unquote, urlsplit

MANIFEST = "tools/deployment/runtime-critical-files.json"
CHECKER = "tools/check_deployment_snapshot.py"


def git(root, *args):
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=True).stdout


def local_path(reference):
    """Return a repo-relative URL path; remote HTTP(S) scripts are outside this gate."""
    url = urlsplit(reference.strip())
    if url.scheme in ("http", "https") or (url.netloc and not url.scheme):
        return None
    if url.scheme or url.netloc:
        raise ValueError(f"unsupported startup reference: {reference}")
    value = unquote(url.path)
    if not value or value.startswith("/") or "\\" in value or "\0" in value:
        raise ValueError(f"invalid startup path: {reference!r}")
    parts = PurePosixPath(value).parts
    if ".." in parts:
        raise ValueError(f"startup path escapes its directory: {reference}")
    return str(PurePosixPath(*parts))


class Scripts(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.scripts = []
        self.current = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.current = {"attrs": dict(attrs), "code": "", "line": self.getpos()[0]}
            self.scripts.append(self.current)

    def handle_data(self, data):
        if self.current is not None:
            self.current["code"] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.current = None


class Snapshot:
    def __init__(self, root, *, index=False, ref=None):
        self.root = root
        self.mode = "index" if index else "commit" if ref else "worktree"
        self.label = "Git index" if index else f"commit {ref}" if ref else "working tree"
        self.entries = {}
        if ref:
            commit = git(root, "rev-parse", "--verify", "--end-of-options", ref + "^{commit}").decode().strip()
            rows = git(root, "ls-tree", "-r", "-z", commit).split(b"\0")
            for row in filter(None, rows):
                header, path = row.split(b"\t", 1)
                mode, kind, oid = header.decode().split()
                if kind == "blob":
                    self.entries[path.decode()] = (mode, oid)
        else:
            for row in filter(None, git(root, "ls-files", "--stage", "-z").split(b"\0")):
                header, path = row.split(b"\t", 1)
                mode, oid, stage = header.decode().split()
                self.entries[path.decode()] = (mode if stage == "0" else "unmerged", oid)

    def read(self, path):
        if self.mode == "worktree":
            file = self.root / path
            if file.is_symlink() or not file.is_file():
                return None
            if not file.resolve().is_relative_to(self.root.resolve()):
                return None
            return file.read_bytes()
        entry = self.entries.get(path)
        if not entry or entry[0] not in ("100644", "100755"):
            return None
        return git(self.root, "cat-file", "blob", entry[1])


def check(snapshot):
    errors, warnings, contents = [], [], {}

    def require(path, role):
        raw = snapshot.read(path)
        if raw is None:
            errors.append(f"{role} missing or not a regular file in {snapshot.label}: {path}")
            return None
        if snapshot.mode == "worktree" and path not in snapshot.entries:
            errors.append(f"{role} is untracked by Git: {path}")
        elif snapshot.mode == "worktree" and snapshot.entries[path][0] not in ("100644", "100755"):
            errors.append(f"{role} has an unresolved or unsupported Git entry: {path}")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            errors.append(f"{role} is not UTF-8: {path}")
            return None
        contents[path] = text
        return text

    require(CHECKER, "deployment tooling")
    manifest_text = require(MANIFEST, "deployment tooling")
    if manifest_text is None:
        return errors, warnings, 0
    try:
        manifest = json.loads(manifest_text)
        if manifest["version"] != 1:
            raise ValueError("unsupported manifest version")
        entrypoint = manifest["entrypoint"]
        startup = manifest["startupScripts"]
        dynamic = manifest["dynamicScripts"]
        contracts = manifest["loadOrder"]
        external = manifest["externalGlobals"]
        if not (isinstance(startup, list) and isinstance(dynamic, dict) and isinstance(contracts, list)):
            raise ValueError("invalid dependency categories")
        if set(dynamic) != {"renderer", "sitting", "standing", "crouching", "lying"}:
            raise ValueError("invalid Renderer dependency categories")
        if not isinstance(external, dict) or not all(isinstance(k, str) and isinstance(v, str) and urlsplit(v).scheme in ("https", "http") for k, v in external.items()):
            raise ValueError("invalid external producer")
        paths = [entrypoint, *startup, *dynamic.values()]
        if len(paths) != len(set(paths)) or not all(isinstance(p, str) and local_path(p) == p for p in paths):
            raise ValueError("invalid or duplicate manifest paths")
        for contract in contracts:
            if not (contract["producer"] in startup and isinstance(contract["provides"], str) and
                    isinstance(contract["consumers"], list) and contract["consumers"] and all(p in startup for p in contract["consumers"])):
                raise ValueError("invalid producer/consumer contract")
    except (KeyError, TypeError, ValueError):
        errors.append("invalid runtime-critical manifest; check paths, categories and load-order contracts")
        return errors, warnings, 0
    for path in paths:
        require(path, "runtime-critical file")
    html = contents.get(entrypoint)
    if html is not None:
        scripts = Scripts(html).scripts
        positions = {}
        for number, script in enumerate(scripts):
            attrs = script["attrs"]
            if "src" not in attrs:
                continue
            try:
                path = local_path(attrs["src"] or "")
            except ValueError as exc:
                errors.append(str(exc))
                continue
            if path is None:
                continue
            if path in positions:
                errors.append(f"duplicate startup script: {path}")
            positions[path] = number
            if path not in startup:
                errors.append(f"startup reference absent from manifest: {path}")
                require(path, "startup reference")
            if "async" in attrs or "defer" in attrs or attrs.get("type", "").strip().lower() not in ("", "text/javascript", "application/javascript"):
                errors.append(f"startup global script must load synchronously as classic JS: {path}")
        for path in startup:
            if path not in positions:
                errors.append(f"manifest startup script is not loaded by {entrypoint}: {path}")
        for contract in contracts:
            producer = contract["producer"]
            for consumer in contract["consumers"]:
                if producer in positions and consumer in positions and positions[producer] >= positions[consumer]:
                    errors.append(f"load order: {producer} provides {contract['provides']} and must precede {consumer}")
        modules = [i for i, script in enumerate(scripts) if "src" not in script["attrs"] and script["attrs"].get("type", "").strip().lower() == "module"]
        if not modules:
            errors.append("startup inline module is missing")
        elif any(position > min(modules) for position in positions.values()):
            errors.append("startup inline module must follow every required global producer")
        for name, reference in external.items():
            producers = [(i, s) for i, s in enumerate(scripts) if s["attrs"].get("src") == reference]
            if len(producers) != 1 or not modules or producers[0][0] >= min(modules):
                errors.append(f"external global producer {name} must occur once before startup: {reference}")
            elif "async" in producers[0][1]["attrs"] or "defer" in producers[0][1]["attrs"] or producers[0][1]["attrs"].get("type", "") not in ("", "text/javascript", "application/javascript"):
                errors.append(f"external global producer must load synchronously: {name}")
        # Only the existing Renderer loader's literals and pose table are inspected.
        calls = re.findall(r"loadCatVisualScript\(\s*['\"]([^'\"]+)['\"]\s*\)", html)
        table = re.search(r"const\s+CAT_VISUAL_POSE_SCRIPTS\s*=\s*Object\.freeze\(\s*\{([^}]+)\}", html)
        pose_refs = dict(re.findall(r"([A-Za-z_$][\w$]*)\s*:\s*['\"]([^'\"]+)['\"]", table.group(1))) if table else {}
        try:
            found = {local_path(value) for value in [*calls, *pose_refs.values()]}
            if found != set(dynamic.values()) or set(pose_refs) != {key for key in dynamic if key not in ("renderer", "sitting")}:
                errors.append("Renderer dynamic startup references do not match the manifest")
            if [local_path(value) for value in calls] != [dynamic["renderer"], dynamic["sitting"]]:
                errors.append("Renderer loader must load its declared runtime then Sitting bank")
            for pose, reference in pose_refs.items():
                if local_path(reference) != dynamic.get(pose):
                    errors.append(f"Renderer pose dependency mismatch: {pose}")
        except ValueError as exc:
            errors.append(str(exc))
        node = shutil.which("node")
        if not node:
            errors.append("Node is required for startup syntax checks; no packages need installing")
        else:
            with TemporaryDirectory(prefix="meeow-deploy-syntax-") as directory:
                targets = [(p, contents[p], ".js") for p in paths if p.endswith(".js") and p in contents]
                targets += [(f"{entrypoint}:script@{s['line']}", s["code"], ".mjs" if s["attrs"].get("type", "").strip().lower() == "module" else ".js")
                            for s in scripts if "src" not in s["attrs"] and s["attrs"].get("type", "").strip().lower() in ("", "module", "text/javascript", "application/javascript")]
                for number, (label, text, extension) in enumerate(targets):
                    file = Path(directory) / (str(number) + extension)
                    file.write_text(text, encoding="utf-8")
                    result = subprocess.run([node, "--check", str(file)], capture_output=True, text=True, timeout=10)
                    if result.returncode:
                        detail = next((line.strip() for line in result.stderr.splitlines() if "SyntaxError" in line), "invalid JavaScript")
                        errors.append(f"startup syntax failed: {label}: {detail}")
    if snapshot.mode == "worktree":
        changed = set(git(snapshot.root, "diff", "--name-only", "-z").decode().split("\0"))
        for path in sorted(changed.intersection([*paths, CHECKER, MANIFEST])):
            warnings.append(f"unstaged change: {path}; worktree validation does not validate its index/commit version")
    return list(dict.fromkeys(errors)), warnings, len(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--index", action="store_true", help="validate only staged Git content")
    group.add_argument("--ref", help="validate only this commit, including its own manifest")
    args = parser.parse_args()
    try:
        root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").decode().strip())
        snapshot = Snapshot(root, index=args.index, ref=args.ref)
        errors, warnings, count = check(snapshot)
        print(f"Deployment check — {snapshot.label}; runtime-critical files: {count}")
        for warning in warnings:
            print("WARN — " + warning)
        for error in errors:
            print("FAIL — " + error)
        if errors:
            print("FAIL — do NOT deploy this startup snapshot; no files were staged or changed.")
        else:
            print("PASS — startup snapshot is self-consistent under the static deployment checks.")
            if snapshot.mode == "worktree":
                print("Before committing use --index; before deployment use --ref HEAD.")
        print("Browser startup smoke NOT IMPLEMENTED; external CDN availability and runtime semantics are not proven.")
        return 1 if errors else 0
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        message = "Git snapshot could not be read; verify repository, revision and unresolved conflicts" if isinstance(exc, subprocess.CalledProcessError) else str(exc)
        print("FAIL — " + message)
        return 1


if __name__ == "__main__":
    sys.exit(main())
