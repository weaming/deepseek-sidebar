import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

interface SidebarOpenedResponse {
  count?: number;
  error?: string;
}

interface Listeners {
  installed?: () => void;
  startup?: () => void;
  message?: (
    message: { type: string },
    sender: { id: string },
    sendResponse: (response: SidebarOpenedResponse) => void,
  ) => boolean;
  menuClick?: (info: { menuItemId: string }, tab: { windowId: number }) => void;
}

function createExtensionHarness() {
  const listeners: Listeners = {};
  const state: Record<string, number> = {};
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
      onMessage: { addListener: (listener: NonNullable<Listeners['message']>) => { listeners.message = listener; } },
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
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.filter((key) => key in state).map((key) => [key, state[key]]));
        },
        set: async (values: Record<string, number>) => { Object.assign(state, values); },
      },
    },
  };

  const code = readFileSync(new URL('../dist/background.js', import.meta.url), 'utf8');
  runInNewContext(code, { chrome, console });
  return { listeners, state, calls };
}

function sendSidebarOpened(listeners: Listeners): Promise<SidebarOpenedResponse> {
  return new Promise((resolve) => {
    const isAsync = listeners.message?.({ type: 'sidebarOpened' }, { id: 'test-extension' }, resolve);
    expect(isAsync).toBe(true);
  });
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

  test('concurrent openings are counted without losing updates', async () => {
    const { listeners, state } = createExtensionHarness();
    const responses = await Promise.all(Array.from({ length: 5 }, () => sendSidebarOpened(listeners)));

    expect(responses.map((response) => response.count)).toEqual([1, 2, 3, 4, 5]);
    expect(state.sidebarOpenCount).toBe(5);
  });

  test('the context menu opens the panel in the selected window', async () => {
    const { listeners, calls } = createExtensionHarness();
    listeners.menuClick?.({ menuItemId: 'openDeepSeekSidebar' }, { windowId: 17 });
    await Bun.sleep(0);

    expect(calls.openedPanels).toEqual([{ windowId: 17 }]);
  });
});
