CREATE TYPE "public"."join_request_status" AS ENUM (
  'pending',
  'approved',
  'denied',
  'cancelled'
);
