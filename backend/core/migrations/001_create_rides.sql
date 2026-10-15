-- Ramo Nessa Core
-- Migration 001: base transacional de corridas.
-- PostgreSQL 16+ recomendado.
--
-- Esta migration congela em cada corrida a regra/preço/comissão usados.
-- Alterar a tabela comercial depois NÃO altera corridas já criadas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id text NOT NULL,

  state text NOT NULL,
  payment_status text NOT NULL,

  origin_zone_id text NOT NULL,
  origin_locality_id text,
  destination_zone_id text NOT NULL,
  destination_locality_id text,

  category text NOT NULL,
  price_period text NOT NULL,
  passengers integer NOT NULL CHECK (passengers BETWEEN 1 AND 4),

  trip_distance_km numeric(10,3),
  driver_pickup_distance_km numeric(10,3),

  pricing_rule_id text NOT NULL,
  base_amount_cents integer NOT NULL CHECK (base_amount_cents >= 0),
  pickup_compensation_cents integer NOT NULL CHECK (pickup_compensation_cents >= 0),
  total_amount_cents integer NOT NULL CHECK (total_amount_cents > 0),
  platform_commission_cents integer NOT NULL CHECK (platform_commission_cents >= 0),
  driver_net_cents integer NOT NULL CHECK (driver_net_cents >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rides_amount_split_check
    CHECK (platform_commission_cents + driver_net_cents = total_amount_cents)
);

CREATE INDEX IF NOT EXISTS rides_passenger_created_idx
  ON rides (passenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rides_state_created_idx
  ON rides (state, created_at DESC);

CREATE INDEX IF NOT EXISTS rides_payment_status_idx
  ON rides (payment_status);
