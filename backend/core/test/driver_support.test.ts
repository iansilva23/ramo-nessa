import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';

import { InMemoryDriverSupportRepository } from '../src/drivers/repositories/in-memory-driver-support-repository.js';
import { PostgresDriverSupportRepository } from '../src/drivers/repositories/postgres-driver-support-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';
import {
  DriverSupportError,
  createDriverSupportTicket,
  createPassengerSupportTicket,
  listDriverSupportTickets,
  listPassengerSupportTickets,
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

test('passageiro abre chamado na mesma fila e acompanha resposta', async () => {
  const repository = new InMemoryDriverSupportRepository();
  const created = await createPassengerSupportTicket({
    repository,
    passengerId: 'passenger-support',
    category: 'ride',
    subject: 'Local de embarque',
    message: 'Preciso corrigir o ponto de embarque da corrida.',
    now: new Date('2026-09-28T07:10:00.000Z'),
  });

  const listed = await listPassengerSupportTickets({
    repository,
    passengerId: 'passenger-support',
  });
  assert.equal(listed.tickets[0]?.id, created.id);

  const admin = await listSupportTicketsForAdmin({ repository });
  assert.equal(admin.tickets[0]?.requesterType, 'passenger');
  assert.equal(admin.tickets[0]?.passengerId, 'passenger-support');

  const answered = await respondToSupportTicket({
    repository,
    id: created.id,
    response: 'O ponto de embarque foi conferido pela equipe.',
    status: 'resolved',
  });
  assert.equal(answered.requesterType, 'passenger');
  assert.equal(answered.requesterId, 'passenger-support');
  assert.equal(answered.ticket.status, 'resolved');
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

test('suporte isola solicitantes e papéis mesmo com o mesmo ID', async () => {
  const repository = new InMemoryDriverSupportRepository();
  const shared = {
    repository,
    category: 'account',
    subject: 'Acesso à minha conta',
    message: 'Preciso de ajuda para acessar minha conta.',
  };
  const driver = await createDriverSupportTicket({
    ...shared, driverId: 'same-subject',
  });
  const passenger = await createPassengerSupportTicket({
    ...shared, passengerId: 'same-subject',
  });
  const driverTickets = await listDriverSupportTickets({
    repository, driverId: 'same-subject',
  });
  const passengerTickets = await listPassengerSupportTickets({
    repository, passengerId: 'same-subject',
  });
  assert.deepEqual(driverTickets.tickets.map((ticket) => ticket.id), [driver.id]);
  assert.deepEqual(passengerTickets.tickets.map((ticket) => ticket.id), [passenger.id]);
  assert.deepEqual(await listPassengerSupportTickets({
    repository, passengerId: 'someone-else',
  }), { tickets: [] });
});


test('Admin pagina chamados e filtra por status sem perder chamados antigos', async () => {
  const repository = new InMemoryDriverSupportRepository();
  const created = [];

  for (let index = 0; index < 5; index += 1) {
    created.push(
      await createDriverSupportTicket({
        repository,
        driverId: `driver-support-page-${index}`,
        category: 'ride',
        subject: `Chamado ${index}`,
        message: `Mensagem válida do chamado número ${index}.`,
        now: new Date(
          `2026-09-27T0${index + 1}:00:00.000Z`,
        ),
      }),
    );
  }

  await respondToSupportTicket({
    repository,
    id: created[4]!.id,
    response: 'Chamado mais novo já foi resolvido.',
    status: 'resolved',
    now: new Date('2026-09-27T06:00:00.000Z'),
  });
  await respondToSupportTicket({
    repository,
    id: created[3]!.id,
    response: 'Chamado em atendimento.',
    status: 'in_progress',
    now: new Date('2026-09-27T06:01:00.000Z'),
  });

  const first = await listSupportTicketsForAdmin({
    repository,
    limit: 2,
  });
  assert.equal(first.tickets.length, 2);
  assert.equal(first.tickets[0]?.id, created[4]?.id);
  assert.equal(first.tickets[1]?.id, created[3]?.id);
  assert.ok(first.nextCursor);

  assert.ok(first.nextCursor);
  const second = await listSupportTicketsForAdmin({
    repository,
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.equal(second.tickets.length, 2);
  assert.deepEqual(
    second.tickets.map((ticket) => ticket.id),
    [created[2]?.id, created[1]?.id],
  );
  assert.ok(second.nextCursor);

  assert.ok(second.nextCursor);
  const third = await listSupportTicketsForAdmin({
    repository,
    limit: 2,
    cursor: second.nextCursor,
  });
  assert.deepEqual(
    third.tickets.map((ticket) => ticket.id),
    [created[0]?.id],
  );
  assert.equal(third.nextCursor, null);

  const openOnly = await listSupportTicketsForAdmin({
    repository,
    status: 'open',
    limit: 10,
  });
  assert.deepEqual(
    openOnly.tickets.map((ticket) => ticket.id),
    [created[2]?.id, created[1]?.id, created[0]?.id],
  );
  assert.equal(openOnly.nextCursor, null);
});

const supportDatabaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL pagina e filtra fila Admin de suporte com o mesmo cursor',
  { skip: !supportDatabaseUrl },
  async () => {
    const pool = createPostgresPool(supportDatabaseUrl!);
    const repository = new PostgresDriverSupportRepository(pool);
    const ids: string[] = [];
    const runId = randomUUID();
    const passengerIdentityId = randomUUID();
    const driverIdentityId = randomUUID();
    const passengerId = `passenger-support-pg-${runId}`;
    const driverIds = Array.from(
      { length: 4 },
      (_, index) => `driver-support-pg-${runId}-${index}`,
    );

    try {
      for (const [index, driverId] of driverIds.entries()) {
        await pool.query(
          `
          INSERT INTO driver_profiles (
            driver_id, full_name, status, created_at, updated_at
          ) VALUES ($1, $2, 'approved', $3, $3)
          `,
          [
            driverId,
            `Motorista Suporte PG ${index}`,
            '2099-09-26T09:00:00.000Z',
          ],
        );
      }

      await pool.query(
        `
        INSERT INTO auth_identities (
          id, subject_id, subject_type, phone_e164, status,
          created_at, updated_at
        ) VALUES ($1, $2, 'passenger', $3, 'active', $4, $4)
        `,
        [
          passengerIdentityId,
          passengerId,
          `+5588${randomInt(900000000, 1000000000)}`,
          '2099-09-26T09:00:00.000Z',
        ],
      );

      await pool.query(
        `INSERT INTO auth_identities (
          id, subject_id, subject_type, phone_e164, status,
          created_at, updated_at
        ) VALUES ($1, $2, 'driver', $3, 'active', $4, $4)`,
        [driverIdentityId, driverIds[0],
          `+5588${randomInt(900000000, 1000000000)}`,
          '2099-09-26T09:00:00.000Z'],
      );

      // Exercise the actual database constraints, not just valid fixtures.
      const insertInvalidRequester = (driverId: string | null, ownerId: string | null) => {
        const id = randomUUID();
        ids.push(id);
        return pool.query(
          `INSERT INTO driver_support_tickets (
            id, driver_id, passenger_id, category, subject, message, status,
            created_at, updated_at
          ) VALUES ($1, $2, $3, 'account', 'Suporte inválido',
            'Chamado que deve ser recusado pelo banco.', 'open', NOW(), NOW())`,
          [id, driverId, ownerId],
        );
      };
      await assert.rejects(insertInvalidRequester(`missing-${runId}`, null), {
        code: '23503', constraint: 'driver_support_tickets_driver_id_fkey',
      });
      await assert.rejects(insertInvalidRequester(null, `missing-${runId}`), {
        code: '23503', constraint: 'driver_support_tickets_passenger_fkey',
      });
      await assert.rejects(insertInvalidRequester(null, driverIds[0]!), {
        code: '23503', constraint: 'driver_support_tickets_passenger_fkey',
      });
      await assert.rejects(insertInvalidRequester(null, null), {
        code: '23514', constraint: 'driver_support_tickets_requester_check',
      });
      await assert.rejects(insertInvalidRequester(driverIds[0]!, passengerId), {
        code: '23514', constraint: 'driver_support_tickets_requester_check',
      });
      // Invalid inserts above have no rows; keep pagination fixture IDs exact.
      ids.length = 0;

      for (let index = 0; index < 4; index += 1) {
        const ticket = await createDriverSupportTicket({
          repository,
          driverId: driverIds[index]!,
          category: 'payment',
          subject: `Suporte PG ${index}`,
          message: `Mensagem PostgreSQL válida número ${index}.`,
          now: new Date(
            `2099-09-26T1${index}:00:00.000Z`,
          ),
        });
        ids.push(ticket.id);
      }

      const passengerTicket = await createPassengerSupportTicket({
        repository,
        passengerId,
        category: 'account',
        subject: 'Suporte Passageiro PG',
        message: 'Mensagem PostgreSQL válida do passageiro.',
        now: new Date('2099-09-26T14:00:00.000Z'),
      });
      ids.push(passengerTicket.id);
      const passengerTickets = await listPassengerSupportTickets({
        repository,
        passengerId,
      });
      assert.equal(passengerTickets.tickets[0]?.id, passengerTicket.id);
      assert.deepEqual(await repository.listByPassenger(driverIds[0]!, 50), []);
      assert.deepEqual(await repository.listByDriver(passengerId, 50), []);

      await respondToSupportTicket({
        repository,
        id: ids[3]!,
        response: 'Resolvido no teste PostgreSQL.',
        status: 'resolved',
        now: new Date('2099-09-26T20:00:00.000Z'),
      });

      const first = await listSupportTicketsForAdmin({
        repository,
        limit: 2,
      });
      const relevantFirst = first.tickets.filter((ticket) =>
        ids.includes(ticket.id),
      );
      assert.equal(relevantFirst.length >= 1, true);

      const resolved = await listSupportTicketsForAdmin({
        repository,
        status: 'resolved',
        limit: 100,
      });
      assert.equal(
        resolved.tickets.some((ticket) => ticket.id === ids[3]),
        true,
      );

      const directPage = await repository.listAdmin({
        limit: 2,
      });
      if (directPage.hasMore && directPage.tickets.length > 0) {
        const last = directPage.tickets.at(-1)!;
        const nextPage = await repository.listAdmin({
          limit: 100,
          cursor: {
            createdAt: last.createdAt,
            id: last.id,
          },
        });
        assert.equal(
          nextPage.tickets.some((ticket) => ticket.id === last.id),
          false,
        );
      }
    } finally {
      if (ids.length > 0) {
        await pool.query(
          'DELETE FROM driver_support_tickets WHERE id = ANY($1::uuid[])',
          [ids],
        );
      }
      await pool.query(
        'DELETE FROM driver_profiles WHERE driver_id = ANY($1::text[])',
        [driverIds],
      );
      await pool.query('DELETE FROM auth_identities WHERE id = ANY($1::uuid[])', [
        [passengerIdentityId, driverIdentityId],
      ]);
      await pool.end();
    }
  },
);
