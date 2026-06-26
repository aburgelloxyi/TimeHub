// Tiny global toast store so notify() can be called from anywhere (hooks,
// utilities, components) and a single <ToastHost/> renders them top-right.
let listeners = [];
let counter = 0;

export function notify(message, type = "error") {
  const toast = { id: ++counter, message, type };
  listeners.forEach((fn) => fn(toast));
  return toast.id;
}

export function subscribeToasts(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
