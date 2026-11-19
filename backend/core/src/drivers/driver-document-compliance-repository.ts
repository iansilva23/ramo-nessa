export interface DriverDocumentComplianceControl {
  driverId: string;
  manualBlocked: boolean;
  notifiedAt?: string;
  acknowledgedAt?: string;
  updatedAt: string;
}

export interface DriverDocumentComplianceRepository {
  get(
    driverId: string,
  ): Promise<DriverDocumentComplianceControl | null>;

  save(input: DriverDocumentComplianceControl):
    Promise<DriverDocumentComplianceControl>;
}
