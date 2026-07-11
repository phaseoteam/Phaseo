# Management key format

Management routes accept only `phaseo_v1_mk_<kid>_<secret>`. The historic
`phaseo_v1_sk_` format is inference-only and is rejected on management routes.
Rotate any historic management key to a newly created typed management key
before deploying this change.

## Templates

- `raycast-readonly`: `credits:read`, `activity:read`
- `read-only`: every current `*:read` management capability
- `read-write`: every current `*:read` and `*:write` capability
- `full-control`: every current management capability

The API accepts either `template` or an explicit `scopes` list when creating or
updating a management key. Supplying both is rejected.

## Issuance ownership

The dashboard is the canonical issuer for dashboard-created API and management
keys. It generates the secret and writes its HMAC server-side, after checking
the signed-in user is a workspace owner or admin. The public management API
continues to issue keys inside the gateway for programmatic clients.

## Pepper rotation

Set the same `KEY_PEPPER_ACTIVE` value on the Worker and web server, retain the
prior value in `KEY_PEPPER_PREVIOUS` on the Worker, then deploy. A successful
authentication using the previous pepper automatically rehashes the key with
the active pepper. Update the web server's active pepper before issuing new
dashboard keys after a rotation.

For OAuth client secrets, mirror `PHASEO_OAUTH_TOKEN_PEPPER` to the web server
when it is set on the Worker; otherwise both use `KEY_PEPPER_ACTIVE`.
