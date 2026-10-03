export type PassengerSavedPlaceKind =
  | 'home'
  | 'work'
  | 'custom';

export interface SavedAddressDetails {
  mapPinned: boolean;
  houseNumber?: string;
  noNumber: boolean;
  complement?: string;
  reference?: string;
}

export interface PassengerSavedPlaceRecord {
  id: string;
  passengerId: string;
  kind: PassengerSavedPlaceKind;
  label: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  addressDetails?: SavedAddressDetails;
  providerPlaceId?: string;
  approvedPricingZoneId?: 'jericoacoara' | 'jijoca' | 'prea' | 'external';
  approvedPricingLocalityId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PassengerSavedPlaceRepository {
  listByPassenger(
    passengerId: string,
  ): Promise<PassengerSavedPlaceRecord[]>;
  save(
    place: PassengerSavedPlaceRecord,
  ): Promise<PassengerSavedPlaceRecord>;
  deleteByPassenger(input: {
    passengerId: string;
    id: string;
  }): Promise<boolean>;
}
