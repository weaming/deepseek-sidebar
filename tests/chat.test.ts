import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('only the extension page can append text to the DeepSeek editor', () => {
  const sentMessages: Array<{ type: string; sessionId: string; requestId?: string; error?: string }> = [];
  const inputEvents: string[] = [];
  let messageListener: ((event: { source: object; origin: string; data: object }) => void) | undefined;

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

  messageListener?.({ source: parent, origin: 'chrome-extension://test-extension', data: request });
  expect(editor.value).toBe('已有内容\n\nhttps://example.com/');
  expect(inputEvents).toEqual(['input']);
  expect(sentMessages.at(-1)).toEqual({ type: 'deepseek-sidebar:result', sessionId: 'session-1', requestId: 'request-1' });
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
    querySelectorAll: () => [
      ...(firstExpanded ? [firstContent] : []),
      ...(secondExpanded ? [secondContent] : []),
    ],
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
