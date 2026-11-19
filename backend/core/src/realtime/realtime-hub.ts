export interface RealtimePeer {
  readonly readyState: number;
  send(data: string): void;
}

const OPEN_READY_STATE = 1;

type TopicMap = Map<string, Set<RealtimePeer>>;

function subscribe(
  topics: TopicMap,
  key: string,
  peer: RealtimePeer,
): () => void {
  let peers = topics.get(key);
  if (peers == null) {
    peers = new Set<RealtimePeer>();
    topics.set(key, peers);
  }
  peers.add(peer);

  return () => {
    const current = topics.get(key);
    if (current == null) return;
    current.delete(peer);
    if (current.size === 0) topics.delete(key);
  };
}

function publish(
  topics: TopicMap,
  key: string,
  event: unknown,
): number {
  const peers = topics.get(key);
  if (peers == null || peers.size === 0) return 0;

  const payload = JSON.stringify(event);
  let delivered = 0;

  for (const peer of peers) {
    if (peer.readyState !== OPEN_READY_STATE) continue;
    try {
      peer.send(payload);
      delivered += 1;
    } catch {
      // O socket será removido pelo evento close/error do transporte.
    }
  }

  return delivered;
}

export class RealtimeHub {
  private readonly drivers: TopicMap = new Map();
  private readonly passengerRides: TopicMap = new Map();

  subscribeDriver(driverId: string, peer: RealtimePeer): () => void {
    return subscribe(this.drivers, driverId, peer);
  }

  subscribePassengerRide(
    rideId: string,
    peer: RealtimePeer,
  ): () => void {
    return subscribe(this.passengerRides, rideId, peer);
  }

  publishDriver(driverId: string, event: unknown): number {
    return publish(this.drivers, driverId, event);
  }

  publishPassengerRide(rideId: string, event: unknown): number {
    return publish(this.passengerRides, rideId, event);
  }
}
