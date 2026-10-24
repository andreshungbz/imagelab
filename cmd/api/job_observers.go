package main

import "sync"

// jobObserverRegistry tracks the active SSE observers for each job.
// It sends wake-up signals only; observers reread authoritative state from PostgreSQL.
type jobObserverRegistry struct {
	mu          sync.Mutex
	subscribers map[string]map[chan struct{}]struct{}
}

// newJobObserverRegistry creates an empty registry for active SSE connections.
func newJobObserverRegistry() *jobObserverRegistry {
	return &jobObserverRegistry{subscribers: make(map[string]map[chan struct{}]struct{})}
}

// subscribe registers one observer and returns its private update channel and cleanup function.
func (r *jobObserverRegistry) subscribe(jobID string) (<-chan struct{}, func()) {
	// SYNC-02: Each active SSE handler receives a private channel so all observers are notified.
	updates := make(chan struct{}, 1)

	// Create the job entry if it doesn't exist and add the observer to the map.
	r.mu.Lock()
	if r.subscribers[jobID] == nil {
		r.subscribers[jobID] = make(map[chan struct{}]struct{})
	}
	r.subscribers[jobID][updates] = struct{}{}
	r.mu.Unlock()

	return updates, func() {
		// SYNC-06: Remove the observer and discard empty job entries on every handler exit.
		r.mu.Lock()
		if subscribers := r.subscribers[jobID]; subscribers != nil {
			delete(subscribers, updates)
			if len(subscribers) == 0 {
				delete(r.subscribers, jobID)
			}
		}
		r.mu.Unlock()
	}
}

// notify wakes every observer for a job without blocking on slow consumers.
func (r *jobObserverRegistry) notify(jobID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// SYNC-02: Every active observer/subscriber gets notified of the job.
	for updates := range r.subscribers[jobID] {
		select {
		case updates <- struct{}{}:
		default:
			// If the channel is full, skip notification.
		}
	}
}
