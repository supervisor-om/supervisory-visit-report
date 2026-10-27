(function (root) {
  'use strict';
  const PREFIX = 'svf_eyelink_';
  const CODE_RE = /^[a-z0-9]{10}$/;
  const SUP_RE = /^[a-z][a-z0-9-]{1,30}$/;
  const TTL_MS = 15 * 60 * 1000;
  const POLL_MS = 1200;
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  const ULTRA_RE = /ultra.?wide|ultrawide|0[.,]5|عريض/i;
  const BACK_RE = /back|rear|environment|خلف/i;
  const FRONT_RE = /front|user|face/i;
  const VIRTUAL_RE = /dual|triple/i;
  let activeDataChannel = null;
  let lastAutoWideSentAt = 0;

  function newCode() {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    const out = [];
    const bytes = new Uint8Array(10);
    const c = (root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null));
    if (c && c.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes.forEach(b => out.push(abc[b % abc.length]));
    return out.join('');
  }
  const docKey = code => PREFIX + code;
  function linkUrl(base, sup, code) {
    const u = String(base || '').replace(/[#?].*$/, '').replace(/\/[^\/]*$/, '/');
    return u + 'cam.html#' + sup + '.' + code;
  }
  function parseHash(hash) {
    const m = String(hash || '').replace(/^#/, '').trim().toLowerCase().match(/^([a-z][a-z0-9-]{1,30})\.([a-z0-9]{10})$/);
    return m && SUP_RE.test(m[1]) && CODE_RE.test(m[2]) ? { sup: m[1], code: m[2] } : null;
  }
  function attachDataChannel(channel) { activeDataChannel = channel; }
  function sendCameraCommand(cmd) {
    if (!cmd) return false;
    const now = Date.now();
    if (cmd.type === 'auto-wide' && (now - lastAutoWideSentAt < 3500)) return false;
    if (cmd.type === 'auto-wide') lastAutoWideSentAt = now;
    if (activeDataChannel && activeDataChannel.readyState === 'open') {
      try { activeDataChannel.send(JSON.stringify(cmd)); return true; } catch (e) {}
    }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('svf_eye_cam_ctrl');
        bc.postMessage(cmd);
        bc.close();
      }
    } catch (e) {}
    return false;
  }
  const api = { newCode, docKey, linkUrl, parseHash, attachDataChannel, sendCameraCommand, PREFIX, TTL_MS, POLL_MS, ICE, ULTRA_RE, BACK_RE, FRONT_RE, VIRTUAL_RE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SvfEyeLink = api;
})(typeof window !== 'undefined' ? window : this);
