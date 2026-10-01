<?php
require_once __DIR__ . '/../src/index.php';

use Phaseo\Sdk\JobHandle;
use Phaseo\Sdk\PageIterator;

$offsets = [];
$pages = new PageIterator(function (int $limit, int $offset) use (&$offsets): array {
    $offsets[] = $offset;
    return $offset === 0 ? ['data' => [1, 2], 'has_more' => true] : ['data' => [3], 'has_more' => false];
}, 2);
$items = [];
foreach ($pages as $page) $items = [...$items, ...$page['data']];
assert($items === [1, 2, 3]);
assert($offsets === [0, 2]);

$statuses = ['running', 'completed'];
$job = new JobHandle('video', 'video_1', fn () => ['status' => array_shift($statuses)], fn (array $value) => $value['status']);
assert($job->wait(0.001, 1)['status'] === 'completed');
echo "workflows ok\n";
