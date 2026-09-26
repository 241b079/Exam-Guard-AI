'use client';

/**
 * Shared in-memory media stream manager
 * Preserves camera and screen share streams during client-side navigation
 * between exam onboarding (ExamMediaSetupStep) and the live examination page.
 */

class ExamMediaManager {
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private isRequestingScreenFlag: boolean = false;
  private preserveOnUnmount: boolean = false;

  public setPreserveOnUnmount(val: boolean) {
    this.preserveOnUnmount = val;
  }

  public shouldPreserve(): boolean {
    return this.preserveOnUnmount;
  }

  public setIsRequestingScreen(val: boolean) {
    this.isRequestingScreenFlag = val;
  }

  public isRequestingScreen(): boolean {
    return this.isRequestingScreenFlag;
  }

  public setActiveStreams(camera: MediaStream | null, screen: MediaStream | null) {
    if (camera) {
      this.cameraStream = camera;
    }
    if (screen) {
      this.screenStream = screen;
    }
  }

  public getActiveCameraStream(): MediaStream | null {
    if (typeof window === 'undefined' || !this.cameraStream) return null;
    const hasLiveTrack = this.cameraStream.getTracks().some((t) => t.readyState === 'live');
    if (!hasLiveTrack) {
      this.cameraStream = null;
      return null;
    }
    return this.cameraStream;
  }

  public getActiveScreenStream(): MediaStream | null {
    if (typeof window === 'undefined' || !this.screenStream) return null;
    const hasLiveVideoTrack = this.screenStream.getVideoTracks().some((t) => t.readyState === 'live');
    if (!hasLiveVideoTrack) {
      this.screenStream = null;
      return null;
    }
    return this.screenStream;
  }

  public clearAll() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      this.cameraStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      this.screenStream = null;
    }

    this.preserveOnUnmount = false;
    this.isRequestingScreenFlag = false;
  }
}

export const examMediaManager = new ExamMediaManager();
