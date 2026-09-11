/**
 * The impure half of the Salah Lock: everything that actually touches Apple's
 * Screen Time stack.
 *
 * The maths is elsewhere and tested — `schedule.ts` (windows and the rolling
 * horizon), `monitor.ts` (the real 20-monitor budget), `shield.ts` (the screen),
 * `prayed.ts` (the state transition). This file only talks to the OS.
 *
 * ## Device-only
 *
 * **None of this works in the simulator.** FamilyControls, DeviceActivity and
 * ManagedSettings all require a real device, and distribution needs Apple's
 * Family Controls entitlement on the app plus all three extension bundle IDs.
 * Every function here fails soft so the rest of the app keeps working on a
 * simulator, and `HANDOFF.md` lists the lock as device-verify.
 */

import Storage from 'expo-sqlite/kv-store';
import * as DeviceActivity from 'react-native-device-activity';

import { isLockAvailable } from './flags';
import { staleActivityNames, toMonitors, type MonitorPlan } from './monitor';
import { planLockSchedules, type DayPrayers, type LockConfig } from './schedule';
import { buildShieldActions, buildShieldConfiguration } from './shield';

/** One id for the user's chosen apps. Referenced by the shield's unblock action. */
export const SELECTION_ID = 'rakat-blocked-apps';

export type LockStatus =
  | { state: 'unavailable'; reason: 'flag' | 'platform' }
  | { state: 'unauthorized' }
  | { state: 'ready'; monitors: number; dropped: number };

/**
 * How long to wait for the Family Controls prompt before giving up.
 *
 * In the simulator the native call neither resolves nor rejects — it simply
 * never comes back — so without this the toggle sits there doing nothing and the
 * user gets no feedback at all. Observed directly during simulator verification.
 * On a real device the prompt answers in well under this.
 */
const AUTH_TIMEOUT_MS = 8000;

export async function requestAuthorization(): Promise<boolean> {
  if (!isLockAvailable()) return false;
  try {
    // `.individual` — a person managing their own device, not a parent managing
    // a child's. Same posture noreeels shipped and defended in App Review.
    const granted = DeviceActivity.requestAuthorization('individual').then(() => true);
    const timedOut = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), AUTH_TIMEOUT_MS),
    );
    return await Promise.race([granted, timedOut]);
  } catch {
    return false;
  }
}

/**
 * Rewrite the lock schedule from scratch.
 *
 * Called on every foreground, which is what keeps the rolling horizon topped
 * up. Registering is idempotent: activity names are derived from the window, so
 * re-registering replaces rather than duplicates, and anything the new plan no
 * longer wants is stopped explicitly.
 */
export async function syncLock(
  days: readonly DayPrayers[],
  config: LockConfig,
  today = new Date(),
): Promise<LockStatus> {
  if (!isLockAvailable()) {
    return { state: 'unavailable', reason: 'platform' };
  }

  const plan = planLockSchedules({ today, days, config });
  const monitorPlan = toMonitors(plan);

  try {
    // Stop ours that are no longer wanted.
    //
    // The library only exposes the registered-activity list through a React
    // hook, which is no use here, so we keep our own record. Activity names are
    // derived from the window, so this list is exactly reproducible and the
    // record can never drift into deleting someone else's activity —
    // `staleActivityNames` also refuses anything not prefixed `rakat.`.
    const previous = await readRegisteredNames();
    for (const name of staleActivityNames(monitorPlan, previous)) {
      DeviceActivity.cleanUpAfterActivity(name);
    }

    await registerMonitors(monitorPlan);
    await writeRegisteredNames(monitorPlan.monitors.map((m) => m.activityName));
    return {
      state: 'ready',
      monitors: monitorPlan.monitors.length,
      dropped: plan.dropped.length + monitorPlan.dropped.length,
    };
  } catch {
    return { state: 'unauthorized' };
  }
}

const REGISTERED_KEY = 'lock.registeredActivities';

async function readRegisteredNames(): Promise<string[]> {
  try {
    const raw = await Storage.getItem(REGISTERED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

async function writeRegisteredNames(names: string[]): Promise<void> {
  try {
    await Storage.setItem(REGISTERED_KEY, JSON.stringify(names));
  } catch {
    // Worst case we fail to clean up a stale monitor next time; the cap logic
    // still holds because re-registering the same name replaces it.
  }
}

async function registerMonitors(plan: MonitorPlan): Promise<void> {
  for (const monitor of plan.monitors) {
    await DeviceActivity.startMonitoring(
      monitor.activityName,
      {
        intervalStart: monitor.intervalStart,
        intervalEnd: monitor.intervalEnd,
        repeats: monitor.repeats,
      },
      [],
    );
  }
}

/**
 * Push the shield's appearance and button behaviour into the App Group.
 *
 * The Shield Configuration extension reads this; it cannot call back into JS.
 * Write it whenever the prayer changes, not once at setup, because the title
 * names the prayer.
 */
export function publishShield(prayerLatin: string): void {
  if (!isLockAvailable()) return;
  try {
    DeviceActivity.updateShield(
      buildShieldConfiguration(prayerLatin),
      buildShieldActions(SELECTION_ID),
    );
  } catch {
    // Simulator, or no authorization yet. The shield is cosmetic until a
    // monitor fires, so failing quietly here is correct.
  }
}

/** Whether a shield is up right now. Used to show the confirmation screen. */
export function isShieldActive(): boolean {
  if (!isLockAvailable()) return false;
  try {
    return DeviceActivity.isShieldActive();
  } catch {
    return false;
  }
}
