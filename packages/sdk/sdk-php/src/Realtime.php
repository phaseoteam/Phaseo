<?php
declare(strict_types=1);

// Realtime voice sessions over the Phaseo relay WebSocket.
// $client->realtime()->connect() creates the session, opens the relay socket and waits for
// relay.connected. Provider events pass through unchanged as arrays, and end() returns the
// session.ended final bill. The socket uses the optional phrity/websocket package.

namespace Phaseo\Sdk;

use RuntimeException;

/** The socket the session reads and writes. The default wraps phrity/websocket. */
interface RealtimeConnection
{
    public function sendText(string $text): void;

    /** Next text message; null once the socket has closed; false when $timeout seconds pass first. */
    public function receiveText(float $timeout): string|null|false;

    public function close(int $code, string $reason): void;

    public function closeCode(): ?int;
}

/**
 * The socket closed, or end() timed out, without session.ended. The call is still billed;
 * getFinalBillPath() returns the cost once it is settled.
 */
final class RealtimeSessionClosedException extends RuntimeException
{
    public function __construct(
        private string $sessionId,
        private ?int $closeCode = null,
        ?string $detail = null
    ) {
        $detail ??= "closed (code " . ($closeCode ?? "none") . ")";
        parent::__construct(
            "Realtime session {$sessionId} {$detail} without session.ended. The call is still billed; fetch the final bill with GET "
            . Realtime::finalBillPath($sessionId)
        );
    }

    public function getSessionId(): string
    {
        return $this->sessionId;
    }

    public function getCloseCode(): ?int
    {
        return $this->closeCode;
    }

    /** /v1/generations?id=realtime%3A<session_id>; send it as a GET. */
    public function getFinalBillPath(): string
    {
        return Realtime::finalBillPath($this->sessionId);
    }
}

/** $client->realtime(): realtime voice sessions (beta). */
final class Realtime
{
    // The relay echoes this protocol back; WebSocket clients need one selected.
    public const RELAY_PROTOCOL = "statsync-realtime";

    /** @var callable|null */
    private $connector;

    /**
     * @param callable|null $connector fn(string $url, array $protocols, float $timeout): RealtimeConnection
     */
    public function __construct(private Phaseo $client, private string $basePath, ?callable $connector = null)
    {
        $this->connector = $connector;
    }

    public static function finalBillPath(string $sessionId): string
    {
        return "/v1/generations?id=" . rawurlencode("realtime:" . $sessionId);
    }

    /** Resolves the session's connect.url against the base URL as ws:// or wss://. */
    public static function relayUrl(string $basePath, string $connectUrl): string
    {
        if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $connectUrl)) {
            $url = $connectUrl;
        } else {
            $parts = parse_url($basePath);
            $origin = $parts["scheme"] . "://" . $parts["host"] . (isset($parts["port"]) ? ":" . $parts["port"] : "");
            $url = str_starts_with($connectUrl, "/") ? $origin . $connectUrl : rtrim($basePath, "/") . "/" . $connectUrl;
        }
        return (string) preg_replace(['#^https://#i', '#^http://#i'], ['wss://', 'ws://'], $url);
    }

    /**
     * Creates the session (model, and optionally voice, instructions, provider, metadata),
     * opens the relay socket and waits up to $connectTimeout seconds for relay.connected.
     *
     * @param array<string, mixed> $params
     */
    public function connect(array $params, float $connectTimeout = 30.0): RealtimeSession
    {
        if (!isset($params["model"]) || !is_string($params["model"]) || trim($params["model"]) === "") {
            throw new \InvalidArgumentException("model is required");
        }
        $info = $this->client->rawClient()->request("POST", "/audio/realtime/sessions", null, null, $params);
        $secret = (string) ($info["client_secret"] ?? "");
        $sessionId = (string) ($info["session_id"] ?? $info["id"] ?? "");
        $connectUrl = (string) ($info["connect"]["url"] ?? "");
        if ($secret === "" || $sessionId === "" || $connectUrl === "") {
            throw new RuntimeException("Realtime session response is missing session_id, client_secret or connect.url");
        }
        $connector = $this->connector ?? [PhrityRealtimeConnection::class, "open"];
        $connection = $connector(self::relayUrl($this->basePath, $connectUrl), [self::RELAY_PROTOCOL, "rtsec." . $secret], $connectTimeout);
        $session = new RealtimeSession($sessionId, $info, $connection);
        try {
            $session->waitForConnected($connectTimeout);
        } catch (\Throwable $error) {
            // The caller never gets the session, so close the socket here or the metered call keeps running.
            $session->close();
            throw $error;
        }
        return $session;
    }
}

