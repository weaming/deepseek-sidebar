import { CHAT_ORIGIN, INSERT_TYPE, PING_TYPE, READY_TYPE, RESULT_TYPE, type ResultMessage } from './protocol';

const INSERT_TIMEOUT_MS = 8000;

interface ArticleContent {
  title: string;
  url: string;
  text: string;
  isTruncated: boolean;
}

export function extractArticle(): ArticleContent {
  const ARTICLE_LENGTH_LIMIT = 20000;
  const article = document.querySelector<HTMLElement>('article, main') ?? document.body;
  const rawText = article.innerText.replace(/\n{3,}/g, '\n\n').trim();

  return {
    title: document.title,
    url: location.href,
    text: rawText.slice(0, ARTICLE_LENGTH_LIMIT),
    isTruncated: rawText.length > ARTICLE_LENGTH_LIMIT,
  };
}

function isWebTab(tab: chrome.tabs.Tab | undefined): tab is chrome.tabs.Tab & { id: number; url: string } {
  return typeof tab?.id === 'number' && /^https?:\/\//.test(tab.url ?? '');
}

function hostPattern(url: string): string {
  const parsedUrl = new URL(url);
  return `${parsedUrl.protocol}//${parsedUrl.hostname}/*`;
}

export function initializePrefill(): void {
  const chatFrame = document.getElementById('chatFrame') as HTMLIFrameElement;
  const linkButton = document.getElementById('insertLink') as HTMLButtonElement;
  const articleButton = document.getElementById('insertArticle') as HTMLButtonElement;
  const status = document.getElementById('prefillStatus') as HTMLSpanElement;

  let activeTab: chrome.tabs.Tab | undefined;
  const sessionId = crypto.randomUUID();
  let isChatReady = false;
  let isBusy = false;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingRequest: {
    id: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | undefined;

  function updateButtons(): void {
    const isEnabled = isChatReady && !isBusy && isWebTab(activeTab);
    linkButton.disabled = !isEnabled;
    articleButton.disabled = !isEnabled;
  }

  function setStatus(message: string): void {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.title = message;
    if (!message) return;

    statusTimer = setTimeout(() => {
      status.textContent = '';
      status.title = '';
    }, 3000);
  }

  async function refreshActiveTab(): Promise<void> {
    try {
      [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      updateButtons();
    } catch (error) {
      activeTab = undefined;
      setStatus(`无法读取当前标签页：${error instanceof Error ? error.message : String(error)}`);
      updateButtons();
    }
  }

  function startHandshake(): void {
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeout);
      pendingRequest.reject(new Error('DeepSeek 页面已重新加载，请重试'));
      pendingRequest = undefined;
    }

    isChatReady = false;
    setStatus('正在连接 DeepSeek…');
    updateButtons();
    clearInterval(pingTimer);

    let attempts = 0;
    const ping = () => {
      attempts++;
      chatFrame.contentWindow?.postMessage({ type: PING_TYPE, sessionId }, CHAT_ORIGIN);
      if (attempts < 30) return;

      clearInterval(pingTimer);
      setStatus('未连接到 DeepSeek 页面，请检查页面是否加载成功');
    };

    ping();
    pingTimer = setInterval(ping, 1000);
  }

  function handleChatMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: { received: boolean }) => void,
  ): void {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(`${CHAT_ORIGIN}/`)) return;
    if (!message || typeof message !== 'object' || !('sessionId' in message)) return;
    if (message.sessionId !== sessionId) return;

    if ('type' in message && message.type === READY_TYPE) {
      sendResponse({ received: true });
      isChatReady = true;
      clearInterval(pingTimer);
      setStatus('');
      updateButtons();
      return;
    }

    const result = message as ResultMessage;
    if (result?.type !== RESULT_TYPE || result.requestId !== pendingRequest?.id) return;

    sendResponse({ received: true });
    const request = pendingRequest;
    pendingRequest = undefined;
    clearTimeout(request.timeout);
    if (result.error) request.reject(new Error(result.error));
    else request.resolve();
  }

  function insertIntoChat(text: string): Promise<void> {
    if (!isChatReady || !chatFrame.contentWindow) throw new Error('DeepSeek 页面尚未就绪');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        pendingRequest = undefined;
        reject(new Error('填入超时，请检查 DeepSeek 页面是否正常加载'));
      }, INSERT_TIMEOUT_MS);

      pendingRequest = { id, resolve, reject, timeout };
      chatFrame.contentWindow?.postMessage({ type: INSERT_TYPE, sessionId, requestId: id, text }, CHAT_ORIGIN);
    });
  }

  async function insertLink(): Promise<void> {
    isBusy = true;
    updateButtons();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!isWebTab(tab)) throw new Error('当前标签页不是普通网页');

      await insertIntoChat(tab.url);
      setStatus('链接已填入，可编辑后发送');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      isBusy = false;
      updateButtons();
    }
  }

  async function insertArticle(): Promise<void> {
    const tab = activeTab;
    if (!isWebTab(tab)) return;

    isBusy = true;
    updateButtons();
    setStatus('正在读取正文…');

    try {
      const isGranted = await chrome.permissions.request({ origins: [hostPattern(tab.url)] });
      if (!isGranted) throw new Error('未获得当前网站的读取权限');

      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab?.id !== tab.id || currentTab.url !== tab.url) {
        throw new Error('当前页面已变化，请重试');
      }

      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractArticle });
      const article = result?.result;
      if (!article?.text) throw new Error('当前页面没有可读取的正文');

      const draft = `标题：${article.title}\n链接：${article.url}\n\n${article.text}`;
      await insertIntoChat(draft);
      setStatus(article.isTruncated ? '已填入正文前 20000 字符，可编辑后发送' : '正文已填入，可编辑后发送');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      isBusy = false;
      updateButtons();
    }
  }

  linkButton.addEventListener('click', () => { void insertLink(); });
  articleButton.addEventListener('click', () => { void insertArticle(); });
  chatFrame.addEventListener('load', startHandshake);
  chrome.runtime.onMessage.addListener(handleChatMessage);
  chrome.tabs.onActivated.addListener(() => { void refreshActiveTab(); });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) void refreshActiveTab();
  });

  void refreshActiveTab();
  startHandshake();
}
