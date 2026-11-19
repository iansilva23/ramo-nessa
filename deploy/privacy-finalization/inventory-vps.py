#!/usr/bin/env python3
"""Read-only VPS inventory for the privacy notice. Emits metadata and allowlisted facts."""
import json
import os
from datetime import datetime
from pathlib import Path
import re
import subprocess

CORE = 'ramo-nessa-staging-core-1'
ROOT = Path('/var/backups/ramo-nessa')
ANCHORS = Path('/opt/ramo-nessa-security')
JOB = re.compile(r'backup|retention|pg_dump|restic|borg|pgbackrest|expire|purge', re.I)
SNAPSHOT = re.compile(r'\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z')
UNIT = re.compile(r'[a-zA-Z0-9_.@-]{1,150}\.(?:timer|service)')
CRON = re.compile(r'(@(?:daily|midnight|hourly|weekly|monthly|yearly|reboot)|(?:[\d*/,\-]+\s+){4}[\d*/,\-]+)\s+(.+)')
OPTIONS = re.compile(r'(?:--(?:backup-dir|output-dir)=|RAMO_BACKUP_DIR=)[\'"]?(/(?:var/backups|opt|home/ubuntu)/[A-Za-z0-9._/-]+)')


def run(args, timeout=15):
    try:
        result = subprocess.run(args, capture_output=True, text=True, errors='replace', timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout if result.returncode == 0 else None


def details(command, roots):
    for match in OPTIONS.finditer(command):
        path = Path(match[1])
        if '..' not in path.parts:
            roots.add(path)
    known = bool(re.search(r'\bbackup-retention\.mjs\b', command))
    keep = re.search(r'--keep=(\d{1,3})(?=\s|[\'";]|$)', command)
    return {
        'mentionsBackup': bool(re.search(r'backup|pg_dump|restic|borg', command, re.I)),
        'mentionsRotation': bool(re.search(r'retention|prune|forget|expire|purge|\b-mtime\b', command, re.I)),
        'versionedRetentionToolMentioned': known,
        'keepArgument': int(keep[1]) if known and keep else None,
        'explicitApplyArgument': bool(re.search(r'--apply=true(?=\s|[\'";]|$)', command)) if known else None,
    }


def cron_rows(body, scope, roots):
    timezone = None
    result = []
    for line in body.splitlines():
        line = line.strip()
        tz = re.fullmatch(r'(?:CRON_TZ|TZ)\s*=\s*[\'"]?([A-Za-z0-9_+/-]{1,64})[\'"]?', line)
        if tz:
            timezone = tz[1]
        match = CRON.fullmatch(line)
        if match and JOB.search(match[2]):
            result.append({'scope': scope, 'schedule': ' '.join(match[1].split()), 'timezoneDeclared': timezone,
                           **details(match[2], roots)})
    return result


def schedulers(roots):
    rows = []
    for account in ('root', 'ubuntu'):
        rows += cron_rows(run(['crontab', '-u', account, '-l']) or '', account, roots)
    files = [Path('/etc/crontab'), *sorted(Path('/etc/cron.d').glob('*'))[:80]]
    for file in files:
        try:
            if not file.is_symlink() and file.is_file() and file.stat().st_size <= 256_000:
                rows += cron_rows(file.read_text(errors='replace'), 'system', roots)
        except OSError:
            continue
    timers = []
    listed = run(['systemctl', 'list-timers', '--all', '--no-pager', '--no-legend'])
    for line in (listed or '').splitlines()[:120]:
        units = [word for word in line.split() if UNIT.fullmatch(word)]
        timer = next((unit for unit in units if unit.endswith('.timer')), None)
        service = next((unit for unit in units if unit.endswith('.service')), None)
        if not timer:
            continue
        command = (run(['systemctl', 'show', '--property=ExecStart', '--value', service], 4) or '') if service else ''
        if not JOB.search(f'{timer} {service or ""} {command}'):
            continue
        calendar = run(['systemctl', 'show', '--property=TimersCalendar', '--value', timer], 4) or ''
        next_time = run(['systemctl', 'show', '--property=NextElapseUSecRealtime', '--value', timer], 4) or ''
        clean = lambda value: value.strip() if re.fullmatch(r'[A-Za-z0-9\s_*,:./+=~{};-]{0,400}', value) else None
        timers.append({'timer': timer, 'calendar': clean(calendar), 'next': clean(next_time), **details(command, roots)})
    return {'cronMatches': rows, 'timers': timers, 'systemdAvailable': listed is not None,
            'scope': 'crontabs root/ubuntu, cron de sistema e timers listados; wrappers e rotinas externas podem não aparecer'}


def file_date(path):
    return datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(timespec='seconds')


def backup_facts(roots):
    result = []
    for root in sorted(roots)[:20]:
        if not root.is_dir() or root.is_symlink() or root.resolve() != root:
            continue
        copies = []
        for path in root.iterdir():
            if path.is_symlink():
                continue
            if path.is_dir() and SNAPSHOT.fullmatch(path.name) and (path / 'database.dump').is_file():
                copies.append(('snapshot', file_date(path / 'database.dump')))
            elif path.is_file() and path.name.lower().endswith(('.dump', '.sql', '.sql.gz', '.dump.gz', '.tar.gz', '.tgz', '.backup', '.zip')):
                copies.append(('arquivo', file_date(path)))
        dates = sorted(date for _, date in copies)
        result.append({'directory': str(root), 'timestampedSnapshots': sum(kind == 'snapshot' for kind, _ in copies),
                       'looseArchiveCandidates': sum(kind == 'arquivo' for kind, _ in copies),
                       'oldestModified': dates[0] if dates else None, 'newestModified': dates[-1] if dates else None})
    known = []
    for name in ('apps-pending-9eb6aa071db4', 'privacy-final-2925c1a15a20'):
        path = ANCHORS / name / 'database-before.dump'
        known.append({'release': name, 'exists': path.is_file(), 'modified': file_date(path) if path.is_file() else None})
    return {'directoriesFound': result, 'knownRolloutBackups': known,
            'scope': 'metadados das pastas locais reconhecidas; não abre arquivos nem verifica snapshots externos'}


PROBE = r"""
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const env = process.env;
const has = key => Boolean(env[key]?.trim());
const any = (...keys) => keys.some(has);
const mode = (key, allowed) => allowed.includes(env[key]) ? env[key] : has(key) ? 'outro' : null;
const result = { configured: {
  recoveryEmailResend: has('RESEND_API_KEY') && has('PASSWORD_RECOVERY_EMAIL_FROM'),
  recoveryWhatsappEntrar: has('PASSWORD_RECOVERY_ENTRAR_API_SECRET'),
  firebase: any('FIREBASE_SERVICE_ACCOUNT_FILE','FIREBASE_PROJECT_ID'),
  googleMapsServer: has('GOOGLE_MAPS_SERVER_API_KEY'),
  mercadoPagoCredentialForMode: has(env.MERCADO_PAGO_MODE === 'production' ? 'MERCADO_PAGO_ACCESS_TOKEN' : 'MERCADO_PAGO_ACCESS_TOKEN_TEST'),
  mercadoPagoMode: mode('MERCADO_PAGO_MODE', ['production','test','sandbox']),
  asaasCredential: any('ASAAS_API_KEY_FILE','ASAAS_API_KEY'),
  asaasPayoutEnabled: env.ASAAS_PAYOUTS_ENABLED === 'true',
  asaasPayoutMode: mode('ASAAS_PAYOUT_MODE',['production','sandbox']),
  selectedPayoutProvider: mode('DRIVER_PAYOUT_PROVIDER_NAME',['asaas','mercado-pago','mercado-pago-orders']),
  accountDeletionEnabled: env.SELF_ACCOUNT_DELETION_ENABLED === 'true',
  documentStorage: has('DOCUMENT_STORAGE_LOCAL_DIR') ? 'local' : has('DOCUMENT_STORAGE_BASE_URL') ? 'http' : null,
}};
let pool, client;
try {
  pool = createPostgresPool(env.DATABASE_URL); client = await pool.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '4s'");
  const {rows} = await client.query(`SELECT
    EXISTS (SELECT 1 FROM payments WHERE processor IN ('mercado-pago-orders','mercado-pago','mercado_pago') AND created_at >= now() - interval '30 days') AS mercado_pago_payment_record_30d,
    EXISTS (SELECT 1 FROM driver_payouts WHERE processor = 'asaas' AND created_at >= now() - interval '30 days') AS asaas_driver_payout_record_30d,
    EXISTS (SELECT 1 FROM legal_documents WHERE document_type = 'privacy_policy' AND status = 'published' AND effective_at <= now()) AS privacy_policy_published,
    EXISTS (SELECT 1 FROM legal_documents WHERE document_type = 'terms_of_use' AND status = 'published' AND effective_at <= now()) AS terms_of_use_published`);
  await client.query('ROLLBACK');
  result.readOnlyDatabaseEvidence = rows[0];
} catch {
  result.readOnlyDatabaseEvidence = null;
} finally {
  client?.release();
  await pool?.end();
}
console.log(JSON.stringify(result));
"""


def main():
    roots = {ROOT}
    schedules = schedulers(roots)
    active = run(['docker', 'inspect', '--format', '{{.State.Running}} {{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}}', CORE])
    raw = run(['docker', 'exec', CORE, 'node', '--input-type=module', '-e', PROBE], 25) if active and active.strip() == 'true ramo-nessa-staging core' else None
    facts = json.loads(raw) if raw else None
    print(json.dumps({'status': 'RAMONESSA_PRIVACY_VPS_INVENTORY', 'observedAt': datetime.now().astimezone().isoformat(timespec='seconds'),
                      'schedulers': schedules, 'backups': backup_facts(roots), 'core': facts,
                      'notes': ['Configuração e registro local não provam região, contrato, trânsito efetivo ou ambiente externo.',
                                'Quantidade observada não comprova prazo de descarte.'], 'changesApplied': False}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    if os.geteuid() != 0:
        raise SystemExit('Execute com sudo python3.')
    try:
        main()
    except (ValueError, OSError):
        raise SystemExit('Inventário interrompido. Nenhuma alteração foi aplicada.') from None
