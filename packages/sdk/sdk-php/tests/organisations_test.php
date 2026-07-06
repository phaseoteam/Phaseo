<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use Phaseo\Sdk\Phaseo;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeOrganisationsClient extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        return [
            "ok" => true,
            "limit" => 2,
            "offset" => 3,
            "total" => 1,
            "organisations" => [
                [
                    "organisation_id" => "org_123",
                    "name" => "Anthropic",
                    "country_code" => "US",
                    "colour" => "#D97706",
                ],
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeOrganisationsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->listOrganisations(["limit" => "2", "offset" => "3"]);
assert_true(($response["ok"] ?? null) === true, "expected ok payload");
assert_true(($response["organisations"][0]["organisation_id"] ?? null) === "org_123", "expected organisation id");
assert_true($fake->calls === [
    ["GET", "/organisations", ["limit" => "2", "offset" => "3"], null, null],
], "expected request call for organisations discovery");

echo "php organisations tests ok" . PHP_EOL;
