package phaseo

import (
	"context"
	"errors"
	"time"
)

// Page is the language-neutral shape returned by Phaseo list endpoints.
type Page[T any] struct {
	Data    []T
	HasMore bool
}

type PageFetcher[T any] func(ctx context.Context, limit, offset int) (Page[T], error)

// Pager advances using the number of items actually returned, preventing gaps.
type Pager[T any] struct {
	fetch  PageFetcher[T]
	limit  int
	offset int
	done   bool
}

func NewPager[T any](limit, offset int, fetch PageFetcher[T]) *Pager[T] {
	if limit < 1 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	return &Pager[T]{fetch: fetch, limit: limit, offset: offset}
}

func (p *Pager[T]) Next(ctx context.Context) (Page[T], bool, error) {
	if p.done {
		return Page[T]{}, false, nil
	}
	page, err := p.fetch(ctx, p.limit, p.offset)
	if err != nil {
		return Page[T]{}, false, err
	}
	p.offset += len(page.Data)
	p.done = !page.HasMore || len(page.Data) == 0
	return page, true, nil
}

type JobFetcher[T any] func(ctx context.Context, id string) (T, error)
type JobStatus[T any] func(T) string

// JobHandle resumes and waits for an existing asynchronous job without resubmitting it.
type JobHandle[T any] struct {
	Kind   string
	ID     string
	fetch  JobFetcher[T]
	status JobStatus[T]
}

func NewJobHandle[T any](kind, id string, fetch JobFetcher[T], status JobStatus[T]) *JobHandle[T] {
	return &JobHandle[T]{Kind: kind, ID: id, fetch: fetch, status: status}
}

func (h *JobHandle[T]) Refresh(ctx context.Context) (T, error) { return h.fetch(ctx, h.ID) }

func (h *JobHandle[T]) Wait(ctx context.Context, interval time.Duration) (T, error) {
	if interval <= 0 {
		interval = time.Second
	}
	var zero T
	for {
		value, err := h.Refresh(ctx)
		if err != nil {
			return zero, err
		}
		switch h.status(value) {
		case "completed":
			return value, nil
		case "failed", "cancelled", "canceled", "expired":
			return value, errors.New("phaseo job reached a non-success terminal state")
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return zero, ctx.Err()
		case <-timer.C:
		}
	}
}
