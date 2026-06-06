import sys
import urllib.request


def main() -> int:
    if len(sys.argv) < 2:
        return 2
    url = sys.argv[1]
    expected = int(sys.argv[2]) if len(sys.argv) >= 3 else None
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            status = response.status
        if expected is not None:
            return 0 if status == expected else 1
        return 0 if 200 <= status < 500 else 1
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
