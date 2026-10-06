import { ProviderSetupError, type ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Clock from "effect/Clock";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ProviderCredentialStore from "./ProviderCredentialStore.ts";
import * as ProviderAuthFlow from "./ProviderAuthFlow.ts";
import { signInPhaseo } from "./phaseoOAuth.ts";

const Credentials = Schema.Struct({ key: Schema.NonEmptyString, expiresAt: Schema.String });
const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Credentials));
const encode = Schema.encodeEffect(Schema.fromJsonString(Credentials));

export const makePhaseoAuth = Effect.fn("makePhaseoAuth")(function* (
  instanceId: ProviderInstanceId,
) {
  const store = yield* ProviderCredentialStore.make("phaseo", instanceId);
  const failure = (operation: string, detail: string) =>
    new ProviderSetupError({ instanceId, operation, detail });
  const read = store.get.pipe(
    Effect.flatMap((bytes) =>
      Option.isNone(bytes)
        ? Effect.succeed(Option.none<typeof Credentials.Type>())
        : Effect.try({
            try: () => Option.some(decode(new TextDecoder().decode(bytes.value))),
            catch: () => failure("credentials", "Sign in to Phaseo again."),
          }),
    ),
    Effect.mapError(() => failure("credentials", "Could not read the Phaseo account.")),
  );
  const access = Effect.gen(function* () {
    const saved = yield* read;
    const now = yield* Clock.currentTimeMillis;
    return yield* Option.isSome(saved) && Date.parse(saved.value.expiresAt) > now
      ? Effect.succeed(saved.value)
      : Effect.fail(failure("credentials", "Sign in to Phaseo to connect the gateway."));
  });
  const controller = yield* ProviderAuthFlow.make({
    instanceId,
    credentialBinding: store.binding,
    defaultMethodId: "phaseo-oauth",
    methods: Effect.succeed([
      { id: "phaseo-oauth", name: "Sign in to Phaseo", description: null, type: "agent" },
    ]),
    authenticate: (_method, context) =>
      Effect.gen(function* () {
        const credentials = yield* Effect.tryPromise({
          try: (signal) =>
            signInPhaseo({
              signal,
              openBrowser: (url) =>
                Effect.runPromise(
                  context.setInteraction({
                    type: "browser",
                    id: context.flowId,
                    url,
                    requiresConsent: false,
                  }),
                ),
            }),
          catch: () => failure("authenticate", "Phaseo sign-in failed or expired. Try again."),
        });
        yield* context.verifying;
        const encoded = yield* encode(credentials).pipe(
          Effect.mapError(() => failure("credentials", "Invalid Phaseo credential.")),
        );
        yield* store
          .set(new TextEncoder().encode(encoded))
          .pipe(
            Effect.mapError(() => failure("credentials", "Could not save the Phaseo account.")),
          );
      }),
    logout: store.remove.pipe(
      Effect.mapError(() => failure("logout", "Could not disconnect the Phaseo account.")),
    ),
  });
  return { controller, access };
});
