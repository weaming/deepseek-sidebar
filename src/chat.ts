import { INSERT_TYPE, PING_TYPE, READY_TYPE, RESULT_TYPE, type ResultMessage } from './protocol';

const EXTENSION_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');
const MAX_INSERT_LENGTH = 30000;

function findEditor(): HTMLTextAreaElement | HTMLElement | null {
  const selectors = ['textarea', '[contenteditable="true"][role="textbox"]', '[contenteditable="true"]'];

  for (const selector of selectors) {
    const editors = document.querySelectorAll<HTMLTextAreaElement | HTMLElement>(selector);
    const visibleEditor = [...editors].find((editor) => editor.getClientRects().length > 0);
    if (visibleEditor) return visibleEditor;
  }

  return null;
}

function appendToTextarea(editor: HTMLTextAreaElement, text: string): void {
  const separator = editor.value.trim() ? '\n\n' : '';
  const nextValue = editor.value + separator + text;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('无法设置输入框内容');

  editor.focus();
  setter.call(editor, nextValue);
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

function appendToEditable(editor: HTMLElement, text: string): void {
  const separator = editor.textContent?.trim() ? '\n\n' : '';
  const textNode = document.createTextNode(separator + text);
  const range = document.createRange();
  const selection = window.getSelection();

  range.selectNodeContents(editor);
  range.collapse(false);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.focus();
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

function insertText(text: string): void {
  const editor = findEditor();
  if (!editor) throw new Error('未找到 DeepSeek 输入框，请先完成登录或打开新对话');

  if (editor instanceof HTMLTextAreaElement) appendToTextarea(editor, text);
  else appendToEditable(editor, text);
}

function sendMessage(message: ResultMessage | { type: typeof READY_TYPE; sessionId: string }): void {
  chrome.runtime.sendMessage(message).catch((error) => {
    console.error('Failed to notify DeepSeek Sidebar:', error);
  });
}

if (window.parent !== window) {
  let sessionId: string | undefined;

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== EXTENSION_ORIGIN) return;

    const message = event.data as {
      type?: string;
      sessionId?: unknown;
      requestId?: unknown;
      text?: unknown;
    } | null;
    if (message?.type === PING_TYPE) {
      if (typeof message.sessionId !== 'string') return;
      sessionId = message.sessionId;
      sendMessage({ type: READY_TYPE, sessionId });
      return;
    }

    if (message?.type !== INSERT_TYPE || !sessionId || message.sessionId !== sessionId || typeof message.requestId !== 'string') return;
    const { requestId, text } = message;

    try {
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_INSERT_LENGTH) {
        throw new Error('待插入内容无效或过长');
      }
      insertText(text);
      sendMessage({ type: RESULT_TYPE, sessionId, requestId });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      sendMessage({ type: RESULT_TYPE, sessionId, requestId, error: messageText });
    }
  });
}
