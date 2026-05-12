const api = (() => {
  const TOKEN_KEY = 'pb_token';
  const SPACE_KEY = 'pb_key';
  const SPACE_ID_KEY = 'pb_space_id';
  const BASE = '/yueju';

  const ERROR_MAP = {
    'Invalid create_password':                    '创建密码错误',
    'Key already exists':                         '该密钥已被占用，换一个试试',
    'key is required':                            '请输入密钥',
    'Unauthorized':                               '未登录或登录已过期，请重新进入空间',
    'Invalid cancel_code':                        '取消码错误',
    'Session not found':                          '场次不存在或已被删除',
    'Signup not found':                           '报名记录不存在',
    'Forbidden':                                  '无权限执行此操作',
    'session_id is required':                     '缺少场次信息，请刷新页面重试',
    'cancel_code is required':                    '请输入取消码',
    'name is required':                           '请填写姓名/昵称',
    'session is required':                        '缺少场次信息，请刷新页面重试',
    'SHARE_SECRET not configured':                '服务配置错误，请联系管理员',
    'Invalid or tampered token':                  '分享链接无效或已过期',
    'Malformed token':                            '分享链接格式错误',
    'Session does not belong to your space':      '无权限操作此场次',
    'Failed to authenticate.':                    '密钥不存在，请检查后重试',
    'The requested resource wasn\'t found.':      '记录不存在或已被删除',
    'Failed to create record.':                   '提交失败，请检查填写内容',
    'Failed to update record.':                   '修改失败，请检查填写内容',
  };

  function mapError(raw, status) {
    if (ERROR_MAP[raw]) return ERROR_MAP[raw];
    if (status === 500) return '服务器错误，请稍后重试';
    return raw || '操作失败，请稍后重试';
  }

  async function request(method, path, body, auth) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const t = getToken();
      if (t) headers['Authorization'] = t;
    }
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('网络连接失败，请检查网络后重试');
    }
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      const raw = data?.message || data?.error || '';
      throw new Error(mapError(raw, res.status));
    }
    return data;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getSpaceKey() {
    return localStorage.getItem(SPACE_KEY);
  }

  function getSpaceId() {
    return localStorage.getItem(SPACE_ID_KEY);
  }

  function setAuth(token, key, spaceId) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SPACE_KEY, key);
    if (spaceId) localStorage.setItem(SPACE_ID_KEY, spaceId);
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SPACE_KEY);
    localStorage.removeItem(SPACE_ID_KEY);
  }

  function isAuthenticated() {
    return !!getToken();
  }

  function requireAuth() {
    if (!isAuthenticated()) {
      window.location.href = 'index.html';
    }
  }

  async function createSpace(createPassword, key) {
    await request('POST', '/api/custom/spaces/create', { create_password: createPassword, key });
    await enterSpace(key);
  }

  async function enterSpace(key) {
    const data = await request('POST', '/api/collections/spaces/auth-with-password', {
      identity: key,
      password: key,
    });
    setAuth(data.token, key, data.record && data.record.id);
  }

  async function getSessions() {
    const data = await request('GET', '/api/collections/sessions/records?sort=date', null, true);
    return data.items || [];
  }

  async function getSession(id) {
    return request('GET', `/api/collections/sessions/records/${id}`, null, true);
  }

  async function createSession(sessionData) {
    return request('POST', '/api/custom/sessions/create', sessionData, true);
  }

  async function updateSession(id, data, cancelCode) {
    const payload = { ...data };
    if (cancelCode != null) payload.cancel_code = cancelCode;
    return request('PATCH', `/api/collections/sessions/records/${id}`, payload, true);
  }

  async function cancelSession(sessionId, cancelCode) {
    await request('POST', '/api/custom/sessions/cancel', { session_id: sessionId, cancel_code: cancelCode }, true);
  }

  async function getSignups(sessionId) {
    const encoded = encodeURIComponent(`session="${sessionId}"`);
    const data = await request('GET', `/api/collections/signups/records?filter=${encoded}&sort=id`, null, true);
    return data.items || [];
  }

  async function createSignup(sessionId, name, cancelCode) {
    return request('POST', '/api/custom/signups/create', {
      session: sessionId,
      name,
      cancel_code: cancelCode,
    }, true);
  }

  async function cancelSignup(signupId, cancelCode) {
    await request('POST', '/api/custom/signups/cancel', { signup_id: signupId, cancel_code: cancelCode }, true);
  }

  async function encodeShare(sessionId) {
    const data = await request('POST', '/api/custom/share/encode', { session_id: sessionId }, true);
    return data.token;
  }

  async function decodeShare(token) {
    const data = await request('GET', `/api/custom/share/decode?token=${encodeURIComponent(token)}`);
    return data;
  }

  async function getShareUrl(sessionId) {
    const token = await encodeShare(sessionId);
    const pathBase = window.location.pathname.replace(/\/[^/]*$/, '/');
    return `${window.location.origin}${pathBase}session.html?share=${encodeURIComponent(token)}`;
  }

  function isExpired(session) {
    if (!session.date || !session.end_time) return false;
    const [h, m] = session.end_time.split(':').map(Number);
    const dateOnly = session.date.substring(0, 10);
    const [year, month, day] = dateOnly.split('-').map(Number);
    const endUtcMs = Date.UTC(year, month - 1, day, h - 8, m);
    return Date.now() > endUtcMs;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const dateOnly = dateStr.substring(0, 10);
    const [year, month, day] = dateOnly.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${month}月${day}日 ${weekdays[d.getDay()]}`;
  }

  function formatTime(start, end) {
    if (!start) return '';
    const s = start.slice(0, 5);
    if (!end) return s;
    return `${s}-${end.slice(0, 5)}`;
  }

  return {
    getToken,
    getSpaceKey,
    getSpaceId,
    setAuth,
    clearAuth,
    isAuthenticated,
    requireAuth,
    createSpace,
    enterSpace,
    getSessions,
    getSession,
    createSession,
    updateSession,
    cancelSession,
    getSignups,
    createSignup,
    cancelSignup,
    encodeShare,
    decodeShare,
    getShareUrl,
    isExpired,
    formatDate,
    formatTime,
  };
})();
