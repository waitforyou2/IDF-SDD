"""Run from the standalone skill directory or from xingyun-sdd. Python 3.9+."""
import argparse
import base64
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from xml.etree.ElementTree import ParseError

sys.dont_write_bytecode = True
from coverage import changed_lines, git, jacoco, merge, metrics

CONFIG = "config/isdd/api-tests.json"
OUT = ".isdd-api"
SKILL = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def inside(root, name):
    path = (root / name).resolve()
    path.relative_to(root)
    return path


def identity(root, change):
    digest = hashlib.sha256()
    listed = git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
    for raw in sorted(set(listed.split(b"\0"))):
        if not raw:
            continue
        name = os.fsdecode(raw)
        if name.startswith((OUT + "/", "docs/isdd/", ".codegraph/")):
            continue
        path = root / name
        digest.update(raw + b"\0")
        if path.is_symlink():
            value = os.fsencode(os.readlink(path))
        elif path.is_file():
            value = hashlib.sha256(path.read_bytes()).digest()
        elif not path.exists():
            value = b"deleted"
        else:
            raise ValueError(f"Nested module needs its own input identity: {name}")
        digest.update(value + b"\0")
    archive = root / "docs/isdd/changes" / change
    for name in ("spec.md", "plan.md"):
        path = archive / name
        if path.is_file():
            content = path.read_text(encoding="utf-8-sig")
            if name == "spec.md":
                content = re.sub(r"\A---\n.*?\n---\n", "", content, count=1, flags=re.S)
            digest.update(name.encode() + b"\0" + content.strip().encode())
    return digest.hexdigest()


def tool_identity():
    digest = hashlib.sha256()
    for name in ("scripts/api_test.py", "scripts/coverage.py", "assets/ApiEvidence.java"):
        digest.update((SKILL / name).read_bytes())
    return digest.hexdigest()


def config(root):
    cfg = read(root / CONFIG)
    require(cfg.get("version") == 1, "Unsupported api-tests.json version")
    suites = cfg["suites"]
    require(isinstance(suites, list) and suites, "Declare every REST module/profile in suites")
    ids = [s["id"] for s in suites]
    require(len(set(ids)) == len(ids) and all(re.fullmatch(r"[\w.-]+", i) and i not in (".", "..") for i in ids),
            "Invalid or duplicate suite id")
    for s in suites:
        if s.get("unitXml") and s.get("componentXml"):
            require(inside(root, s["unitXml"]) != inside(root, s["componentXml"]), "UT and component XML must be distinct")
        require(isinstance(s["command"], list) and s["command"] and all(isinstance(a, str) and a for a in s["command"]),
                "command must be a nonempty argv array")
        inside(root, s.get("cwd", "."))
        for folder in s["sources"]:
            require(inside(root, folder).is_dir(), f"Missing Java source root {folder}")
        require(s["sources"], "Missing Java source roots")
    threshold = cfg.get("minimumChangedUnit")
    require(threshold is None or (isinstance(threshold, (float, int)) and 0 <= threshold <= 100), "Invalid UT threshold")
    return cfg


def plan_path(root, change):
    return root / "config/isdd/api-plans" / (change + ".json")


def get_plan(root, change):
    if change == "standalone" and not plan_path(root, change).exists():
        return {"mode": "full", "scenarios": []}
    plan = read(plan_path(root, change))
    require(plan["mode"] in ("change", "batch", "full"), "Invalid plan mode")
    items = plan["scenarios"]
    require(isinstance(items, list), "scenarios must be an array")
    for row in items:
        require(all(isinstance(row.get(k), str) and row[k].strip() for k in ("suite", "operation", "id", "expected")),
                "Every scenario needs suite, operation, id and a business expectation")
    require(len({(r["suite"], r["operation"], r["id"]) for r in items}) == len(items), "Duplicate scenario")
    if plan["mode"] == "change" or change != "standalone":
        reason = plan.get("noBehaviorChange", "")
        require(items or (isinstance(reason, str) and reason.strip()), "Missing acceptance scenarios or reviewed rationale")
    if plan["mode"] == "batch":
        require(items and isinstance(plan.get("baseline"), list), "Batch needs approved scenarios and audit baseline")
    return plan


