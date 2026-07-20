#!/usr/bin/env python3
import json
import sys

import yaml


def _rule_sort_key(rule):
    rule_id = rule.get("id") if isinstance(rule, dict) else None
    body = json.dumps(rule, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return (str(rule_id), body)


def canonicalize(path):
    with open(path, "rb") as handle:
        document = yaml.safe_load(handle)
    if not isinstance(document, dict):
        raise ValueError("ruleset root must be a mapping")
    rules = document.get("rules")
    if not isinstance(rules, list) or not rules:
        raise ValueError("ruleset must contain a non-empty 'rules' list")
    canonical = {key: value for key, value in document.items() if key != "rules"}
    canonical["rules"] = sorted(rules, key=_rule_sort_key)
    return json.dumps(canonical, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def main(argv):
    if len(argv) != 2:
        sys.stderr.write("usage: canonicalize.py <ruleset.yml>\n")
        return 2
    try:
        payload = canonicalize(argv[1])
    except FileNotFoundError:
        sys.stderr.write("canonicalize: ruleset file not found: %s\n" % argv[1])
        return 2
    except (yaml.YAMLError, ValueError, TypeError) as error:
        sys.stderr.write("canonicalize: invalid ruleset: %s\n" % error)
        return 2
    sys.stdout.buffer.write(payload.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
