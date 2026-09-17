"use client";

import { useSyncExternalStore } from "react";

/**
 * True once the component is running in the browser, false during SSR and the
 * first hydration pass.
 *
 * Dialogs here portal into `document.body`, which does not exist on the
 * server, so they need to know which side they are on. The obvious way to ask
 * — `useState(false)` plus an effect that sets it true — is a cascading render
 * React now flags, and it is the wrong tool anyway: "am I on the client" is a
 * fact about the environment, not a piece of component state.
 *
 * useSyncExternalStore answers it directly. The store never changes, so the
 * subscribe callback has nothing to register; the two snapshot functions are
 * the whole answer, and React picks the right one for the pass it is in.
 */
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function useIsClient(): boolean {
  return useSyncExternalStore(neverChanges, onClient, onServer);
}
