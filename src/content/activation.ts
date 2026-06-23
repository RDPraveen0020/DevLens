export type ApplyFn = (active: boolean) => void;

export interface ActivationGate {
  /** Called from the synchronously-registered background-message listener. */
  request(active: boolean): void;
  /** Called once async init has finished and activation can actually happen. */
  ready(apply: ApplyFn): void;
}

/**
 * Buffers the desired active/inactive state requested by the background script
 * until the content script has finished initializing.
 *
 * The background injects the content script and then immediately sends `activate`.
 * Because init is async (it awaits settings), that first message can arrive before
 * the rest of init has run. Registering the message listener synchronously and
 * routing through this gate means the request is remembered and applied the moment
 * init completes — instead of being dropped, which forced the user to click the
 * toolbar button 2-3 times.
 */
export function createActivationGate(): ActivationGate {
  let desired = false;
  let isReady = false;
  let apply: ApplyFn = () => {};
  return {
    request(active: boolean): void {
      desired = active;
      if (isReady) apply(desired);
    },
    ready(fn: ApplyFn): void {
      apply = fn;
      isReady = true;
      apply(desired);
    },
  };
}
