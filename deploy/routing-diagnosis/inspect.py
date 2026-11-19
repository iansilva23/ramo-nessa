#!/usr/bin/env python3
"""Read-only, redacted routing diagnosis. At most three existing-provider requests."""
import collections
import hashlib
import json
from pathlib import Path
import subprocess
import sys

PROBE_SHA = 'a7e3a5cd82228d1b13baca2d133538f02ece8271108927efafe79ca77e220e21'
CORE_IMAGE = 'sha256:44d2d2053eee1b67a9545fde7968cdc4cce91808109b5a2db8609972df791f48'
PATHS = {'/v1/rides/prepare', '/v1/pricing/quote'}


def summarize(raw):
    grouped = {path: [] for path in PATHS}
    for line in raw.decode(errors='replace').splitlines():
        try:
            row = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(row, dict) or row.get('method') != 'POST' or row.get('path') not in PATHS:
            continue
        code = row.get('statusCode')
        duration = row.get('durationMs')
        if type(code) is not int or not 100 <= code <= 599:
            continue
        grouped[row['path']].append((code, duration if type(duration) is int and 0 <= duration <= 3600000 else None))
    result = {}
    for path, rows in grouped.items():
        duration = [value for _, value in rows if value is not None]
        result[path] = {'count': len(rows), 'httpCounts': dict(collections.Counter(code for code, _ in rows)),
                        'maxDurationMs': max(duration) if duration else None,
                        'meanDurationMs': round(sum(duration) / len(duration)) if duration else None}
    return result


def run(args, **kwargs):
    return subprocess.run(['docker', *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True, **kwargs).stdout


def main():
    core = json.loads(run(['inspect', 'ramo-nessa-staging-core-1'], timeout=20))[0]
    labels = core['Config']['Labels']
    assert labels.get('com.docker.compose.project') == 'ramo-nessa-staging'
    assert labels.get('com.docker.compose.service') == 'core'
    assert core['Image'] == CORE_IMAGE and core['State']['Running']
    probe = Path(__file__).resolve().with_name('probe.mjs')
    assert probe.is_file() and not probe.is_symlink()
    raw = probe.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == PROBE_SHA
    logs = subprocess.run(['docker', 'logs', '--since', '2h', '--tail', '12000', core['Id']],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30, check=True).stdout
    result = {'status': 'ROUTING_READ_ONLY_DIAGNOSIS',
              'coreImage': core['Image'], 'health': core['State'].get('Health', {}).get('Status'),
              'httpLast2hTail12000': summarize(logs),
              'note': 'HTTP 503 is not proof of a Google failure by itself; underlying routing errors are currently hidden.',
              'changesApplied': False, 'servicesRestarted': False, 'rideCreated': False, 'paymentCreated': False}
    if result['health'] == 'healthy':
        response = run(['exec', '-i', core['Id'], 'node', '--input-type=module'], input=raw, timeout=125)
        assert len(response) < 65536
        result['routingProbe'] = json.loads(response)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'ROUTING_DIAGNOSIS_STOPPED', 'errorType': type(error).__name__,
                          'changesApplied': False, 'servicesRestarted': False}))
        sys.exit(1)