def discover(root):
    cmd = ["git", "-C", str(root), "ls-files", "-co", "--exclude-standard", "-z", "--", "*.java", "pom.xml",
           "**/pom.xml", "*gradle", "*gradle.kts"]
    names = sorted({os.fsdecode(p) for p in subprocess.check_output(cmd).split(b"\0") if p})
    controllers = []
    for name in names:
        if name.endswith(".java") and "/src/main/" in "/" + name and (root / name).is_file():
            source = (root / name).read_text(encoding="utf-8-sig", errors="replace")
            if re.search(r"@(?:[\w.]+\.)?(?:RestController|Controller|RequestMapping)\b", source):
                controllers.append(name)
    return {"buildFiles": [n for n in names if not n.endswith(".java")], "controllerCandidates": controllers,
            "complete": False, "message": "源码线索；配置完整应用路由探针并执行 audit 后可得运行时清单。"}


def run_suite(root, suite, directory):
    directory.mkdir()
    cwd = inside(root, suite.get("cwd", "."))
    args = list(suite["command"])
    exe = shutil.which(args[0], path=str(cwd) + os.pathsep + os.environ.get("PATH", ""))
    if not exe and (cwd / args[0]).is_file():
        exe = str((cwd / args[0]).resolve())
    require(exe, f"Build command unavailable: {args[0]}")
    env = {**os.environ, "ISDD_API_EVENTS": str(directory)}
    start = time.time_ns()
    # Keep stdout available for JSON output, and preserve the build log on stderr.
    result = subprocess.run([exe, *args[1:]], cwd=cwd, env=env, stdout=sys.stderr)
    require(result.returncode == 0, f"{suite['id']}: build exited {result.returncode}")
    return start


def junit_results(root, suite, start):
    cwd = inside(root, suite.get("cwd", "."))
    patterns = suite.get("junit", ["target/surefire-reports/TEST-*.xml", "target/failsafe-reports/TEST-*.xml",
                                   "build/test-results/*/TEST-*.xml"])
    require(isinstance(patterns, list) and patterns, "junit must contain report globs relative to cwd")
    files = {f for pattern in patterns for f in cwd.glob(pattern)}
    require(files, f"{suite['id']}: missing JUnit XML execution reports")
    count = 0
    for file in files:
        file.resolve().relative_to(root)
        require(file.stat().st_mtime_ns >= start, f"Stale JUnit report: {file}")
        tree = ET.parse(file)
        tests = list(tree.iter("testcase"))
        for case in tests:
            require(case.find("failure") is None and case.find("error") is None,
                    f"JUnit reports a failed case: {case.get('classname')}.{case.get('name')}")
            if case.find("skipped") is None:
                count += 1
    require(count, f"{suite['id']}: no executed JUnit tests")
    return count


def observations(directory):
    routes, tests = set(), {}
    hits, profiles = set(), set()
    inventories = 0
    for file in directory.glob("*.events"):
        for line in file.read_text(encoding="utf-8").splitlines():
            row = [base64.urlsafe_b64decode(v + "=" * (-len(v) % 4)).decode() for v in line.split("\t")]
            if row == ["inventory"]:
                inventories += 1
            elif row[0] == "profile" and len(row) == 2:
                profiles.add(row[1])
            elif row[0] == "route" and len(row) == 2:
                routes.add(row[1])
            elif row[0] == "hit" and len(row) == 2:
                hits.add(row[1])
            elif row[0] == "scenario" and len(row) == 4:
                tests.setdefault((row[1], row[2]), set()).add(row[3])
            else:
                raise ValueError(f"Malformed evidence in {file.name}")
    require(inventories == 1 and routes, "Expected one successful, nonempty full-context inventory per module/profile")
    require(all(op in routes for op, _ in tests), "Observed operation absent from inventory")
    return routes, tests, hits, profiles


