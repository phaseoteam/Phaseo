package phaseo

import (
	"context"
	"testing"
	"time"
)

func TestPagerAndJobHandle(t *testing.T) {
	var offsets []int
	pager := NewPager(2, 0, func(_ context.Context, limit, offset int) (Page[int], error) {
		offsets = append(offsets, offset)
		if offset == 0 {
			return Page[int]{Data: []int{1, 2}, HasMore: true}, nil
		}
		return Page[int]{Data: []int{3}}, nil
	})
	if page, ok, err := pager.Next(context.Background()); err != nil || !ok || len(page.Data) != 2 {
		t.Fatalf("unexpected first page: %#v %v %v", page, ok, err)
	}
	if page, ok, err := pager.Next(context.Background()); err != nil || !ok || len(page.Data) != 1 {
		t.Fatalf("unexpected second page: %#v %v %v", page, ok, err)
	}
	if _, ok, _ := pager.Next(context.Background()); ok {
		t.Fatal("expected pagination to stop")
	}
	if offsets[1] != 2 {
		t.Fatalf("expected offset 2, got %d", offsets[1])
	}

	statuses := []string{"running", "completed"}
	handle := NewJobHandle("video", "video_1", func(_ context.Context, _ string) (string, error) {
		value := statuses[0]
		statuses = statuses[1:]
		return value, nil
	}, func(value string) string { return value })
	result, err := handle.Wait(context.Background(), time.Millisecond)
	if err != nil || result != "completed" {
		t.Fatalf("unexpected result %q: %v", result, err)
	}
}
