<?php
declare(strict_types=1);

namespace Phaseo\Sdk;

use IteratorAggregate;
use RuntimeException;
use Traversable;

final class PageIterator implements IteratorAggregate
{
    public function __construct(
        private $fetchPage,
        private int $limit = 50,
        private int $offset = 0,
    ) {
        $this->limit = max(1, $this->limit);
        $this->offset = max(0, $this->offset);
    }

    public function getIterator(): Traversable
    {
        $offset = $this->offset;
        while (true) {
            $page = ($this->fetchPage)($this->limit, $offset);
            yield $page;
            $items = is_array($page['data'] ?? null) ? $page['data'] : [];
            if (!($page['has_more'] ?? false) || count($items) === 0) return;
            $offset += count($items);
        }
    }
}

final class JobHandle
{
    public function __construct(
        public readonly string $kind,
        public readonly string $id,
        private $fetch,
        private $status,
    ) {
        if (trim($id) === '') throw new \InvalidArgumentException('Job ID is required');
    }

    public function refresh(): array
    {
        return ($this->fetch)($this->id);
    }

    public function wait(float $intervalSeconds = 1.0, ?float $timeoutSeconds = null): array
    {
        $deadline = $timeoutSeconds === null ? null : microtime(true) + $timeoutSeconds;
        while (true) {
            $value = $this->refresh();
            $status = strtolower((string) ($this->status)($value));
            if ($status === 'completed') return $value;
            if (in_array($status, ['failed', 'cancelled', 'canceled', 'expired'], true)) {
                throw new RuntimeException("{$this->kind} job {$this->id} ended with status {$status}");
            }
            if ($deadline !== null && microtime(true) >= $deadline) throw new RuntimeException('Timed out waiting for Phaseo job');
            usleep((int) (max(0.001, $intervalSeconds) * 1_000_000));
        }
    }
}
