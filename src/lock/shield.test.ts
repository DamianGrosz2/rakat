import { describe, expect, it } from 'vitest';

import { light } from '../theme/tokens.ts';
import {
  buildShieldActions,
  buildShieldConfiguration,
  hexToUIColor,
  shieldCopy,
} from './shield.ts';

describe('hex to UIColor', () => {
  it('converts to 0-255 channels, which is what the bridge wants', () => {
    expect(hexToUIColor('#15564A')).toEqual({ red: 0x15, green: 0x56, blue: 0x4a, alpha: 1 });
  });

  it('carries alpha through', () => {
    expect(hexToUIColor('#FFFFFF', 0.8).alpha).toBe(0.8);
  });

  it('tolerates a missing hash', () => {
    expect(hexToUIColor('15564A')).toEqual(hexToUIColor('#15564A'));
  });
});

describe('the shield takes its colours from the design tokens', () => {
  // The shield extension is a separate process with no access to the JS theme,
  // so it is the easiest place in the codebase for a stray hardcoded green to
  // survive unnoticed. This is what notices.
  const config = buildShieldConfiguration('Maghrib');

  it('paints the accent field', () => {
    expect(config.backgroundColor).toEqual(hexToUIColor(light.accent));
  });

  it('uses accentInk for text on that field, never a hardcoded white', () => {
    expect(config.titleColor).toEqual(hexToUIColor(light.accentInk));
    expect(config.titleColor).not.toEqual(hexToUIColor('#FFFFFF'));
  });

  it('inverts the accent pair for the primary button', () => {
    expect(config.primaryButtonBackgroundColor).toEqual(hexToUIColor(light.accentInk));
    expect(config.primaryButtonLabelColor).toEqual(hexToUIColor(light.accent));
  });
});

describe('the copy', () => {
  it('names the prayer that has begun', () => {
    expect(shieldCopy('Maghrib').title).toBe('Maghrib has begun');
    expect(shieldCopy('Fajr').title).toBe('Fajr has begun');
  });

  it('offers the way out as the primary action', () => {
    expect(shieldCopy('Isha').primaryButtonLabel).toBe('I prayed');
  });

  it('never shames', () => {
    // The product rule is that everything around the tracker reads as
    // consistency, never as debt. A shield is the single most tempting place to
    // break it, and the category's sharpest 1-star reviews are about apps that
    // "question you about whether you prayed".
    const copy = shieldCopy('Asr');
    const text = `${copy.title} ${copy.subtitle} ${copy.primaryButtonLabel} ${copy.secondaryButtonLabel}`;
    expect(text).not.toMatch(/missed|owe|debt|failed|should have|guilt|streak|don't break/i);
  });

  it('says what is happening and what will undo it', () => {
    expect(shieldCopy('Dhuhr').subtitle).toMatch(/paused/i);
    expect(shieldCopy('Dhuhr').subtitle).toMatch(/mark the prayer/i);
  });
});

describe('the buttons', () => {
  const actions = buildShieldActions('rakat-selection');

  it('unblocks and opens the app on "I prayed"', () => {
    // It MUST open the app: this library does not record shield taps as events,
    // so if the app is not opened nothing ever learns the prayer was marked.
    const types = actions.primary.actions.map((a) => a.type);
    expect(types).toContain('unblockSelection');
    expect(types).toContain('openApp');
  });

  it('leaves the app blocked on "Not now"', () => {
    // A secondary button that also unblocks makes the whole feature decorative.
    expect(actions.secondary.actions).toHaveLength(0);
    expect(actions.secondary.behavior).toBe('close');
  });

  it('unblocks the selection it was given, not everything', () => {
    const unblock = actions.primary.actions.find((a) => a.type === 'unblockSelection');
    expect(unblock).toMatchObject({ familyActivitySelectionId: 'rakat-selection' });
    expect(actions.primary.actions.map((a) => a.type)).not.toContain('resetBlocks');
  });
});
