import type {
  PassengerSavedPlaceRecord,
  PassengerSavedPlaceRepository,
} from '../passenger-saved-place-repository.js';

export class InMemoryPassengerSavedPlaceRepository
  implements PassengerSavedPlaceRepository {
  private readonly places =
    new Map<string, PassengerSavedPlaceRecord>();

  async listByPassenger(
    passengerId: string,
  ): Promise<PassengerSavedPlaceRecord[]> {
    return [...this.places.values()]
      .filter((place) => place.passengerId === passengerId)
      .sort((a, b) => {
        const rank = (kind: PassengerSavedPlaceRecord['kind']) =>
          kind === 'home' ? 0 : kind === 'work' ? 1 : 2;
        const diff = rank(a.kind) - rank(b.kind);
        return diff !== 0
          ? diff
          : b.updatedAt.localeCompare(a.updatedAt);
      })
      .map((place) => structuredClone(place));
  }

  async save(
    place: PassengerSavedPlaceRecord,
  ): Promise<PassengerSavedPlaceRecord> {
    if (place.kind !== 'custom') {
      for (const [id, current] of this.places.entries()) {
        if (
          current.passengerId === place.passengerId &&
          current.kind === place.kind &&
          id !== place.id
        ) {
          this.places.delete(id);
        }
      }
    }

    this.places.set(place.id, structuredClone(place));
    return structuredClone(place);
  }

  async deleteByPassenger(input: {
    passengerId: string;
    id: string;
  }): Promise<boolean> {
    const current = this.places.get(input.id);
    if (
      current == null ||
      current.passengerId !== input.passengerId
    ) {
      return false;
    }
    return this.places.delete(input.id);
  }
}