/**
 * A connected realtime voice call. PHP is single-threaded, so events are read when you call
 * receive(), iterate events(), or call end(); listeners run as each event is read.
 */
final class RealtimeSession
{
    /** @var array<string, mixed> */
    private array $info;
    /** @var array<string, array<int, callable>> */
    private array $listeners = [];
    private int $nextListener = 0;
    /** @var array<string, mixed>|null */
    private ?array $ended = null;
    private ?RealtimeSessionClosedException $closedError = null;

    /** @param array<string, mixed> $info */
    public function __construct(private string $id, array $info, private RealtimeConnection $connection)
    {
        unset($info["client_secret"], $info["clientSecret"]);
        $this->info = $info;
    }

    public function id(): string
    {
        return $this->id;
    }

    /** @return array<string, mixed> The create-session response, without client_secret. */
    public function info(): array
    {
        return $this->info;
    }

    /** Sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google) as client.audio. */
    public function sendAudio(string $pcm16): void
    {
        $this->send(["type" => "client.audio", "audio" => base64_encode($pcm16)]);
    }

    /** @param array<string, mixed> $event Any event, sent as JSON, for provider-specific messages. */
    public function send(array $event): void
    {
        if ($this->isFinished()) {
            throw new RuntimeException("Realtime session {$this->id} is not open");
        }
        $this->connection->sendText(json_encode($event, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
    }

    /** Subscribes to one event type, or every event with "*". Returns a closure that unsubscribes. */
    public function on(string $type, callable $listener): \Closure
    {
        $id = $this->nextListener++;
        $this->listeners[$type][$id] = $listener;
        return function () use ($type, $id): void {
            unset($this->listeners[$type][$id]);
        };
    }

    public function onWarning(callable $listener): \Closure
    {
        return $this->on("session.warning", $listener);
    }

    public function onEnded(callable $listener): \Closure
    {
        return $this->on("session.ended", $listener);
    }

    /**
     * Reads the next event, waiting up to $timeout seconds. Returns null when the socket has
     * closed or the timeout passed.
     *
     * @return array<string, mixed>|null
     */
    public function receive(float $timeout = 60.0): ?array
    {
        $deadline = microtime(true) + $timeout;
        while (!$this->isClosed()) {
            $remaining = $deadline - microtime(true);
            if ($remaining <= 0) {
                return null;
            }
            $text = $this->connection->receiveText($remaining);
            if ($text === false) {
                return null;
            }
            if ($text === null) {
                $this->fail(new RealtimeSessionClosedException($this->id, $this->connection->closeCode()));
                return null;
            }
            $event = $this->dispatch($text);
            if ($event !== null) {
                return $event;
            }
        }
        return null;
    }

    /**
     * Yields every event until the socket closes.
     *
     * @return \Generator<int, array<string, mixed>>
     */
    public function events(): \Generator
    {
        while (($event = $this->receive(86400.0)) !== null) {
            yield $event;
        }
    }

    /**
     * Sends session.end and returns session.ended: reason, initiated_by, duration_seconds, usage, cost,
     * billing_status and, unless settled, final_bill. Events read while waiting go to your listeners.
     *
     * @return array<string, mixed>
     * @throws RealtimeSessionClosedException if the socket closes, or $timeout passes, without it
     */
    public function end(?string $reason = null, ?bool $cancelResponse = null, float $timeout = 60.0): array
    {
        if (!$this->isFinished()) {
            $message = ["type" => "session.end"];
            if ($reason !== null) {
                $message["reason"] = $reason;
            }
            if ($cancelResponse !== null) {
                $message["cancel_response"] = $cancelResponse;
            }
            try {
                $this->send($message);
            } catch (\Throwable) {
                // The socket is closing; reading below reports how it ended.
            }
            $deadline = microtime(true) + $timeout;
            while (!$this->isFinished() && microtime(true) < $deadline) {
                $this->receive(max(0.001, $deadline - microtime(true)));
            }
            if (!$this->isFinished()) {
                $this->fail(new RealtimeSessionClosedException($this->id, null, "timed out after {$timeout} s"));
                $this->close();
            }
        }
        if ($this->ended !== null) {
            return $this->ended;
        }
        throw $this->closedError;
    }

    /** Closes the socket without waiting for the bill. The call is still billed; prefer end(). */
    public function close(): void
    {
        try {
            $this->connection->close(1000, "client_closed");
        } catch (\Throwable) {
            // Already closing.
        }
    }

    /** @internal */
    public function waitForConnected(float $timeout): void
    {
        $deadline = microtime(true) + $timeout;
        while (microtime(true) < $deadline) {
            $event = $this->receive($deadline - microtime(true));
            if ($event !== null && $event["type"] === "relay.connected") {
                return;
            }
            if ($this->ended !== null) {
                throw new RuntimeException("Realtime session {$this->id} ended before connecting: " . ($this->ended["reason"] ?? ""));
            }
            if ($this->closedError !== null) {
                throw $this->closedError;
            }
        }
        $this->close();
        throw new RuntimeException("Realtime session {$this->id} did not connect within {$timeout} s");
    }

    private function isFinished(): bool
    {
        return $this->ended !== null || $this->closedError !== null;
    }

    private function isClosed(): bool
    {
        return $this->closedError !== null;
    }

    /** @return array<string, mixed>|null */
    private function dispatch(string $text): ?array
    {
        $event = json_decode($text, true);
        if (!is_array($event) || !isset($event["type"]) || !is_string($event["type"])) {
            return null;
        }
        // Record the bill before listeners run, so a throwing listener can't make end() lose it.
        if ($event["type"] === "session.ended" && !$this->isFinished()) {
            $this->ended = $event;
        }
        foreach ([$event["type"], "*"] as $key) {
            foreach ($this->listeners[$key] ?? [] as $listener) {
                try {
                    $listener($event);
                } catch (\Throwable) {
                    // Listener errors must not break the session.
                }
            }
        }
        return $event;
    }

    private function fail(RealtimeSessionClosedException $error): void
    {
        if ($this->closedError === null) {
            $this->closedError = $error;
        }
    }
}

/** RealtimeConnection over phrity/websocket (composer require phrity/websocket). */
final class PhrityRealtimeConnection implements RealtimeConnection
{
    private ?int $closeCode = null;

    private function __construct(private object $client)
    {
    }

    /** @param array<int, string> $protocols */
    public static function open(string $url, array $protocols, float $timeout): self
    {
        if (!class_exists(\WebSocket\Client::class)) {
            throw new RuntimeException(
                "Realtime sessions need the phrity/websocket package. Install it with: composer require phrity/websocket"
            );
        }
        $client = new \WebSocket\Client($url);
        $client->setTimeout($timeout);
        $client->addMiddleware(new \WebSocket\Middleware\CloseHandler());
        $client->addMiddleware(new \WebSocket\Middleware\PingResponder());
        $client->addMiddleware(new \WebSocket\Middleware\SubprotocolNegotiation($protocols, true));
        $client->connect();
        return new self($client);
    }

    public function sendText(string $text): void
    {
        $this->client->text($text);
    }

    public function receiveText(float $timeout): string|null|false
    {
        $this->client->setTimeout(max(0.001, $timeout));
        while (true) {
            if (!$this->client->isConnected()) {
                return null;
            }
            try {
                $message = $this->client->receive();
            } catch (\WebSocket\Exception\ConnectionTimeoutException) {
                return false;
            } catch (\WebSocket\Exception\Exception) {
                return null;
            }
            if ($message instanceof \WebSocket\Message\Text) {
                return $message->getContent();
            }
            if ($message instanceof \WebSocket\Message\Close) {
                $this->closeCode = $message->getCloseStatus();
                return null;
            }
        }
    }

    public function close(int $code, string $reason): void
    {
        if ($this->client->isConnected()) {
            $this->client->close($code, $reason);
        }
    }

    public function closeCode(): ?int
    {
        return $this->closeCode;
    }
}
