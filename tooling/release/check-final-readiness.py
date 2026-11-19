"""Block official native builds until the recorded app acceptance prerequisites pass."""
import json
from pathlib import Path
import sys
REQUIRED={'passenger_vehicle_selection_restored','account_deletion_enabled_and_verified','legal_documents_published_and_verified'}

def blockers(path):
 value=json.loads(path.read_text())
 return sorted(name for name in REQUIRED if value.get(name) is not True)

if __name__=='__main__':
 pending=blockers(Path(__file__).with_name('final-readiness.json'))
 print(json.dumps({'ready':not pending,'blockers':pending},indent=2))
 sys.exit(1 if pending else 0)
