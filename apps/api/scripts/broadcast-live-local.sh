#!/usr/bin/env bash
# Runs tests/integration/broadcast-destinations.live.spec.ts against servers on
# this machine: the OpenTelemetry Collector (otelcol), an S3 gateway with
# signature checks (versitygw), and the spec's own webhook and fault servers.
#
#   OTELCOL=path/to/otelcol VERSITYGW=path/to/versitygw bash scripts/broadcast-live-local.sh [destinations.json]
#
# A missing tool skips its destinations. destinations.json adds real
# destinations in the spec's config format ({"destinations": [...]}); keep it
# outside the repo. Work files go to BROADCAST_SMOKE_DIR (default
# $TMPDIR/broadcast-smoke) and both servers are stopped on exit.
set -euo pipefail
API_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${BROADCAST_SMOKE_DIR:-${TMPDIR:-/tmp}/broadcast-smoke}"
EXTRA="${1:-}"
mkdir -p "$WORK/out" "$WORK/tls" "$WORK/buckets/phaseo-smoke" "$WORK/object-metadata"
rm -f "$WORK/out/traces.jsonl"

# A throwaway certificate, trusted only by this run through NODE_EXTRA_CA_CERTS.
# localtest.me resolves to 127.0.0.1; the OTLP sender refuses "localhost".
if [ ! -f "$WORK/tls/cert.pem" ]; then
	MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=localhost" \
		-addext "subjectAltName=DNS:localhost,DNS:localtest.me,IP:127.0.0.1" \
		-keyout "$WORK/tls/key.pem" -out "$WORK/tls/cert.pem" 2>/dev/null
fi

PIDS=()
cleanup() {
	for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT

if [ -n "${OTELCOL:-}" ]; then
	cat > "$WORK/otelcol.yaml" <<EOF
receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:4318
exporters:
  file:
    path: $WORK/out/traces.jsonl
    flush_interval: 100ms
service:
  telemetry:
    metrics:
      level: none
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [file]
EOF
	"$OTELCOL" --config "$WORK/otelcol.yaml" > "$WORK/out/otelcol.log" 2>&1 &
	PIDS+=($!)
fi

S3_ACCESS="smoke$(openssl rand -hex 4)"
S3_SECRET="$(openssl rand -hex 20)"
if [ -n "${VERSITYGW:-}" ]; then
	# The sidecar keeps object metadata where extended attributes are missing
	# (Windows). It must not share a path prefix with the bucket root.
	"$VERSITYGW" --access "$S3_ACCESS" --secret "$S3_SECRET" --port 127.0.0.1:7443 \
		--cert "$WORK/tls/cert.pem" --key "$WORK/tls/key.pem" posix --sidecar "$WORK/object-metadata" "$WORK/buckets" > "$WORK/out/versitygw.log" 2>&1 &
	PIDS+=($!)
fi

for _ in $(seq 1 30); do
	ready=1
	if [ -n "${OTELCOL:-}" ] && ! curl -s -o /dev/null http://127.0.0.1:4318/; then ready=0; fi
	if [ -n "${VERSITYGW:-}" ] && ! curl -sk -o /dev/null https://127.0.0.1:7443/; then ready=0; fi
	[ "$ready" = 1 ] && break
	sleep 0.5
done

CONFIG="$WORK/out/config.json"
node -e '
const [file, work, s3Access, s3Secret, hookSecret, otelcol, versitygw, extra] = process.argv.slice(1);
const fs = require("fs");
const collector = (name, protocol, compression) => ({ name, type: "otel_collector", config: { endpoint: "http://localtest.me:4318", otlp_protocol: protocol, otlp_compression: compression }, otlpFile: `${work}/out/traces.jsonl` });
const destinations = [
	...(otelcol ? [collector("collector-json", "http/json", "none"), collector("collector-protobuf-gzip", "http/protobuf", "gzip")] : []),
	{ name: "webhook-signed", type: "webhook", localWebhook: true, config: { signing_secret: hookSecret, headers_json: JSON.stringify({ Authorization: "Bearer smoke" }) } },
	{ name: "webhook-unsigned", type: "webhook", localWebhook: true, config: {} },
	...(versitygw ? [{ name: "s3-local", type: "s3", config: { endpoint: "https://localhost:7443", bucket: "phaseo-smoke", region: "us-east-1", access_key_id: s3Access, secret_access_key: s3Secret } }] : []),
	...(extra ? JSON.parse(fs.readFileSync(extra, "utf8")).destinations : []),
];
fs.writeFileSync(file, JSON.stringify({ allowLocal: true, tls: { cert: `${work}/tls/cert.pem`, key: `${work}/tls/key.pem` }, destinations }, null, 2));
' "$CONFIG" "$WORK" "$S3_ACCESS" "$S3_SECRET" "whsec_$(openssl rand -hex 16)" "${OTELCOL:-}" "${VERSITYGW:-}" "$EXTRA"

cd "$API_DIR"
set +e
NODE_EXTRA_CA_CERTS="$WORK/tls/cert.pem" BROADCAST_LIVE_CONFIG="$CONFIG" BROADCAST_LIVE_REPORT="$WORK/out/report.txt" \
	pnpm exec vitest run tests/integration/broadcast-destinations.live.spec.ts
STATUS=$?
set -e
# The config holds copies of any credentials from destinations.json.
rm -f "$CONFIG"
echo "Report: $WORK/out/report.txt"
exit "$STATUS"
