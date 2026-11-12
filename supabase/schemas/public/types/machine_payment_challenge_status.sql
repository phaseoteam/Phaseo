CREATE TYPE "public"."machine_payment_challenge_status" AS ENUM (
  'open',
  'authorized',
  'expired',
  'cancelled'
);
