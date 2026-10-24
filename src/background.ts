const CONTEXT_MENU_ID = 'openDeepSeekSidebar';
const FRAME_RULE_ID = 1;

async function configurePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function configureFrameRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [FRAME_RULE_ID],
    addRules: [{
      id: FRAME_RULE_ID,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        responseHeaders: [
          { header: 'Content-Security-Policy', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
          { header: 'X-Frame-Options', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
        ],
      },
      condition: {
        requestDomains: ['chat.deepseek.com'],
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME],
      },
    }],
  });
}

async function configureContextMenu() {
  await new Promise<void>((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Open Sidebar For DeepSeek',
      contexts: ['all'],
    }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

async function initializeExtension(): Promise<void> {
  await Promise.all([configurePanel(), configureFrameRule(), configureContextMenu()]);
}

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension().catch((error) => {
    console.error('Failed to initialize DeepSeek Sidebar:', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  configurePanel().catch((error) => {
    console.error('Failed to configure side panel:', error);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || tab?.windowId === undefined) return;

  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
    console.error('Failed to open side panel:', error);
  });
});
