import {formatCurrencyCents, formatDateTime} from './security.js';

export function renderSupportRideContext(ticket, {section, container}) {
  if (!section || !container) return;
  section.hidden = !ticket?.rideId;
  container.replaceChildren();
  if (!ticket?.rideId) return;
  const context = ticket.rideContext;
  const line = (label, value) => {
    const p = container.ownerDocument.createElement('p');
    p.textContent = `${label}: ${value ?? 'não disponível'}`;
    container.append(p);
  };
  line('Corrida', ticket.rideId);
  if (!context) { line('Registros', 'Sem registros anexados a este chamado.'); return; }
  line('Retrato registrado no atendimento', formatDateTime(context.capturedAt));
  line('Situação', context.ride?.state);
  line('Passageiro', context.ride?.passengerId);
  line('Motorista', context.driver?.name || context.ride?.driverId);
  line('Veículo', context.vehicle ? `${context.vehicle.make} ${context.vehicle.model} · ${context.vehicle.color} · ${context.vehicle.plate}` : null);
  line('Pagamento', context.payment ? `${context.payment.method} · ${context.payment.status} · ${formatCurrencyCents(context.payment.amountCents)} · ${context.payment.id}` : context.ride?.paymentStatus);
  const events = Array.isArray(context.events) ? context.events : [];
  if (!events.length) line('Etapas', 'Sem histórico de etapas disponível. Registros antigos não foram reconstruídos.');
  events.forEach(event => {
    line('Etapa registrada', `${formatDateTime(event.recordedAt)} · ${event.state} · pagamento ${event.paymentStatus}`);
    if (event.driverLocation) {
      const gps = event.driverLocation;
      line('GPS observado pelo dispositivo', `${gps.latitude}, ${gps.longitude} · ${formatDateTime(gps.observedAt)} · precisão ${gps.accuracyMeters == null ? 'não disponível' : `${gps.accuracyMeters} m`}`);
    }
  });
  line('Limites dos registros', context.evidenceNote);
}

