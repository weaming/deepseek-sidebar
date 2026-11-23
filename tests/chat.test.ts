import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('only the extension page can append text to the DeepSeek editor', () => {
  const sentMessages: Array<{ type: string; sessionId: string; requestId?: string; error?: string }> = [];
  const inputEvents: string[] = [];
  let messageListener: ((event: { source: object; origin: string; data: object }) => void) | undefined;
  let reloads = 0;

  class FakeTextarea {
    private currentValue = '已有内容';

    get value(): string { return this.currentValue; }
    set value(value: string) { this.currentValue = value; }
    getClientRects(): object[] { return [{}]; }
    focus(): void {}
    dispatchEvent(event: { type: string }): boolean {
      inputEvents.push(event.type);
      return true;
    }
  }

  class FakeInputEvent {
    constructor(public type: string) {}
  }

  const editor = new FakeTextarea();
  const parent = {};
  const window = {
    parent,
    location: { reload: () => { reloads++; } },
    addEventListener: (type: string, listener: typeof messageListener) => {
      if (type === 'message') messageListener = listener;
    },
  };
  const document = {
    body: {},
    querySelectorAll: (selector: string) => selector === 'textarea' ? [editor] : [],
  };
  class FakeMutationObserver {
    observe(): void {}
    disconnect(): void {}
  }
  const chrome = { runtime: {
    getURL: () => 'chrome-extension://test-extension/',
    sendMessage: async (message: { type: string; sessionId: string; requestId?: string; error?: string }) => {
      sentMessages.push(message);
    },
  } };
  const code = readFileSync(new URL('../dist/chat.js', import.meta.url), 'utf8');
  runInNewContext(code, {
    window,
    document,
    chrome,
    HTMLTextAreaElement: FakeTextarea,
    InputEvent: FakeInputEvent,
    MutationObserver: FakeMutationObserver,
  });

  messageListener?.({
    source: parent,
    origin: 'chrome-extension://test-extension',
    data: { type: 'deepseek-sidebar:ping', sessionId: 'session-1' },
  });

  const request = { type: 'deepseek-sidebar:insert', sessionId: 'session-1', requestId: 'request-1', text: 'https://example.com/' };
  messageListener?.({ source: parent, origin: 'https://other.example', data: request });
  expect(editor.value).toBe('已有内容');

  const reloadRequest = { type: 'deepseek-sidebar:reload', sessionId: 'session-1' };
  messageListener?.({ source: parent, origin: 'chrome-extension://test-extension', data: { ...reloadRequest, sessionId: 'other' } });
  expect(reloads).toBe(0);

  messageListener?.({ source: parent, origin: 'chrome-extension://test-extension', data: request });
  expect(editor.value).toBe('已有内容\n\nhttps://example.com/');
  expect(inputEvents).toEqual(['input']);
  expect(sentMessages.at(-1)).toEqual({ type: 'deepseek-sidebar:result', sessionId: 'session-1', requestId: 'request-1' });

  messageListener?.({ source: parent, origin: 'chrome-extension://test-extension', data: reloadRequest });
  expect(reloads).toBe(1);
});

test('thinking content starts collapsed and stays open after a manual expansion', () => {
  let firstExpanded = true;
  let secondExpanded = false;
  let firstClicks = 0;
  let secondClicks = 0;
  let onMutation: (() => void) | undefined;
  let scheduledScan: (() => void) | undefined;

  const firstGroup = {
    firstElementChild: {
      textContent: '已思考（用时 3 秒）',
      click: () => { firstClicks++; firstExpanded = false; },
    },
  };
  const secondGroup = {
    firstElementChild: {
      textContent: '已思考（用时 5 秒）',
      click: () => { secondClicks++; secondExpanded = false; },
    },
  };
  const firstContent = { parentElement: firstGroup };
  const secondContent = { parentElement: secondGroup };
  const document = {
    body: {},
    querySelectorAll: (selector: string) => selector === '.ds-message .ds-think-content'
      ? [
        ...(firstExpanded ? [firstContent] : []),
        ...(secondExpanded ? [secondContent] : []),
      ]
      : [],
  };
  const window = { parent: {}, addEventListener: () => {} };
  const chrome = { runtime: { getURL: () => 'chrome-extension://test-extension/' } };
  class FakeMutationObserver {
    constructor(callback: () => void) { onMutation = callback; }
    observe(): void {}
    disconnect(): void {}
  }

  const code = readFileSync(new URL('../dist/chat.js', import.meta.url), 'utf8');
  runInNewContext(code, {
    window,
    document,
    chrome,
    MutationObserver: FakeMutationObserver,
    setTimeout: (callback: () => void) => { scheduledScan = callback; return 1; },
    clearTimeout: () => {},
  });

  expect(firstClicks).toBe(1);
  expect(firstExpanded).toBe(false);

  firstExpanded = true;
  onMutation?.();
  scheduledScan?.();
  expect(firstClicks).toBe(1);
  expect(firstExpanded).toBe(true);

  secondExpanded = true;
  onMutation?.();
  scheduledScan?.();
  expect(secondClicks).toBe(1);
  expect(secondExpanded).toBe(false);
});

test('browser plugin notice banner is hidden automatically while other cookie banners stay visible', () => {
  let onMutation: (() => void) | undefined;
  let scheduledScan: (() => void) | undefined;

  function createBanner(title: string, description: string) {
    const style = {
      display: '',
      priority: '',
      setProperty(name: string, value: string, priority = '') {
        if (name === 'display') {
          this.display = value;
          this.priority = priority;
        }
      },
    };

    return {
      style,
      querySelector(selector: string) {
        if (selector === '.cookie_banner-title') return { textContent: title };
        if (selector === '.cookie_banner-description') return { textContent: description };
        return null;
      },
    };
  }

  const pluginNotice = createBanner(
    '请检查浏览器插件',
    '广告拦截、隐私保护等浏览器插件可能会拦截 DeepSeek 的必要请求，影响正常使用。',
  );
  const cookieNotice = createBanner('Cookie 设置', '我们使用必要的 Cookie 来提供服务。');
  const latePluginNotice = createBanner('请检查浏览器插件', '请尝试暂时关闭相关插件。');
  const banners = [pluginNotice, cookieNotice];

  const document = {
    body: {},
    querySelectorAll: (selector: string) => selector === '.cookie_banner-wrap' ? banners : [],
  };
  const window = { parent: {}, addEventListener: () => {} };
  const chrome = { runtime: { getURL: () => 'chrome-extension://test-extension/' } };
  class FakeMutationObserver {
    constructor(callback: () => void) { onMutation = callback; }
    observe(): void {}
    disconnect(): void {}
  }

  const code = readFileSync(new URL('../dist/chat.js', import.meta.url), 'utf8');
  runInNewContext(code, {
    window,
    document,
    chrome,
    MutationObserver: FakeMutationObserver,
    setTimeout: (callback: () => void) => { scheduledScan = callback; return 1; },
    clearTimeout: () => {},
  });

  expect(pluginNotice.style.display).toBe('none');
  expect(pluginNotice.style.priority).toBe('important');
  expect(cookieNotice.style.display).toBe('');

  banners.push(latePluginNotice);
  onMutation?.();
  scheduledScan?.();
  expect(latePluginNotice.style.display).toBe('none');
  expect(latePluginNotice.style.priority).toBe('important');
});
