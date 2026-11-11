"""Run every DinKit browser suite with isolated profiles and retain per-suite logs."""
from pathlib import Path
from tempfile import gettempdir
from datetime import datetime
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
LOGS = Path(gettempdir()) / 'dinkit-qa-run'
SUITES = ['auth', 'auth-drag', 'json', 'proxy', 'editor', 'focus', 'utilities', 'ruler', 'ruler-stress', 'ui', 'lifecycle']


def main():
    LOGS.mkdir(exist_ok=True)
    started = time.monotonic()
    print(f'Started {datetime.now().isoformat(timespec="seconds")}; logs: {LOGS}', flush=True)
    for name in SUITES:
        log = LOGS / f'{name}.log'
        with log.open('w', encoding='utf-8') as output:
            result = subprocess.run([sys.executable, str(ROOT / 'scripts' / f'test-{name}-browser.py')], cwd=ROOT,
                stdout=output, stderr=subprocess.STDOUT, timeout=300)
        print(f'{"PASS" if result.returncode == 0 else "FAIL"}: {name} ({log})', flush=True)
        if result.returncode:
            print(log.read_text(encoding='utf-8'), flush=True)
            raise SystemExit(result.returncode)
    print(f'PASS: all {len(SUITES)} browser suites in {time.monotonic()-started:.1f}s', flush=True)


if __name__ == '__main__':
    main()
