// ==================================================================================== //
// EVENT BUS
// ==================================================================================== //

// createEmitter implements the small observer bus used to decouple UI events from
// network and rendering modules. Events carry state transitions, not DOM elements.
function createEmitter() {
  const listeners = new Map();

  // on subscribes a callback to an event name.
  function on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event).push(callback);
  }

  // emit publishes an event to every listener registered for that name.
  function emit(event, data) {
    if (!listeners.has(event)) {
      return;
    }
    listeners.get(event).forEach((cb) => cb(data));
  }

  // off removes one callback without affecting the other subscribers.
  function off(event, callback) {
    if (!listeners.has(event)) {
      return;
    }
    listeners.set(
      event,
      listeners.get(event).filter((cb) => cb !== callback),
    );
  }

  return { on, emit, off };
}

export const emitter = createEmitter();