def summary(root, cfg, plan, directory, base):
    covered, missing, issues, cases = set(), set(), [], {}
    unit, component, rows, executions = {}, {}, [], {}
    available = {"unitXml": True, "componentXml": True}
    source_roots = {inside(root, f) for s in cfg["suites"] for f in s["sources"]}
    for candidate in discover(root)["controllerCandidates"]:
        require(any(folder in (root / candidate).parents for folder in source_roots),
                f"Undeclared Java source root containing potential MVC operations: {candidate}")
    for suite in cfg["suites"]:
        suite_id = suite["id"]
        events = directory / suite_id
        start = run_suite(root, suite, events)
        executions[suite_id] = junit_results(root, suite, start)
        routes, tests, hits, profiles = observations(events)
        if "profiles" in suite:
            require(set(suite["profiles"]) == profiles, f"{suite_id}: unexpected active profiles {sorted(profiles)}")
        require(set(suite.get("expectedOperations", [])) <= routes,
                f"{suite_id}: published operations absent from full application inventory")
        exclusions = suite.get("exclude", {})
        require(isinstance(exclusions, dict) and all(isinstance(v, str) and v.strip() for v in exclusions.values()),
                "Each exact exclusion needs a reason")
        require(set(exclusions) <= routes, f"{suite_id}: stale exclusions")
        for op in sorted(routes - exclusions.keys()):
            evidence = {i: sorted(names) for (operation, i), names in tests.items() if operation == op}
            key = (suite_id, op)
            (covered if evidence else missing).add(key)
            for scenario_id, test_names in evidence.items():
                cases[suite_id, op, scenario_id] = test_names
            rows.append({"suite": suite_id, "operation": op, "tests": evidence,
                         "status": "covered" if evidence else ("hit-only" if op in hits else "no-evidence")})
        require(routes - exclusions.keys(), "Inventory has no business operations")
        for kind, target in (("unitXml", unit), ("componentXml", component)):
            xml = suite.get(kind)
            if not xml:
                available[kind] = False
                continue
            file = inside(root, xml)
            require(file.is_file() and file.stat().st_mtime_ns >= start, f"Missing or stale {kind}: {xml}")
            merge(target, jacoco(root, file, suite["sources"]))
    acceptance = []
    for row in plan["scenarios"]:
        names = cases.get((row["suite"], row["operation"], row["id"]), [])
        acceptance.append({**row, "passed": bool(names), "tests": names})
        if not names:
            issues.append("缺少通过的验收场景: " + row["id"] + " / " + row["operation"])
    if plan["mode"] != "batch" or cfg.get("enforceFull", True):
        issues.extend(f"漏测: {s} / {op}" for s, op in sorted(missing))
    else:
        for key in plan["baseline"]:
            if tuple(key) not in covered:
                issues.append("已覆盖操作发生回退: " + str(key))
    delta = changed_lines(root, base) if base else None
    if delta is not None and available["unitXml"]:
        production = [inside(root, folder) for s in cfg["suites"] for folder in s["sources"]]
        measured = {name for name, _ in unit.keys() | component.keys()}
        declarations = cfg.get("nonExecutableSources", {})
        require(isinstance(declarations, dict) and all(isinstance(v, str) and v.strip() for v in declarations.values()),
                "nonExecutableSources requires reviewed reasons for exact declaration-only source files")
        for name, lines in delta.items():
            if lines and any(folder in (root / name).parents for folder in production) and name not in measured and name not in declarations:
                issues.append(f"变更生产源码缺少 JaCoCo 行清单，无法判定增量覆盖: {name}")
    line_stats = metrics(unit, component, delta, available["unitXml"], available["componentXml"])
    threshold = cfg.get("minimumChangedUnit")
    if threshold is not None:
        value = line_stats["changedUnit"]
        if value is None:
            issues.append("缺少增量 UT 覆盖证据或 Git 基线")
        elif value["total"] and 100 * value["covered"] < threshold * value["total"]:
            issues.append(f"增量 UT 行覆盖率低于 {threshold}%")
    return {"covered": len(covered), "total": len(rows), "operations": rows, "executedTests": executions,
            "percent": round(len(covered) * 100 / len(rows), 2), "acceptance": acceptance,
            "excluded": {s["id"]: s.get("exclude", {}) for s in cfg["suites"]},
            "nonExecutableSources": cfg.get("nonExecutableSources", {}),
            "lines": line_stats, "issues": issues, "passed": not issues}


