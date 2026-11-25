"""JaCoCo Java source-line union and Git working-tree delta, using only the standard library."""
import os
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def changed_lines(root, base):
    files = {}
    # Use separate argv for paths so quoting, renames and spaces cannot corrupt line attribution.
    tracked = git(root, "diff", "--name-only", "-z", "--no-renames", "--diff-filter=AM", base, "--", "*.java")
    for raw in tracked.split(b"\0"):
        if not raw:
            continue
        name = os.fsdecode(raw).replace("\\", "/")
        diff = git(root, "diff", "--no-ext-diff", "--no-renames", "-U0", base, "--", name)
        ranges = re.findall(rb"(?m)^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", diff)
        files[name] = {line for start, count in ranges for line in
                       range(int(start), int(start) + int(count or b"1"))}
    for raw in git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", "*.java").split(b"\0"):
        if raw:
            path = root / os.fsdecode(raw)
            files[path.relative_to(root).as_posix()] = set(range(1, len(path.read_bytes().splitlines()) + 1))
    return files


def jacoco(root, xml, source_roots):
    result = {}
    tree = ET.parse(xml)
    if tree.getroot().tag != "report":
        raise ValueError(f"Expected JaCoCo report: {xml}")
    for package in tree.iter("package"):
        for source in package.findall("sourcefile"):
            relative = Path(package.attrib["name"]) / source.attrib["name"]
            matches = [root / folder / relative for folder in source_roots if (root / folder / relative).is_file()]
            if len(matches) != 1:
                raise ValueError(f"Expected exactly one source for {relative} in {source_roots}")
            name = matches[0].resolve().relative_to(root).as_posix()
            for row in source.findall("line"):
                result[name, int(row.attrib["nr"])] = int(row.attrib["ci"]) > 0
    if not result:
        raise ValueError(f"No executable Java source lines in {xml}")
    return result


def merge(target, lines):
    for key, hit in lines.items():
        target[key] = target.get(key, False) or hit


def metric(lines):
    return {"covered": sum(lines.values()), "total": len(lines),
            "percent": round(100 * sum(lines.values()) / len(lines), 2) if lines else None}


def metrics(ut, component, delta, unit_available, component_available):
    all_lines = dict(ut)
    merge(all_lines, component)
    def changed(lines):
        return {key: hit for key, hit in lines.items() if key[1] in delta.get(key[0], ())}
    # An executable line present only in the component report is uncovered by UT.
    ut_lines = {key: ut.get(key, False) for key in all_lines}
    combined_available = unit_available and component_available
    return {"combined": metric(all_lines) if combined_available else None,
            "unit": metric(ut_lines) if unit_available else None,
            "changedUnit": metric(changed(ut_lines)) if unit_available and delta is not None else None,
            "changedCombined": metric(changed(all_lines)) if combined_available and delta is not None else None}
