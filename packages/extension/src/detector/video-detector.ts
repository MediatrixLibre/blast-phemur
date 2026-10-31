/**
 * Video element detector.
 *
 * Uses MutationObserver to find <video> elements on any page,
 * including those dynamically injected by SPAs. Supports shadow DOM
 * traversal for Apple TV+ and similar providers.
 */

export interface VideoDetectorCallbacks {
  onVideoFound(video: HTMLVideoElement): void;
  onVideoRemoved(video: HTMLVideoElement): void;
}

export class VideoDetector {
  private callbacks: VideoDetectorCallbacks;
  private observer: MutationObserver | null = null;
  private trackedVideos = new Set<HTMLVideoElement>();
  private shadowObservers = new Map<ShadowRoot, MutationObserver>();

  constructor(callbacks: VideoDetectorCallbacks) {
    this.callbacks = callbacks;
  }

  /** Start scanning for video elements */
  start(): void {
    // Scan existing DOM
    this.scanNode(document.body);

    // Watch for future additions/removals
    this.observer = new MutationObserver(this.onMutation);
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /** Stop watching and clean up */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const [, obs] of this.shadowObservers) {
      obs.disconnect();
    }
    this.shadowObservers.clear();
    this.trackedVideos.clear();
  }

  private onMutation = (mutations: MutationRecord[]): void => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          this.scanNode(node);
        }
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof HTMLVideoElement) {
          this.handleRemoved(node);
        }
        if (node instanceof HTMLElement) {
          // Check if removed subtree contained tracked videos
          for (const video of this.trackedVideos) {
            if (!document.contains(video)) {
              this.handleRemoved(video);
            }
          }
        }
      }
    }
  };

  /**
   * Recursively scan a DOM node for video elements.
   * Enters shadow roots to find videos in custom elements
   * (e.g., Apple TV+'s apple-tv-plus-player).
   */
  private scanNode(node: Node): void {
    if (node instanceof HTMLVideoElement) {
      this.handleFound(node);
      return;
    }

    if (node instanceof HTMLElement) {
      // Direct children
      const videos = node.querySelectorAll('video');
      for (const video of videos) {
        this.handleFound(video);
      }

      // Shadow DOM traversal
      if (node.shadowRoot) {
        this.observeShadowRoot(node.shadowRoot);
        this.scanNode(node.shadowRoot as unknown as Node);
      }

      // Check for known shadow DOM host elements
      // Apple TV+: apple-tv-plus-player > amp-video-player-internal > amp-video-player
      for (const child of node.querySelectorAll('*')) {
        if (child.shadowRoot) {
          this.observeShadowRoot(child.shadowRoot);
          this.scanNode(child.shadowRoot as unknown as Node);
        }
      }
    }
  }

  /** Observe a shadow root for video elements being added/removed */
  private observeShadowRoot(shadowRoot: ShadowRoot): void {
    if (this.shadowObservers.has(shadowRoot)) return;

    const obs = new MutationObserver(this.onMutation);
    obs.observe(shadowRoot, { childList: true, subtree: true });
    this.shadowObservers.set(shadowRoot, obs);

    // Scan existing content
    const videos = shadowRoot.querySelectorAll('video');
    for (const video of videos) {
      this.handleFound(video);
    }
  }

  private handleFound(video: HTMLVideoElement): void {
    if (this.trackedVideos.has(video)) return;
    this.trackedVideos.add(video);
    this.callbacks.onVideoFound(video);
  }

  private handleRemoved(video: HTMLVideoElement): void {
    if (!this.trackedVideos.has(video)) return;
    this.trackedVideos.delete(video);
    this.callbacks.onVideoRemoved(video);
  }
}
