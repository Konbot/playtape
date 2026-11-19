/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '*.worklet.js?raw' {
  const src: string;
  export default src;
}

/** True in the one-file build (`vite build --mode single`). */
declare const __SINGLE_FILE__: boolean;
declare const __APP_VERSION__: string;

declare module '*.min.js?raw' {
  const src: string;
  export default src;
}
