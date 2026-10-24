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
    addEventListener: (_type: string, listener: typeof messageListener) => { messageListener = listener; },
  };
  const document = {
    querySelectorAll: (selector: string) => selector === 'textarea' ? [editor] : [],
  };
  const chrome = { runtime: {
    getURL: () => 'chrome-extension://test-extension/',
    sendMessage: async (message: { type: string; sessionId: string; requestId?: string; error?: string }) => {
      sentMessages.push(message);
    },
  } };
  const code = readFileSync(new URL('../dist/chat.js', import.meta.url), 'utf8');
  runInNewContext(code, { window, document, chrome, HTMLTextAreaElement: FakeTextarea, InputEvent: FakeInputEvent });

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
