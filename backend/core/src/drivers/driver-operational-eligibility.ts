import type {
  DriverDocumentRepository,
  DriverDocumentType,
} from './driver-document-repository.js';
import type {
  DriverRegistryRepository,
  DriverVehicleRecord,
} from './driver-registry-repository.js';

export type DriverOperationalEligibility =
  | {
      eligible: true;
      vehicle: DriverVehicleRecord;
    }
  | {
      eligible: false;
      reason: 'registry' | 'documents' | 'manual_document_block';
    };

const REQUIRED_DOCUMENTS: readonly DriverDocumentType[] = [
  'driver_license',
  'vehicle_registration',
];

function documentIsApproved(
  record: Awaited<ReturnType<DriverDocumentRepository['findCurrent']>>,
  today: string,
): boolean {
  return record != null &&
    record.status === 'approved' &&
    (record.expiresOn == null || record.expiresOn >= today);
}

export async function driverOperationalEligibility(input: {
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  driverId: string;
  enforceDocuments?: boolean | undefined;
  manualDocumentBlocked?: boolean | undefined;
  now?: Date;
}): Promise<DriverOperationalEligibility> {
  const [profile, vehicle, documentRecords] = await Promise.all([
    input.registry.findProfile(input.driverId),
    input.registry.findVehicleByDriverId(input.driverId),
    input.documents.listCurrent(input.driverId),
  ]);

  if (
    profile == null ||
    vehicle == null ||
    profile.status !== 'approved' ||
    vehicle.status !== 'approved'
  ) {
    return {
      eligible: false,
      reason: 'registry',
    };
  }

  if (input.manualDocumentBlocked === true) {
    return {
      eligible: false,
      reason: 'manual_document_block',
    };
  }

  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(input.now ?? new Date());
  // A manually recorded expiry is always enforced for NEW work, independently
  // of the legacy switch for incomplete/pending documentation. Active rides continue.
  if(documentRecords.some(record=>(record.expiresOn!=null && record.expiresOn<today)||(record.validityControlled===true&&!documentIsApproved(record,today)))){
    return {eligible:false,reason:'documents'};
  }
  if (input.enforceDocuments === true) {
    const byType = new Map(
      documentRecords.map((record) => [record.documentType, record]),
    );

    const documentsApproved = REQUIRED_DOCUMENTS.every(
      (type) => documentIsApproved(byType.get(type) ?? null, today),
    );

    if (!documentsApproved) {
      return {
        eligible: false,
        reason: 'documents',
      };
    }
  }

  return {
    eligible: true,
    vehicle,
  };
}

export async function canDriverReceiveNewWork(input: {
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  driverId: string;
  enforceDocuments?: boolean | undefined;
  manualDocumentBlocked?: boolean | undefined;
  now?: Date;
}): Promise<boolean> {
  return (
    await driverOperationalEligibility(input)
  ).eligible;
}