@contextlib.contextmanager
def build_lock(root):
    # Locks are process owned and released by the OS even after an interrupted build.
    lockfile = root / OUT / "build.lock"
    lockfile.parent.mkdir(exist_ok=True)
    with lockfile.open("a+b") as lock:
        if os.name == "nt":
            import msvcrt
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def execute(root, change, action, base):
    with build_lock(root):
        run_id = uuid.uuid4().hex
        directory = root / OUT / "runs" / run_id
        directory.mkdir(parents=True)
        pointer = root / OUT / change / "latest.json"
        write(pointer, {"run": run_id, "action": action})
        try:
            cfg = config(root)
            plan = get_plan(root, change) if action == "verify" else {"mode": "full", "scenarios": []}
            before = identity(root, change)
            tool = tool_identity()
            result = summary(root, cfg, plan, directory, base)
            require(identity(root, change) == before, "Build changed verification inputs; rerun against stable sources")
            require(tool_identity() == tool, "Verification tool changed during this run")
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, ParseError) as exc:
            write(directory / "report.json", {"run": run_id, "change": change, "action": action,
                  "base": base, "complete": False, "passed": False, "issues": [str(exc)]})
            raise
        result.update(run=run_id, change=change, action=action, complete=True, source=before, tool=tool, base=base)
        write(directory / "report.json", result)
        return result


def latest(root, change):
    meta = read(root / OUT / change / "latest.json")
    require(re.fullmatch("[a-f0-9]{32}", meta["run"]), "Invalid run id")
    result = read(root / OUT / "runs" / meta["run"] / "report.json")
    require(result["run"] == meta["run"] and result["change"] == change and result["action"] == meta["action"],
            "Report belongs to another execution")
    return result


def check(root, change, base, minimum=None):
    result = latest(root, change)
    require(result["passed"] and result["action"] == "verify", "Latest execution did not pass verify")
    require(result["source"] == identity(root, change) and result["tool"] == tool_identity() and result["base"] == base,
            "Evidence is stale for current sources, plan, tool or base")
    if minimum is not None:
        lines = result["lines"]["changedUnit"]
        require(lines is not None and lines["covered"] * 100 >= lines["total"] * minimum,
                f"Missing incremental UT evidence or UT coverage below {minimum}%")
    return {k: result[k] for k in ("run", "covered", "total", "source", "base", "lines")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["discover", "audit", "plan-check", "verify", "report", "check", "install-probe"])
    parser.add_argument("--root", default=".")
    parser.add_argument("--change", default="standalone")
    parser.add_argument("--base", help="Git ref for incremental Java line coverage")
    parser.add_argument("--minimum-changed-unit", type=float, help="Additional check-time policy for SDD")
    parser.add_argument("--test-source", default="src/test/java")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    require(re.fullmatch(r"[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,127}", args.change) and ".." not in args.change,
            "Invalid change id")
    if args.action == "install-probe":
        resource = "ApiEvidence.java"
        target = inside(root, Path(args.test_source) / "isdd/apitest" / resource)
        data = (SKILL / "assets" / resource).read_bytes()
        require(not target.exists() or target.read_bytes() == data, f"Existing Java resource differs: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {"probe": str(target)}
    if args.action == "discover" or (args.action == "audit" and not (root / CONFIG).exists()):
        return discover(root)
    if args.action == "plan-check":
        require(plan_path(root, args.change).is_file(), "Missing change-specific API test plan")
        plan = get_plan(root, args.change)
        return {"mode": plan["mode"], "scenarioCount": len(plan["scenarios"])}
    base = None
    if args.base == "unborn":
        base = subprocess.check_output(["git", "-C", str(root), "hash-object", "-t", "tree", "--stdin"],
                                       input=b"").decode().strip()
    elif args.base:
        base = git(root, "rev-parse", "--verify", "--end-of-options", args.base + "^{commit}").decode().strip()
    if args.action == "check":
        return check(root, args.change, base, args.minimum_changed_unit)
    if args.action == "report":
        result = latest(root, args.change)
        result["currentInputs"] = result.get("source") == identity(root, args.change) and result.get("tool") == tool_identity()
        return result
    return execute(root, args.change, args.action, base)


if __name__ == "__main__":
    try:
        output = main()
        print(json.dumps(output, ensure_ascii=True, indent=2))
        sys.exit(1 if output.get("action") == "verify" and not output["passed"] else 0)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, ParseError) as exc:
        sys.exit(f"isdd-api-test: {exc}")
