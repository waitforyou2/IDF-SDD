"""Exercise the standalone Skill and SDD gates in a temporary JDK21/Maven Git project."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

PLUGIN = Path(__file__).resolve().parents[1]
FIXTURE = PLUGIN / "tests/fixtures/java-api"


def run(args, ok=True):
    result = subprocess.run(args, cwd=repo, env={**os.environ, "ISDD_PYTHON": sys.executable},
                            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240)
    if (result.returncode == 0) != ok:
        raise AssertionError(f"{args}\n{result.stdout[-2000:]}\n{result.stderr[-6000:]}")
    return result.stdout


def api(*args, ok=True):
    out = run([sys.executable, str(skill / "scripts/api_test.py"), *args, "--root", str(repo)], ok)
    return json.loads(out) if out.strip() else {}


def sdd(*args, ok=True):
    return run(["node", str(PLUGIN / "scripts/sdd.mjs"), *args, "--root", str(repo)], ok)


def verdict(status, ok=True):
    sdd("transition", "--id", "cancel", "--to", status, ok=ok)


with tempfile.TemporaryDirectory(prefix="isdd-api-smoke-") as work:
    repo = Path(work) / "service"
    skill = Path(work) / "standalone-skill"
    shutil.copytree(FIXTURE, repo, ignore=shutil.ignore_patterns("target", "build", ".gradle"))
    shutil.copytree(PLUGIN / "skills/isdd-api-test", skill)
    run(["git", "init", "-q"])
    api("install-probe")
    assert api("discover")["controllerCandidates"]
    run(["git", "add", "."])
    run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "base"])
    archive = repo / "docs/isdd"
    archive.mkdir(parents=True)
    (archive / "repository.yaml").write_text("workflow_version: 1.0.0")
    sdd("change", "create", "--id", "cancel", "--title", "验证订单", "--mode", "standard")
    change = archive / "changes/cancel"

    def fill(name):
        path = change / (name + ".md")
        doc = re.sub(r"<!--[\s\S]*?-->", "无告警。已核对业务断言与执行证据。", path.read_text(encoding="utf-8"))
        path.write_text(doc.replace("- [ ]", "- [x]").replace("Verdict: PENDING", "Verdict: PASS"), encoding="utf-8")

    fill("spec")
    verdict("DEFINED")
    sdd("artifact", "plan", "--id", "cancel")
    fill("plan")
    verdict("PLANNED")
    verdict("BUILT")
    sdd("artifact", "verification", "--id", "cancel")
    fill("verification")
    verdict("VERIFIED", ok=False)

    audit = api("audit", "--base", "HEAD")
    assert audit["covered"] == audit["total"] == 2
    assert audit["executedTests"]["orders"] >= 5
    print("PASS standalone full-service audit (2/2)", flush=True)

    plan = repo / "config/isdd/api-plans/cancel.json"
    initial = plan.read_text(encoding="utf-8")
    plan.write_text(initial.replace("reject-shipped", "unverified-rule"), encoding="utf-8")
    failed = api("verify", "--change", "cancel", "--base", "HEAD", ok=False)
    assert failed["covered"] == 2 and any("unverified-rule" in issue for issue in failed["issues"])
    verdict("VERIFIED", ok=False)
    plan.write_text(initial, encoding="utf-8")
    print("PASS 100% route coverage still rejects missing changed behavior", flush=True)

    passed = api("verify", "--change", "cancel", "--base", "HEAD")
    assert passed["covered"] == 2 and passed["passed"]
    assert passed["percent"] == 100 and passed["acceptance"][0]["tests"]
    assert passed["lines"]["unit"]["covered"] < passed["lines"]["combined"]["covered"]
    assert api("report", "--change", "cancel")["currentInputs"]
    verdict("VERIFIED")
    sdd("validate", "--id", "cancel")
    sdd("artifact", "delivery", "--id", "cancel")
    fill("delivery")
    sdd("transition", "--id", "cancel", "--to", "DONE", "--delivery-ref", "https://example.invalid/mr/1")
    print("PASS Maven UT+IT, distinct JaCoCo metrics and SDD delivery", flush=True)

    source = repo / "src/main/java/example/OrderApp.java"
    original = source.read_text(encoding="utf-8")
    source.write_text(original.replace('if ("SHIPPED".equals', 'if ("UNKNOWN".equals'), encoding="utf-8")
    verdict("VERIFIED", ok=False)
    api("verify", "--change", "cancel", "--base", "HEAD", ok=False)
    verdict("VERIFIED", ok=False)
    print("PASS changed fingerprint and actual business regression block MR repair", flush=True)

    source.write_text(original.replace('@GetMapping("/{id}")', '@GetMapping({"/{id}", "/alias/{id}"})'), encoding="utf-8")
    missing = api("verify", "--change", "cancel", "--base", "HEAD", ok=False)
    assert missing["total"] == 3 and missing["covered"] == 2
    settings = repo / "config/isdd/api-tests.json"
    saved_settings = settings.read_text(encoding="utf-8")
    cfg = json.loads(saved_settings)
    cfg["enforceFull"] = False
    settings.write_text(json.dumps(cfg), encoding="utf-8")
    batch = json.loads(initial)
    batch.update(mode="batch", baseline=[[row["suite"], row["operation"]] for row in audit["operations"]])
    plan.write_text(json.dumps(batch), encoding="utf-8")
    partial = api("verify", "--change", "cancel", "--base", "HEAD")
    assert partial["passed"] and (partial["covered"], partial["total"]) == (2, 3)
    print("PASS approved backfill batch preserves baseline and reports global 2/3", flush=True)
    settings.write_text(saved_settings, encoding="utf-8")
    plan.write_text(initial, encoding="utf-8")
    source.write_text(original, encoding="utf-8")
    api("verify", "--change", "cancel", "--base", "HEAD")
    verdict("VERIFIED")
    print("PASS missing route blocks and freshly verified MR repair passes", flush=True)
