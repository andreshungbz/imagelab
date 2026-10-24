package main

import (
	"testing"
	"time"
)

func TestJobObserverRegistryFanOutAndCoalescing(t *testing.T) {
	// SYNC-02/SYNC-05: Every observer receives a signal while repeated signals coalesce.
	registry := newJobObserverRegistry()
	first, unsubscribeFirst := registry.subscribe("job-1")
	defer unsubscribeFirst()
	second, unsubscribeSecond := registry.subscribe("job-1")
	defer unsubscribeSecond()

	registry.notify("job-1")
	registry.notify("job-1")

	for name, updates := range map[string]<-chan struct{}{
		"first":  first,
		"second": second,
	} {
		select {
		case <-updates:
		case <-time.After(time.Second):
			t.Fatalf("%s observer did not receive a notification", name)
		}
		select {
		case <-updates:
			t.Fatalf("%s observer received a duplicate pending notification", name)
		default:
		}
	}
}

func TestJobObserverRegistryUnsubscribe(t *testing.T) {
	// SYNC-06: An observer that disconnects receives no later notifications.
	registry := newJobObserverRegistry()
	updates, unsubscribe := registry.subscribe("job-1")
	unsubscribe()
	registry.notify("job-1")

	select {
	case <-updates:
		t.Fatal("unsubscribed observer received a notification")
	default:
	}
}
