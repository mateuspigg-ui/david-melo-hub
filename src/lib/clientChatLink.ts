const CLIENT_CHAT_BASE_PATH = '/eventServiceSupplierChat';

const normalizeToken = (token: string) => encodeURIComponent(String(token || '').trim());

export const buildClientChatPath = (token: string) => `${CLIENT_CHAT_BASE_PATH}/${normalizeToken(token)}`;

export const buildClientChatUrl = (token: string, origin = window.location.origin) => `${origin}/#${buildClientChatPath(token)}`;

export const clientChatExampleLink = `${CLIENT_CHAT_BASE_PATH}/30bd9900-d83a-11f0-ae9a-d9cc8ae3e21f`;
