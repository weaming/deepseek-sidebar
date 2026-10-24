import { expect, test } from 'bun:test';
import { initializePrefill } from '../src/prefill';

test('the side panel inserts the active tab URL and article after the chat frame is ready', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const postedMessages: Array<{ type: string; sessionId: string; requestId?: string; text?: string }> = [];
  let chatMessageListener: ((message: object, sender: object, sendResponse: (response: object) => void) => void) | undefined;
  let linkClick: (() => void) | undefined;
  let articleClick: (() => void) | undefined;
  let requestedOrigins: string[] | undefined;
  let scriptCalls = 0;

  const linkButton = {
    disabled: true,
    addEventListener: (_event: string, listener: () => void) => { linkClick = listener; },
  };
  const articleButton = {
    disabled: true,
    addEventListener: (_event: string, listener: () => void) => { articleClick = listener; },
  };
  const status = { textContent: '' };
  const chatFrame = {
    contentWindow: { postMessage: (message: typeof postedMessages[number]) => { postedMessages.push(message); } },
    addEventListener: () => {},
  };
  const elements: Record<string, object> = {
    chatFrame,
    insertLink: linkButton,
    insertArticle: articleButton,
    prefillStatus: status,
  };
  const document = {
    getElementById: (id: string) => elements[id],
    querySelectorAll: () => [],
  };
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: { addListener: (listener: typeof chatMessageListener) => { chatMessageListener = listener; } },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://example.com/article' }],
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
    permissions: {
      request: async (permissions: { origins: string[] }) => {
        requestedOrigins = permissions.origins;
        return true;
      },
      contains: async () => false,
    },
    storage: {
      sync: {
        get: async () => ({ extractor: 'defuddle', format: 'markdown' }),
        set: async () => {},
      },
      onChanged: { addListener: () => {} },
    },
    scripting: { executeScript: async () => {
      scriptCalls++;
      return scriptCalls === 1 ? [] : [{ result: {
          title: '测试文章',
          url: 'https://example.com/article',
          text: '文章正文',
          isTruncated: false,
        } }];
    } },
  };

  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  Object.defineProperty(globalThis, 'chrome', { value: chrome, configurable: true });

  try {
    initializePrefill();
    await Bun.sleep(0);

    const sessionId = postedMessages[0]?.sessionId;
    expect(sessionId).toBeString();
    chatMessageListener?.(
      { type: 'deepseek-sidebar:ready', sessionId },
      { id: 'test-extension', url: 'https://chat.deepseek.com/' },
      () => {},
    );
    expect(linkButton.disabled).toBe(false);

    linkClick?.();
    await Bun.sleep(0);

    const insertMessage = postedMessages.at(-1);
    expect(insertMessage?.type).toBe('deepseek-sidebar:insert');
    expect(insertMessage?.text).toBe('https://example.com/article');

    chatMessageListener?.(
      { type: 'deepseek-sidebar:result', sessionId, requestId: insertMessage?.requestId },
      { id: 'test-extension', url: 'https://chat.deepseek.com/' },
      () => {},
    );
    await Bun.sleep(0);
    expect(status.textContent).toBe('链接已填入，可编辑后发送');

    articleClick?.();
    await Bun.sleep(0);

    const articleMessage = postedMessages.at(-1);
    expect(requestedOrigins).toEqual(['http://*/*', 'https://*/*']);
    expect(articleMessage?.text).toBe('标题：测试文章\n链接：https://example.com/article\n\n文章正文');

    chatMessageListener?.(
      { type: 'deepseek-sidebar:result', sessionId, requestId: articleMessage?.requestId },
      { id: 'test-extension', url: 'https://chat.deepseek.com/' },
      () => {},
    );
    await Bun.sleep(0);
    expect(status.textContent).toBe('正文已填入，可编辑后发送');

    await Bun.sleep(3100);
    expect(status.textContent).toBe('');
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');

    if (originalChrome) Object.defineProperty(globalThis, 'chrome', originalChrome);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});
