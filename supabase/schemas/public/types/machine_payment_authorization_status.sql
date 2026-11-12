CREATE TYPE "public"."machine_payment_authorization_status" AS ENUM (
  'authorized',
  'claimed',
  'executing',
  'settled',
  'released',
  'failed'
);
