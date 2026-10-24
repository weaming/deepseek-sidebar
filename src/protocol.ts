export const CHAT_ORIGIN = 'https://chat.deepseek.com';
export const PING_TYPE = 'deepseek-sidebar:ping';
export const READY_TYPE = 'deepseek-sidebar:ready';
export const INSERT_TYPE = 'deepseek-sidebar:insert';
export const RESULT_TYPE = 'deepseek-sidebar:result';

export interface InsertMessage {
  type: typeof INSERT_TYPE;
  sessionId: string;
  requestId: string;
  text: string;
}

export interface ResultMessage {
  type: typeof RESULT_TYPE;
  sessionId: string;
  requestId: string;
  error?: string;
}
