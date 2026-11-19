-- Migration 012: uma corrida não pode ter dois pagamentos confirmados.
--
-- Intenções adicionais podem existir enquanto created/pending/authorized,
-- mas somente um pagamento por corrida pode permanecer em status paid.
-- Pagamentos refunded deixam de ocupar a restrição e permitem nova cobrança.

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_paid_per_ride_idx
  ON payments (ride_id)
  WHERE status = 'paid';
