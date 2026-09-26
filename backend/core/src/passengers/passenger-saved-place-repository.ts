export type PassengerSavedPlaceKind =
  | 'home'
  | 'work'
  | 'custom';

export interface PassengerSavedPlaceRecord {
  id: string;
  passengerId: string;
  kind: PassengerSavedPlaceKind;
  label: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
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
