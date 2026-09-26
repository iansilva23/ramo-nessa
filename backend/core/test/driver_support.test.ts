import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupportRepository } from '../src/drivers/repositories/in-memory-driver-support-repository.js';
import {
  DriverSupportError,
  createDriverSupportTicket,
  listDriverSupportTickets,
  listSupportTicketsForAdmin,
  respondToSupportTicket,
} from '../src/drivers/driver-support-service.js';

test('motorista abre chamado e acompanha resposta do suporte', async () => {
  const repository = new InMemoryDriverSupportRepository();
  const now = new Date('2026-09-24T22:00:00.000Z');

  const created = await createDriverSupportTicket({
    repository,
    driverId: 'driver-support',
    category: 'payment',
    subject: 'Dúvida no saldo',
    message: 'Meu saldo não atualizou depois da corrida.',
    now,
  });

  assert.equal(created.category, 'payment');
  assert.equal(created.status, 'open');

  const listed = await listDriverSupportTickets({
    repository,
    driverId: 'driver-support',
  });
  assert.equal(listed.tickets.length, 1);
  assert.equal(listed.tickets[0]?.id, created.id);

  const answered = await respondToSupportTicket({
    repository,
    id: created.id,
    response: 'Recebemos o chamado e o saldo foi conferido.',
    status: 'resolved',
    now: new Date('2026-09-24T22:10:00.000Z'),
  });

  assert.equal(answered.driverId, 'driver-support');
  assert.equal(answered.ticket.status, 'resolved');
  assert.equal(
    answered.ticket.response,
    'Recebemos o chamado e o saldo foi conferido.',
  );

  const admin = await listSupportTicketsForAdmin({ repository });
  assert.equal(admin.tickets.length, 1);
  assert.equal(admin.tickets[0]?.driverId, 'driver-support');
});

test('suporte valida categoria e conteúdo', async () => {
  const repository = new InMemoryDriverSupportRepository();

  await assert.rejects(
    createDriverSupportTicket({
      repository,
      driverId: 'driver-support',
      category: 'invalid',
      subject: 'Teste',
      message: 'Mensagem válida para teste.',
    }),
    (error: unknown) =>
      error instanceof DriverSupportError &&
      error.code === 'INVALID_SUPPORT_CATEGORY',
  );

  await assert.rejects(
    createDriverSupportTicket({
      repository,
      driverId: 'driver-support',
      category: 'ride',
      subject: 'OK',
      message: 'curta',
    }),
    (error: unknown) =>
      error instanceof DriverSupportError &&
      error.code === 'INVALID_SUPPORT_SUBJECT',
  );
});
