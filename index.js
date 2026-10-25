/**
 * Host half of the tab-status-light bundle.
 *
 * The browser half owns the whole feature: it subscribes to the Client
 * session-status source and swaps the document favicon. This half exists only
 * so the Loader has a Host row for the bundle, so it registers nothing.
 */
export function apply() {}
