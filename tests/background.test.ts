import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

interface Listeners {
  installed?: () => void;
  startup?: () => void;
  menuClick?: (info: { menuItemId: string }, tab: { windowId: number }) => void;
}

function createExtensionHarness() {
  const listeners: Listeners = {};
  const calls: {
    rules: Array<{ addRules: Array<{ condition: unknown }> }>;
    menus: Array<{ id: string }>;
    openedPanels: Array<{ windowId: number }>;
  } = { rules: [], menus: [], openedPanels: [] };

  const chrome = {
    runtime: {
      id: 'test-extension',
      onInstalled: { addListener: (listener: () => void) => { listeners.installed = listener; } },
      onStartup: { addListener: (listener: () => void) => { listeners.startup = listener; } },
    },
    sidePanel: {
      setPanelBehavior: async () => {},
      open: async (options: { windowId: number }) => { calls.openedPanels.push(options); },
    },
    declarativeNetRequest: {
      RuleActionType: { MODIFY_HEADERS: 'modifyHeaders' },
      HeaderOperation: { REMOVE: 'remove' },
      ResourceType: { SUB_FRAME: 'sub_frame' },
      updateDynamicRules: async (rules: { addRules: Array<{ condition: unknown }> }) => { calls.rules.push(rules); },
    },
    contextMenus: {
      removeAll: (callback: () => void) => callback(),
      create: (menu: { id: string }, callback: () => void) => { calls.menus.push(menu); callback(); },
      onClicked: { addListener: (listener: NonNullable<Listeners['menuClick']>) => { listeners.menuClick = listener; } },
    },
  };

  const code = readFileSync(new URL('../dist/background.js', import.meta.url), 'utf8');
  runInNewContext(code, { chrome, console });
  return { listeners, calls };
}

describe('background', () => {
  test('installation configures the panel and the frame rule', async () => {
    const { listeners, calls } = createExtensionHarness();
    listeners.installed?.();
    await Bun.sleep(0);

    expect(calls.menus[0]?.id).toBe('openDeepSeekSidebar');
    expect(calls.rules[0]?.addRules[0]?.condition).toEqual({
      requestDomains: ['chat.deepseek.com'],
      resourceTypes: ['sub_frame'],
    });
  });

  test('the context menu opens the panel in the selected window', async () => {
    const { listeners, calls } = createExtensionHarness();
    listeners.menuClick?.({ menuItemId: 'openDeepSeekSidebar' }, { windowId: 17 });
    await Bun.sleep(0);

    expect(calls.openedPanels).toEqual([{ windowId: 17 }]);
  });
});
