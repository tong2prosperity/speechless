import posthog from "posthog-js";
import { listen } from "@tauri-apps/api/event";

declare const __POSTHOG_API_KEY__: string;

const POSTHOG_KEY = typeof __POSTHOG_API_KEY__ !== "undefined" ? __POSTHOG_API_KEY__ : "";
const POSTHOG_HOST = "https://us.i.posthog.com";
const ANONYMOUS_ID_KEY = "anonymous_device_id";

let initialized = false;

function getOrCreateAnonymousId(): string {
  let id = localStorage.getItem(ANONYMOUS_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANONYMOUS_ID_KEY, id);
  }
  return id;
}

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) {
    return;
  }

  const anonymousId = getOrCreateAnonymousId();

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    persistence: "localStorage",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    bootstrap: {
      distinctID: anonymousId,
    },
  });

  initialized = true;

  setupTauriEventListeners();
}

/**
 * Identify a logged-in user. Merges previous anonymous events
 * into this user profile automatically.
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
) {
  if (!initialized) return;
  posthog.identify(userId, properties);
}

/**
 * Reset identity on logout, generating a new anonymous ID.
 */
export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

/**
 * Track a custom event.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

// ─── Tauri event listeners for backend analytics ─────────────

interface TranscriptionStartedPayload {
  binding_id: string;
  always_on_mic: boolean;
}

interface TranscriptionCompletedPayload {
  duration_ms: number;
  char_count: number;
  model_id: string | null;
  post_processed: boolean;
}

interface TranscriptionFailedPayload {
  error: string;
  model_id: string | null;
}

function setupTauriEventListeners() {
  listen<TranscriptionStartedPayload>(
    "analytics:transcription_started",
    (event) => {
      trackEvent("transcription_started", {
        binding_id: event.payload.binding_id,
        always_on_mic: event.payload.always_on_mic,
      });
    },
  );

  listen<TranscriptionCompletedPayload>(
    "analytics:transcription_completed",
    (event) => {
      trackEvent("transcription_completed", {
        duration_ms: event.payload.duration_ms,
        char_count: event.payload.char_count,
        model_id: event.payload.model_id,
        post_processed: event.payload.post_processed,
      });
    },
  );

  listen<TranscriptionFailedPayload>(
    "analytics:transcription_failed",
    (event) => {
      trackEvent("transcription_failed", {
        error: event.payload.error,
        model_id: event.payload.model_id,
      });
    },
  );
}

// ─── Pre-defined event helpers ───────────────────────────────

export function trackAppLaunched() {
  trackEvent("app_launched", {
    platform: navigator.userAgent,
    locale: navigator.language,
  });
}

export function trackModelDownloaded(properties?: {
  model_id?: string;
  model_name?: string;
  size_mb?: number;
}) {
  trackEvent("model_downloaded", properties);
}

export function trackSettingsChanged(properties?: { setting_key?: string }) {
  trackEvent("settings_changed", properties);
}

export function trackOnboardingCompleted() {
  trackEvent("onboarding_completed");
}
