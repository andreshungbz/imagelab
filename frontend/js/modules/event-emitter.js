// createEmitter implements an emitter for the Observer Pattern API using a map of
// event strings to an arrays of callback functions.
function createEmitter() {
  const listeners = new Map();

  // on subscribes a callback function to an event.
  function on(event, callback) {
    // if event doesn't exist, create it in the Map
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event).push(callback);
  }

  // emit publishes/notifies an event, calling each callback function
  // with the passed in data.
  function emit(event, data) {
    if (!listeners.has(event)) {
      return;
    }
    listeners.get(event).forEach((cb) => cb(data));
  }

  // off unsubscribes a callback function from an event.
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
