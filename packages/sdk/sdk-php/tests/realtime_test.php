<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use Phaseo\Sdk\Phaseo;
use Phaseo\Sdk\Realtime;
use Phaseo\Sdk\RealtimeConnection;
use Phaseo\Sdk\RealtimeSessionClosedException;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

const ENDED = [
    "type" => "session.ended", "session_id" => "rt_test", "reason" => "client_requested", "initiated_by" => "client",
    "duration_seconds" => 12.5, "usage" => ["output_audio_tokens" => 200],
    "cost" => ["total_usd" => 0.01, "total_nanos" => 10000000, "estimated" => false, "estimate_basis" => null,
        "debt_nanos" => 0, "uncollected_nanos" => 0, "currency" => "USD"],
    "billing_status" => "settled",
];

/** In-memory relay socket: records what the session sends; $onSend plays the relay. */
final class FakeRelayConnection implements RealtimeConnection
{
    public array $sent = [];
    public array $inbox = [];
    public ?array $closedWith = null;
    public ?int $code = null;
    /** @var callable|null */
    public $onSend = null;

    public function __construct(public string $url, public array $protocols)
    {
        $this->inbox[] = json_encode(["type" => "relay.connected", "session_id" => "rt_test"]);
    }

    public function sendText(string $text): void
    {
        $message = json_decode($text, true);
        $this->sent[] = $message;
        if ($this->onSend) {
            ($this->onSend)($message, $this);
        }
    }

    public function receiveText(float $timeout): string|null|false
    {
        if ($this->inbox === []) {
            usleep((int) (min($timeout, 0.01) * 1000000));
            return false;
        }
        return array_shift($this->inbox);
    }

    public function close(int $code, string $reason): void
    {
        $this->closedWith = [$code, $reason];
        $this->inbox[] = null;
    }

    public function closeCode(): ?int
    {
        return $this->code;
    }

    public function serverClose(int $code): void
    {
        $this->code = $code;
        $this->inbox[] = null;
    }
}

final class FakeRealtimeHttp extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $body];
        return [
            "id" => "rt_test", "session_id" => "rt_test", "client_secret" => "rtsec_secret",
            "connect" => ["transport" => "websocket", "url" => "/v1/realtime/sessions/rt_test/relay"],
            "max_duration_seconds" => 3600,
        ];
    }
}

function connect_fake(?FakeRealtimeHttp &$http, ?FakeRelayConnection &$socket)
{
    $client = new Phaseo(apiKey: "test", basePath: "https://api.phaseo.app/v1", enableDeprecationWarnings: false);
    $http = new FakeRealtimeHttp();
    $prop = (new ReflectionClass($client))->getProperty("client");
    $prop->setAccessible(true);
    $prop->setValue($client, $http);
    $realtime = new Realtime($client, "https://api.phaseo.app/v1", function (string $url, array $protocols) use (&$socket) {
        return $socket = new FakeRelayConnection($url, $protocols);
    });
    return $realtime->connect(["model" => "openai/gpt-realtime-2", "voice" => "marin"], 1.0);
}

// connect, audio, events, warnings and end
$session = connect_fake($http, $socket);
assert_true($http->calls === [["POST", "/audio/realtime/sessions", ["model" => "openai/gpt-realtime-2", "voice" => "marin"]]], "create call");
assert_true($socket->url === "wss://api.phaseo.app/v1/realtime/sessions/rt_test/relay", "relay url: " . $socket->url);
assert_true($socket->protocols === ["statsync-realtime", "rtsec.rtsec_secret"], "protocols");
assert_true($session->id() === "rt_test" && !isset($session->info()["client_secret"]), "session info");
$warnings = [];
$session->onWarning(function (array $event) use (&$warnings) {
    $warnings[] = $event;
});
$session->sendAudio("\x00\x01\x02\xff");
assert_true($socket->sent[0] === ["type" => "client.audio", "audio" => "AAEC/w=="], "audio message");
$socket->inbox[] = json_encode(["type" => "response.output_audio.delta", "delta" => "AAA="]);
$socket->inbox[] = json_encode(["type" => "session.warning", "code" => "max_duration_approaching", "seconds_remaining" => 120]);
$types = [];
foreach ($session->events() as $event) {
    $types[] = $event["type"];
    if (count($types) === 2) {
        break;
    }
}
assert_true($types === ["response.output_audio.delta", "session.warning"], "event order");
assert_true(($warnings[0]["seconds_remaining"] ?? null) === 120, "warning listener");
$socket->onSend = function (array $message, FakeRelayConnection $relay): void {
    if ($message["type"] === "session.end") {
        $relay->inbox[] = json_encode(ENDED);
        $relay->serverClose(1000);
    }
};
$ended = $session->end("caller hung up", false, 5.0);
assert_true($ended["reason"] === "client_requested" && $ended["cost"]["total_usd"] === 0.01, "final bill");
assert_true(end($socket->sent) === ["type" => "session.end", "reason" => "caller hung up", "cancel_response" => false], "end message");
assert_true($session->end() === $ended, "end is idempotent");

// a throwing listener neither escapes nor loses the final bill
$session = connect_fake($http, $socket);
$session->onEnded(function (array $event): void {
    throw new RuntimeException("listener failed");
});
$after = [];
$session->on("*", function (array $event) use (&$after): void {
    $after[] = $event["type"];
});
$socket->onSend = function (array $message, FakeRelayConnection $relay): void {
    if ($message["type"] === "session.end") {
        $relay->inbox[] = json_encode(ENDED);
        $relay->serverClose(1000);
    }
};
$ended = $session->end(null, null, 5.0);
assert_true($ended["billing_status"] === "settled", "bill kept despite throwing listener");
assert_true($after === ["session.ended"], "later listeners still run");

// closed without session.ended
$session = connect_fake($http, $socket);
$socket->onSend = function (array $message, FakeRelayConnection $relay): void {
    if ($message["type"] === "session.end") {
        $relay->serverClose(1011);
    }
};
try {
    $session->end();
    throw new RuntimeException("expected RealtimeSessionClosedException");
} catch (RealtimeSessionClosedException $error) {
    assert_true($error->getCloseCode() === 1011, "close code");
    assert_true($error->getFinalBillPath() === "/v1/generations?id=realtime%3Art_test", "final bill path");
    assert_true(str_contains($error->getMessage(), "GET /v1/generations?id=realtime%3Art_test"), "message");
}

// end timeout closes the socket
$session = connect_fake($http, $socket);
try {
    $session->end(null, null, 0.05);
    throw new RuntimeException("expected timeout");
} catch (RealtimeSessionClosedException $error) {
    assert_true(str_contains($error->getMessage(), "timed out after 0.05 s"), "timeout message");
    assert_true($socket->closedWith === [1000, "client_closed"], "socket closed on timeout");
}

// relay URL resolution
assert_true(Realtime::relayUrl("http://localhost:8787/v1", "/v1/realtime/sessions/rt_x/relay") === "ws://localhost:8787/v1/realtime/sessions/rt_x/relay", "local relay url");

// without phrity/websocket the error says how to install it
if (!class_exists(\WebSocket\Client::class)) {
    try {
        \Phaseo\Sdk\PhrityRealtimeConnection::open("wss://example.test", [], 1.0);
        throw new RuntimeException("expected missing package error");
    } catch (RuntimeException $error) {
        assert_true(str_contains($error->getMessage(), "composer require phrity/websocket"), "install hint");
    }
}

echo "php realtime tests ok" . PHP_EOL;
