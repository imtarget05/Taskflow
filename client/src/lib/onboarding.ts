const DISMISS_KEY = 'taskflow-onboarding-dismissed';

/** True when this browser already saw (or skipped) the onboarding. */
export function onboardingDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return true; // storage unavailable → never block the UI
  }
}

/** Persist that the onboarding was seen/skipped on this browser. */
export function dismissOnboarding(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}
