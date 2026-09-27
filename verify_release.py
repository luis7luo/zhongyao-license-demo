"""Read-only, standard-library checks for the locked paid V1 artifact."""

import hashlib
import json
from pathlib import Path
import re
import sys

APPROVED_SHA256 = "176176e6313f3e0741a171508ee5309afa9d3efbf6d11b0bb718c925fb94f3bc"
API_URL = "https://api.beizhongyao.com"
CORRECTIONS = {
    "沙棘": "健脾消食、止咳祛痰、活血散瘀",
    "西洋参": "补气养阴、清热生津",
    "桑寄生": "祛风湿、补肝肾、强筋骨、安胎",
    "何首乌": "制何首乌：补肝肾、益精血、乌须发、强筋骨、化浊降脂；生何首乌：解毒消痈、截疟、润肠通便",
    "荆芥": "解表散风、透疹消疮；炒炭收敛止血",
    "半夏": "燥湿化痰、降逆止呕、消痞散结；外用消肿止痛",
    "天南星": "燥湿化痰、祛风止痉；外用散结消肿",
}


def verify(raw):
    text = raw.decode("utf-8")
    match = re.search(r"const herbs = (\[.*?\]);", text, re.S)
    if not match:
        raise ValueError("Embedded herb data not found")
    herbs = json.loads(match[1])
    by_name = {herb["name"]: herb for herb in herbs}
    errors = []
    if len(herbs) != 374 or len(by_name) != 374:
        errors.append("Expected 374 unique herbs")
    if len({herb["category"] for herb in herbs}) != 46:
        errors.append("Expected 46 categories")
    for name, answer in CORRECTIONS.items():
        herb = by_name.get(name, {})
        if herb.get("answer") != answer or herb.get("formalEffect") != answer:
            errors.append("Approved correction mismatch: " + name)
    for name in ("沙棘", "西洋参"):
        if by_name.get(name, {}).get("mnemonic") != "":
            errors.append("Disputed mnemonic must remain cleared: " + name)
    if any(token in text for token in ("allowedLicenseHashes", "activateLocally", "subtle.digest")):
        errors.append("Legacy activation hash/fallback code detected")
    urls = re.findall(r'const licenseApiUrl = "([^"]*)";', text)
    if urls != [API_URL]:
        errors.append("Production activation API URL mismatch")
    if hashlib.sha256(raw).hexdigest() != APPROVED_SHA256:
        errors.append("Artifact differs from approved V1 checksum; review changes before updating the lock")
    return errors


def main():
    try:
        errors = verify(Path(__file__).with_name("index.html").read_bytes())
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("FAIL:", exc, file=sys.stderr)
        return 1
    if errors:
        for error in errors:
            print("FAIL:", error, file=sys.stderr)
        return 1
    print("PASS: 374 unique herbs, 46 categories, seven corrections, cleared mnemonics")
    print("PASS: no legacy fallback, expected API URL, exact approved V1 artifact checksum")
    return 0


if __name__ == "__main__":
    sys.exit(main())
