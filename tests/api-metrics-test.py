"""Fast regression checks for the evidence reader (no JVM, network, or SDD init)."""
import base64
from pathlib import Path
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/isdd-api-test/scripts"))
from api_test import junit_results, observations
from coverage import jacoco, metrics


class EvidenceTests(unittest.TestCase):
    def test_ut_union_and_change_denominators(self):
        ut = {("src/X.java", 2): True, ("src/X.java", 3): False}
        it = {("src/X.java", 2): True, ("src/X.java", 3): True, ("src/Y.java", 5): True}
        result = metrics(ut, it, {"src/Y.java": {5}}, True, True)
        self.assertEqual((3, 3), (result["combined"]["covered"], result["combined"]["total"]))
        self.assertEqual(result["changedUnit"]["percent"], 0)
        self.assertEqual(result["changedCombined"]["percent"], 100)
        self.assertIsNone(metrics(ut, {}, {}, True, False)["combined"])
        self.assertIsNone(metrics(ut, it, {}, True, True)["changedUnit"]["percent"])

    def test_empty_or_ambiguous_jacoco_is_not_coverage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            xml = root / "report.xml"
            xml.write_text("<report/>")
            with self.assertRaisesRegex(ValueError, "No executable"):
                jacoco(root, xml, ["."])
            for folder in ("one", "two"):
                (root / folder).mkdir()
                (root / folder / "X.java").touch()
            xml.write_text('<report><package name=""><sourcefile name="X.java"><line nr="1" ci="1"/></sourcefile></package></report>')
            with self.assertRaisesRegex(ValueError, "exactly one"):
                jacoco(root, xml, ["one", "two"])

    def test_ignored_test_failures_and_stale_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            file = root / "junit.xml"
            suite = {"id": "a", "junit": ["*.xml"]}
            for content in ("<skipped/>", "<failure/>", "<error/>"):
                file.write_text(f"<testsuite><testcase>{content}</testcase></testsuite>")
                with self.assertRaises(ValueError):
                    junit_results(root, suite, 0)
            file.write_text("<testsuite><testcase/></testsuite>")
            self.assertEqual(junit_results(root, suite, 0), 1)
            with self.assertRaisesRegex(ValueError, "Stale"):
                junit_results(root, suite, file.stat().st_mtime_ns + 1)

    def test_route_inventory_and_observations(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            def event(*fields):
                return "\t".join(base64.urlsafe_b64encode(s.encode()).decode() for s in fields)
            rows = [event("inventory"), event("profile", "isolated"), event("route", "GET /x"),
                    event("hit", "GET /x"), event("scenario", "GET /x", "read", "junit-id")]
            path = root / "one.events"
            path.write_text("\n".join(rows))
            routes, cases, hits, profiles = observations(root)
            self.assertEqual((routes, hits, profiles), ({"GET /x"}, {"GET /x"}, {"isolated"}))
            self.assertEqual(cases["GET /x", "read"], {"junit-id"})
            path.write_text("\n".join(rows + [event("inventory")]))
            with self.assertRaisesRegex(ValueError, "one successful"):
                observations(root)


if __name__ == "__main__":
    unittest.main()
