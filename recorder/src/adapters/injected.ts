import { Recorder } from '../core/recorder';

// Thin edge adapter: the core Recorder has no idea it's running from a
// pasted <script> tag. Swapping this file for an extension content-script
// entry point later doesn't touch core/ at all.
declare global {
  interface Window {
    __recorder?: Recorder;
  }
}

const recorder = window.__recorder ?? new Recorder();
window.__recorder = recorder;
recorder.start();

console.log('[recorder] capture started — window.__recorder.getSteps()');
