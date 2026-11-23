export type ExternalPaymentAdjustmentKind =
  | 'partial_refund'
  | 'chargeback';

export type ExternalPaymentAdjustmentAccountingStatus =
  | 'observed'
  | 'applied_to_escrow'
  | 'review_required';

export interface ExternalPaymentAdjustmentRecord {
  id: string;
  paymentId: string;
  processor: string;
  processorAdjustmentId: string;
  kind: ExternalPaymentAdjustmentKind;
  processorStatus: string;
  processorStatusDetail: string;
  amountCents: number;
  escrowAppliedCents: number;
  reviewRequiredCents: number;
  accountingStatus: ExternalPaymentAdjustmentAccountingStatus;
  createdAt: string;
  updatedAt: string;
}

export class ExternalPaymentAdjustmentError extends Error {
  constructor(
    public readonly code:
      | 'PAYMENT_NOT_FOUND'
      | 'PAYMENT_ADJUSTMENT_MISMATCH'
      | 'INVALID_ADJUSTMENT_AMOUNT'
      | 'ADJUSTMENT_EXCEEDS_PAYMENT',
    message: string,
  ) {
    super(message);
    this.name = 'ExternalPaymentAdjustmentError';
  }
}
