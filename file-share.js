#!/usr/bin/env node
/*
 file-share.js - two-way file and folder sharing over any connection
 -------------------------------------------------------------------
 Run on BOTH computers with:   node file-share.js

 One program does everything: it listens for the other user AND connects to
 them, so it does not matter who started first or who runs the tunnel.

   * Same Wi-Fi / LAN: one user puts the other user's LAN IP in PEER_ADDRESS.
   * Internet: one user runs Pinggy or ngrok on port 4444 (TCP, HTTP or
     HTTPS tunnel); the other user pastes the address the tunnel printed into
     PEER_ADDRESS. The user who runs the tunnel can leave PEER_ADDRESS empty.

 The connection type (raw TCP, TLS, WebSocket over HTTP/HTTPS, or plain HTTP
 polling as a last resort) is detected automatically. Interrupted transfers
 resume where they stopped, even after a tunnel expires or a restart.

 Commands once connected:
   upload <files/folders>    offer one or more files/folders, any type and size
                             (upload a.mp4 b.zip "My Folder" *.jpg)
   Ctrl+Z   (or cancel)      pick which transfers to stop: 2, or 2 3 4, or all,
                             then confirm once with y/n; the connection stays
   cancel 2 3                stop transfers 2 and 3 (numbers shown by status)
   connect <address>         switch to a new address (e.g. a new tunnel URL)
   status                    connection and every transfer with its number
   help                      show the commands
   exit     (or Ctrl+C)      quit

 Works with file-share.py and file-share.cs: any two of them can talk.
 Cross-platform: Windows, macOS, Linux, Android (Termux). Node.js 12 or newer.
 Built-in modules only: nothing to install with npm.
*/
'use strict';

// ============================ EDIT THIS ============================
// The OTHER user's address. Leave '' if the other user connects to you
// (for example, you are the one running the Pinggy/ngrok tunnel).
// Accepts: 192.168.0.113 | 192.168.0.113:4444 | tcp://x.a.free.pinggy.link:41234
//          https://abcd.a.free.pinggy.link | https://abcd.ngrok-free.app
//          tcp://0.tcp.in.ngrok.io:12345 | any host, host:port or URL
var PEER_ADDRESS = '';

var PORT = 4444;            // local port this program listens on (tunnel to this port)
var DOWNLOAD_FOLDER = '';   // '' = a "FileShare Downloads" folder next to this script
// ===================================================================

// Optional overrides without editing the file:
//   node file-share.js <peer address>
//   environment variables FILESHARE_PEER, FILESHARE_PORT, FILESHARE_DIR

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const readline = require('readline');

// Built-in TLS identity: lets two copies talk TLS directly on a LAN. A copy
// only trusts this exact certificate for that; public sites (Pinggy/ngrok
// HTTPS) are still verified normally. Same certificate as file-share.py/.cs.
const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDNzCCAh+gAwIBAgIUAeA6SNShoQx/dNNRe93vuufF4DMwDQYJKoZIhvcNAQEL
BQAwFjEUMBIGA1UEAwwLY21vbi1zZW5kZXIwIBcNMjYxMDIxMTk0OTM3WhgPMjEy
NjA5MjcxOTQ5MzdaMBYxFDASBgNVBAMMC2Ntb24tc2VuZGVyMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEApIxbuJpV9TJxfccLXMhnlu23XIuYKfK0l+xN
CbFip2yYpWJjoTUU2cYSE0mBy+cLK7J8KqvNLZMbubo2l9JojGH5HtltWCLcTghH
XAMeu5o5C7LmYiyCSiUR3m2/4YOIQUc2YWRw7rmRw8rYc21P4i1v4H91xUhObFqL
im9uJQvcZlnV8g816qBYMmZt7U+jl9/hdhV7AcJTg6EitD6d34WP4IzjFmIdqBre
h+MhOeUnq9OXhzrCJJbMJEPHFWNG/wJLTTZKEfUSiiEJP24s9EsaLf5+IitgX/ni
llwGEgxnAfjUl56TnHbBNYZ/w7qp8DIyScbE5obcaahCh3BmRwIDAQABo3sweTAd
BgNVHQ4EFgQUmtaLkXOnoyUUk4Xh4bgByxoiWqEwHwYDVR0jBBgwFoAUmtaLkXOn
oyUUk4Xh4bgByxoiWqEwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAqQw
FgYDVR0RBA8wDYILY21vbi1zZW5kZXIwDQYJKoZIhvcNAQELBQADggEBAF/4peGm
YRR7LQ9qJCZW2SZHKF5QJsrhNEpnmwosJUKarEqC5tUyJFM/wMeve+JgWiaMrTle
tBrAR49b7FNbQtUBZJdqAWaTeTVjZvkssMUpENaSTpLt7G6YmRXJ3OzkjteCZcQx
lYluQSbjc8SQo06zUYARbTQliMh+6B3Tq+tgZJ19NRirEfotyoATLNFpoIpwhFuI
VZsD3SJHCbf2P7gVEN5u1CfpYDT2owQTQxs4ELyBiZar54piVqPaOZYT26lnlPkq
xjCEGQUSr/7xPy92uCsdBqakIHLPb4nfAbt53iCOmxq+moXa5zNhEcDmyZTXlP73
To5MF7KGcoHCp9M=
-----END CERTIFICATE-----`;
const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCkjFu4mlX1MnF9
xwtcyGeW7bdci5gp8rSX7E0JsWKnbJilYmOhNRTZxhITSYHL5wsrsnwqq80tkxu5
ujaX0miMYfke2W1YItxOCEdcAx67mjkLsuZiLIJKJRHebb/hg4hBRzZhZHDuuZHD
ythzbU/iLW/gf3XFSE5sWouKb24lC9xmWdXyDzXqoFgyZm3tT6OX3+F2FXsBwlOD
oSK0Pp3fhY/gjOMWYh2oGt6H4yE55Ser05eHOsIklswkQ8cVY0b/AktNNkoR9RKK
IQk/biz0Sxot/n4iK2Bf+eKWXAYSDGcB+NSXnpOcdsE1hn/DuqnwMjJJxsTmhtxp
qEKHcGZHAgMBAAECggEAALive5hhoW4+hSNRmhne1RCRvzwgHKmjFQ9vfwgMu1iE
is/ASWf8LBWW5V1rI5kNuXv82LW2yT5d3sCW61omzzFsGtsv2YpoQNypw24tZ6Z+
HYkD7ZDtuU7UTI9an1h+SRr7fWMoA5lDWa0Sqd7kJ2+05TJp3RrmDR+QgQ41WMA6
FZ1hdN+1QlZ1pJKpO8+8k4Jru2oEZUvG4Nc64nq4aBibVunbEPz1r7SZoXDAViT8
r0TnJP/aBAAEg/V7lO6pFpwBLsyG2SNqEkshaA9nrqAF/Pm+bugw8XezPMeznPds
3jZlB2VM1LkAcZIcQPATZFSAlQrmcBELKIYxni3tEQKBgQDlMDzei1fvGJNptzwF
NLI/N6WK98NzB356K6mNMHkr+inMMBZl9USRHioXZDgATQx+EAcDXaIGWOHA9Fft
Uszju5HWA5Y0ySkJy4uRvaOe1334xSKi5V6i8eLQPvvKS5dEyk271NturMbs+1qG
MYeqWKgY9WdU4kH++TwOh1+XxQKBgQC3zET+5WGgeASiIJyfigPNlfwNlR1WZjag
Xc9wWouid8Jt/c052mj51IZ0iq20BmVJwGYMOx9A+gHM12v2fqjIS2ADH7Zf1CU9
RiAg6jNSsF4bLINJusIuloArdDzWzKj0zgFNz4lT1uOnK2xHoolshTiBre3b2fcm
4dqN82eamwKBgQDD1xlcTROh0o08m3+lLydVD7bcbeTMaU3xFVg3toEETCrlOP4a
t5+UpYLwJAoab7xKCGYFwT/PTqnx2Jk9yTAdNU1j5AK5Ll9r6EtmCPdEpv0U01dK
fNcGQ809h2Res4MaHAiahUPQacE+BXaQDsjPjhxt310h0oj0WIKyI4lSxQKBgQCv
YbPUpnzp6pxBOG07ry7B1gSV0VwVPaOSkvGGfGARv8U/v5c9RTQ2cJ18R3hI+HFe
VsEJmsDP98AP/t9+bo4P0hzj3jbgaka+mVO/FLu0g6bIt0jv6c2xNttGm7wSG2h9
cLW90fNwlPTWZ5EDKg2IB/dLhvQZfXthFtK98S1DUQKBgEdkixQIFMvfQ/7JLgN8
4syHME+8xH5B3DEpDPU1cKPW/2n70D2dPWQG2pelUDyyGhb3x72lwx0OHBGsTdoR
tAChgZmt/zrSxC/Si9hS5DQSlH2k5zKieQ4X5AqzK1DwmziJShv50GD7TQ/KLWlS
zP3pNXne29C+KThc0CXc5mW0
-----END PRIVATE KEY-----`;

const APP_NAME = 'FileShare';
const APP_VERSION = 1;
const MAGIC = Buffer.from('FSHR1\n', 'latin1');   // first bytes each side sends on every connection
const F_CTRL = 1, F_DATA = 2, F_PING = 3;           // frame types
const HDR_SIZE = 5;                                 // frame header: type (1), payload length (4)
const DATA_HDR_SIZE = 16;                           // data frame: transfer id (4), offset (8), crc32 (4)
const MAX_FRAME = 64 * 1024 * 1024;
const CHUNK = 512 * 1024;                           // file bytes per data frame
const DATA_QUEUE_MAX = 4 * 1024 * 1024;             // queued (not yet written) file bytes per connection
const WS_MAX_FRAME = 1024 * 1024;

const PING_INTERVAL = 3.0;              // send a heartbeat after this much send silence (s)
const DEAD_AFTER = 15.0;                // nothing received this long = connection is dead (s)
const POLL_PING_INTERVAL = 10.0;        // HTTP polling fallback: fewer requests
const POLL_DEAD_AFTER = 45.0;
const POLL_WAIT = 15.0;                 // long-poll hold time (s)
const POLL_BATCH = 4 * 1024 * 1024;
const POLL_GIVE_UP = 30.0;
const CONNECT_TIMEOUT = 8.0;
const HANDSHAKE_TIMEOUT = 10.0;
const SNIFF_TIMEOUT = 10.0;
const HTTP_IDLE = 60.0;
const PROGRESS_EVERY = 0.5;
const HEALTHY_WINDOW = 5.0;
const RETRY_MAX = 5.0;
const KEEPALIVE_IDLE = 20;
const MAX_STREAMS = 3;                  // uploads streaming at once; the rest wait their turn
const MAX_BATCH = 1000;                 // items per upload command (a folder counts as one item)
const GROUP_WAIT = 1.5;                 // wait this long for the rest of a multi-file offer (s)

const TUNNEL_HEADERS = {
  'User-Agent': 'file-share/1',
  'X-Pinggy-No-Screen': '1',            // Pinggy free: skip the browser warning
  'ngrok-skip-browser-warning': '1',    // ngrok free: skip the interstitial
  'Cache-Control': 'no-cache',
};
const MARK_HEADER = 'X-FShare';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const INSTANCE_ID = crypto.randomBytes(8).toString('hex');
let HOSTNAME = 'other user';
try {
  HOSTNAME = (os.hostname() || '').split('.')[0].replace(/[^\w-]/g, '').slice(0, 40) || 'other user';
} catch (e) { /* keep default */ }
const IS_WINDOWS = process.platform === 'win32';
const DEBUG = !!process.env.FILESHARE_DEBUG;

// ======================================================================
// Small helpers
// ======================================================================
const T0 = process.hrtime();
function mono() {
  const d = process.hrtime(T0);
  return d[0] + d[1] / 1e9;
}

function sleep(sec) {
  return new Promise(function (r) { setTimeout(r, Math.max(0, sec * 1000)); });
}

function debug(where, e) {
  if (DEBUG) {
    try { process.stderr.write('[debug] ' + where + ': ' + (e && e.stack ? e.stack : e) + '\n'); } catch (x) { /* ignore */ }
  }
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function human(n) {
  n = Math.max(0, Number(n) || 0);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (n < 1024 || unit === 'TB') {
      return unit === 'B' ? (Math.floor(n) + ' B') : (n.toFixed(2) + ' ' + unit);
    }
    n /= 1024.0;
  }
  return Math.floor(n) + ' B';
}

function fmtEta(sec) {
  if (sec === null || sec === undefined || !isFinite(sec) || sec < 0 || sec > 360000) return '--:--';
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), rem = sec % 3600;
  const m = Math.floor(rem / 60), s = rem % 60;
  return h ? (h + ':' + pad2(m) + ':' + pad2(s)) : (pad2(m) + ':' + pad2(s));
}

function short(name, width) {
  width = width || 24;
  return name.length <= width ? name : name.slice(0, width - 3) + '...';
}

function padR(s, w) { s = String(s); return s.length >= w ? s : s + ' '.repeat(w - s.length); }
function padL(s, w) { s = String(s); return s.length >= w ? s : ' '.repeat(w - s.length) + s; }
function pct1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
function commas(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// Python-style truthiness and int() for values that arrive in JSON messages.
function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  if (typeof v === 'number' && isNaN(v)) return true;
  return true;
}

function pyInt(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') {
    if (!isFinite(v)) { const e = new Error('bad number'); e.name = 'ValueError'; throw e; }
    return Math.trunc(v);
  }
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return parseInt(v, 10);
  const e = new Error('not an integer');
  e.name = (typeof v === 'string') ? 'ValueError' : 'TypeError';
  throw e;
}

function hexId(nbytes) { return crypto.randomBytes(nbytes).toString('hex'); }

// crc32: zlib's own when this Node has it (v20.15+/v22.2+), otherwise a table version.
const CRC_TABLE = (function () {
  const t = new Int32Array(256 * 8);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  for (let n = 0; n < 256; n++) {
    let c = t[n];
    for (let k = 1; k < 8; k++) { c = t[c & 0xFF] ^ (c >>> 8); t[k * 256 + n] = c; }
  }
  return t;
})();

function crc32js(buf) {
  const T = CRC_TABLE;
  let c = -1, i = 0;
  const n = buf.length, n8 = n - (n % 8);
  for (; i < n8; i += 8) {
    const a = (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) ^ c;
    const b = buf[i + 4] | (buf[i + 5] << 8) | (buf[i + 6] << 16) | (buf[i + 7] << 24);
    c = T[1792 + (a & 0xFF)] ^ T[1536 + ((a >>> 8) & 0xFF)] ^ T[1280 + ((a >>> 16) & 0xFF)] ^ T[1024 + (a >>> 24)]
      ^ T[768 + (b & 0xFF)] ^ T[512 + ((b >>> 8) & 0xFF)] ^ T[256 + ((b >>> 16) & 0xFF)] ^ T[b >>> 24];
  }
  for (; i < n; i++) c = T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const crc32 = (typeof zlib.crc32 === 'function' && !process.env.FILESHARE_JSCRC)
  ? function (b) { return zlib.crc32(b) >>> 0; } : crc32js;

function lanIps() {
  const ips = [];
  let ifs = {};
  try { ifs = os.networkInterfaces(); } catch (e) { return ips; }
  const names = Object.keys(ifs);
  const score = function (n) { return /^(en|eth|wl|wlan|wi-?fi|ethernet)/i.test(n) ? 0 : 1; };
  names.sort(function (a, b) { return score(a) - score(b); });
  for (const name of names) {
    for (const info of ifs[name] || []) {
      const fam = info.family === 4 ? 'IPv4' : info.family;
      if (fam !== 'IPv4' || info.internal) continue;
      if (info.address.indexOf('127.') === 0 || info.address.indexOf('169.254.') === 0) continue;
      if (ips.indexOf(info.address) < 0) ips.push(info.address);
    }
  }
  return ips.slice(0, 3);
}

function isPrivateHost(host) {
  const h = String(host).toLowerCase();
  if (h === 'localhost' || /\.local$/.test(h) || /\.lan$/.test(h)) return true;
  if (net.isIPv4(h)) {
    const p = h.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] === 0;
  }
  if (net.isIPv6(h)) {
    if (h === '::1' || h === '::') return true;
    const m = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateHost(m[1]);
    return /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  return false;
}

const WIN_RESERVED = new Set(['CON', 'PRN', 'AUX', 'NUL']);
for (let i = 1; i < 10; i++) { WIN_RESERVED.add('COM' + i); WIN_RESERVED.add('LPT' + i); }
const BAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

// Python's os.path.splitext: a leading dot is not an extension.
function splitext(name) {
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const dot = name.lastIndexOf('.');
  if (dot <= slash) return [name, ''];
  let i = slash + 1;
  while (i < dot && name[i] === '.') i++;
  if (i === dot) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
}

function safeComponent(part) {
  part = String(part).replace(BAD_CHARS, '_').trim().replace(/[. ]+$/, '');
  if (part === '' || part === '.' || part === '..') part = '_';
  if (WIN_RESERVED.has(part.split('.')[0].toUpperCase())) part = '_' + part;
  if (part.length > 180) {
    const se = splitext(part);
    const ext = se[1].slice(0, 20);
    part = se[0].slice(0, 180 - ext.length) + ext;
  }
  return part;
}

function safeRelpath(rel) {
  const parts = String(rel).split(/[\\/]+/).filter(function (p) { return p !== '' && p !== '.'; });
  if (!parts.length) return '_';
  return parts.map(safeComponent).join('/');
}

function lexists(p) {
  try { fs.lstatSync(p); return true; } catch (e) { return false; }
}

function exists(p) {
  try { fs.statSync(p); return true; } catch (e) { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (e) { return false; }
}

function uniquePath(folder, name) {
  const p = path.join(folder, name);
  if (!lexists(p)) return p;
  let se = splitext(name);
  let root = se[0], ext = se[1];
  if (root === '' || ext === name) { root = name; ext = ''; }
  for (let i = 1; ; i++) {
    const cand = path.join(folder, root + ' (' + i + ')' + ext);
    if (!lexists(cand)) return cand;
  }
}

function expandUser(s) {
  if (s === '~' || s.indexOf('~/') === 0 || (IS_WINDOWS && s.indexOf('~\\') === 0)) {
    return path.join(os.homedir(), s.slice(1));
  }
  return s;
}

function cleanPathArg(arg) {
  // Accept typed, quoted, or drag-and-dropped paths on every platform.
  let s = arg.trim();
  if (s.indexOf('& ') === 0) s = s.slice(2).trim();          // PowerShell drag-and-drop: & 'C:\x y'
  if (s.length >= 2 && s[0] === s[s.length - 1] && (s[0] === '"' || s[0] === "'")) s = s.slice(1, -1);
  if (s.indexOf('file://') === 0) {
    try {
      s = decodeURIComponent(s.slice(7));
      if (IS_WINDOWS && /^\/[A-Za-z]:/.test(s)) s = s.slice(1);
    } catch (e) { /* keep */ }
  }
  s = expandUser(s);
  if (!exists(s) && !IS_WINDOWS && s.indexOf('\\') >= 0) {
    const unescaped = s.replace(/\\(.)/g, '$1');            // macOS/Linux drag: My\ File.mp4
    if (exists(unescaped)) s = unescaped;
  }
  return s;
}

// fnmatch-style pattern for one path component (*, ?, [abc], [!abc]).
function globRegex(pat) {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const j = pat.indexOf(']', i + 2 <= pat.length ? i + 2 : i + 1);
      if (j < 0) { re += '\\['; continue; }
      let body = pat.slice(i + 1, j);
      i = j;
      if (body[0] === '!') body = '^' + body.slice(1);
      re += '[' + body.replace(/\\/g, '\\\\') + ']';
    } else re += c.replace(/[.+^${}()|\\\]]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', IS_WINDOWS ? 'i' : '');
}

function hasMagic(s) { return /[*?[]/.test(s); }

function globPaths(pattern) {
  const sepRe = IS_WINDOWS ? /[\\/]/ : /\//;
  let start = '', rest = pattern;
  if (path.isAbsolute(pattern)) {
    const root = path.parse(pattern).root;
    start = root; rest = pattern.slice(root.length);
  }
  const parts = rest.split(sepRe).filter(function (p) { return p !== ''; });
  let current = [start];
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    const next = [];
    for (const base of current) {
      if (!hasMagic(part)) {
        const p = base ? path.join(base, part) : part;
        if (k === parts.length - 1 ? lexists(p) : isDir(p)) next.push(p);
        continue;
      }
      let names = [];
      try { names = fs.readdirSync(base || '.'); } catch (e) { continue; }
      const re = globRegex(part);
      for (const n of names) {
        if (n[0] === '.' && part[0] !== '.') continue;       // like glob: * skips hidden names
        if (!re.test(n)) continue;
        const p = base ? path.join(base, n) : n;
        if (k < parts.length - 1 && !isDir(p)) continue;
        next.push(p);
      }
    }
    current = next;
    if (!current.length) break;
  }
  return current.filter(function (p) { return p !== ''; }).sort();
}

function normcase(p) {
  return IS_WINDOWS ? p.replace(/\//g, '\\').toLowerCase() : p;
}

function parsePaths(arg) {
  // Split an upload argument into paths: quoted, escaped, dragged, several, or wildcards.
  // Returns [existing paths, missing names].
  let s = arg.trim();
  if (!s) return [[], []];
  const one = cleanPathArg(s);
  if (exists(one)) return [[one], []];
  if (s.indexOf('& ') === 0) s = s.slice(2).trim();
  const pat = IS_WINDOWS ? /"([^"]*)"|'([^']*)'|(\S+)/g : /"([^"]*)"|'([^']*)'|((?:\\.|\S)+)/g;
  const toks = [];
  let m;
  while ((m = pat.exec(s)) !== null) {
    if (m[1] !== undefined) toks.push([m[1], true]);
    else if (m[2] !== undefined) toks.push([m[2], true]);
    else toks.push([m[3], false]);
  }
  const found = [], missing = [];
  let i = 0;
  while (i < toks.length) {
    const text = toks[i][0], quoted = toks[i][1];
    const p = cleanPathArg(text);
    if (exists(p)) { found.push(p); i++; continue; }
    let hit = null;
    if (!quoted) {                       // unquoted name with spaces: join the next words
      let j = i, acc = text;
      while (j + 1 < toks.length && !toks[j + 1][1] && j - i < 30) {
        j++;
        acc = acc + ' ' + toks[j][0];
        const cand = cleanPathArg(acc);
        if (exists(cand)) { hit = [cand, j]; break; }
      }
    }
    if (hit !== null) { found.push(hit[0]); i = hit[1] + 1; continue; }
    if (hasMagic(p)) {
      const matches = globPaths(p);
      if (matches.length) { for (const x of matches) found.push(x); i++; continue; }
    }
    missing.push(p);
    i++;
  }
  const seen = new Set(), out = [];
  for (const p of found) {
    const k = normcase(path.resolve(p));
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return [out, missing];
}

function diskFree(p) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(p);
      return Number(st.bavail) * Number(st.bsize);
    }
  } catch (e) { /* unknown */ }
  return null;
}

function rmTree(p) {
  try {
    if (typeof fs.rmSync === 'function') { fs.rmSync(p, { recursive: true, force: true }); return; }
  } catch (e) { /* fall back */ }
  let st;
  try { st = fs.lstatSync(p); } catch (e) { return; }
  if (st.isDirectory()) {
    let names = [];
    try { names = fs.readdirSync(p); } catch (e) { /* ignore */ }
    for (const n of names) rmTree(path.join(p, n));
    try { fs.rmdirSync(p); } catch (e) { /* ignore */ }
  } else {
    try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
  }
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function errText(e) {
  if (!e) return 'error';
  if (e.code && e.syscall) {
    const map = { ENOENT: 'No such file or directory', EACCES: 'Permission denied', EPERM: 'Operation not permitted',
      ENOSPC: 'No space left on device', EISDIR: 'Is a directory', ENOTDIR: 'Not a directory', EROFS: 'Read-only file system',
      EADDRINUSE: 'Address already in use', EMFILE: 'Too many open files', EBUSY: 'Resource busy or locked' };
    return map[e.code] || e.code;
  }
  return e.message || String(e);
}

class Meter {
  // Transfer speed over the last few seconds.
  constructor() { this.samples = []; }
  add(total) {
    const now = mono();
    this.samples.push([now, total]);
    while (this.samples.length > 2 && now - this.samples[0][0] > 6.0) this.samples.shift();
  }
  rate() {
    if (this.samples.length < 2) return 0.0;
    const a = this.samples[0], b = this.samples[this.samples.length - 1];
    return b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0.0;
  }
  reset() { this.samples = []; }
}

// A wake-up signal: wait(sec) resolves on notify() or after sec seconds.
class Signal {
  constructor() { this.waiters = []; }
  wait(sec) {
    const self = this;
    return new Promise(function (resolve) {
      const w = { resolve: resolve, timer: null };
      w.timer = setTimeout(function () {
        const i = self.waiters.indexOf(w);
        if (i >= 0) self.waiters.splice(i, 1);
        resolve(false);
      }, Math.max(0, sec * 1000));
      self.waiters.push(w);
    });
  }
  notify() {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) { clearTimeout(w.timer); w.resolve(true); }
  }
}

class Event {
  constructor() { this.flag = false; this.sig = new Signal(); }
  set() { this.flag = true; this.sig.notify(); }
  clear() { this.flag = false; }
  async wait(sec) { if (this.flag) return true; await this.sig.wait(sec); return this.flag; }
}

// Bytes received but not used yet, kept as a list of chunks (no quadratic copying).
class BufList {
  constructor(first) { this.chunks = []; this.length = 0; if (first && first.length) this.push(first); }
  push(b) { if (b.length) { this.chunks.push(b); this.length += b.length; } }
  flat() {
    if (this.chunks.length > 1) this.chunks = [Buffer.concat(this.chunks, this.length)];
    return this.chunks.length ? this.chunks[0] : Buffer.alloc(0);
  }
  peek(n) {
    if (!this.chunks.length) return Buffer.alloc(0);
    if (this.chunks[0].length >= n) return this.chunks[0].subarray(0, n);
    const out = Buffer.allocUnsafe(Math.min(n, this.length));
    let o = 0;
    for (const c of this.chunks) {
      const k = Math.min(c.length, out.length - o);
      c.copy(out, o, 0, k);
      o += k;
      if (o >= out.length) break;
    }
    return out;
  }
  take(n) {
    n = Math.min(n, this.length);
    if (!n) return Buffer.alloc(0);
    const first = this.chunks[0];
    if (first.length >= n) {
      const out = first.subarray(0, n);
      if (first.length === n) this.chunks.shift(); else this.chunks[0] = first.subarray(n);
      this.length -= n;
      return out;
    }
    const out = Buffer.allocUnsafe(n);
    let o = 0;
    while (o < n) {
      const c = this.chunks[0];
      const k = Math.min(c.length, n - o);
      c.copy(out, o, 0, k);
      o += k;
      if (k === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(k);
    }
    this.length -= n;
    return out;
  }
  indexOf(delim) { return this.length ? this.flat().indexOf(delim) : -1; }
  all() { const b = this.flat(); this.chunks = []; this.length = 0; return b; }
}

// ======================================================================
// Console: messages, one live status line, and the input line
// ======================================================================
class Console {
  constructor() {
    this.tty = !!(process.stdout && process.stdout.isTTY);
    this.prompt = '> ';
    this.status = '';
    this.typed = '';
    this.drawn = 0;
    this.lastPlainStatus = 0.0;
    this.dead = false;
    const self = this;
    if (process.stdout && process.stdout.on) {
      process.stdout.on('error', function () { self.dead = true; });
    }
  }

  _out(s) {
    if (this.dead) return;
    try { process.stdout.write(s); } catch (e) { this.dead = true; }
  }

  _width() {
    const c = process.stdout && process.stdout.columns;
    return Math.max(20, (c || 80) - 1);
  }

  _line() {
    const width = this._width();
    let right = this.prompt + this.typed;
    if (right.length > width) {
      const keep = Math.max(1, width - this.prompt.length - 1);
      right = this.prompt + '<' + this.typed.slice(-keep);
    }
    let left = this.status;
    if (left) {
      const avail = width - right.length - 3;
      left = avail >= 12 ? (left.slice(0, avail) + ' | ') : '';
    }
    return left + right;
  }

  _clear() {
    if (this.tty && this.drawn) this._out('\r' + ' '.repeat(this.drawn) + '\r');
    this.drawn = 0;
  }

  _draw() {
    if (!this.tty) return;
    const line = this._line();
    const pad = Math.max(0, this.drawn - line.length);
    this._out('\r' + line + (pad ? ' '.repeat(pad) + '\r' + line : ''));
    this.drawn = line.length;
  }

  say(text) {
    this._clear();
    this._out(text + '\n');
    if (this.tty) this._draw();
  }

  setPrompt(prompt, announce) {
    this.prompt = prompt;
    if (this.tty) { this._clear(); this._draw(); } else if (announce) this._out(prompt + '\n');
  }

  setStatus(text) {
    if (text === this.status) return;
    this.status = text;
    if (this.tty) this._draw();
    else if (text && mono() - this.lastPlainStatus > 5.0) {
      this.lastPlainStatus = mono();
      this._out(text + '\n');
    }
  }

  addChar(ch) {
    this.typed += ch;
    const line = this._line();
    if (this.tty && line.length === this.drawn + ch.length && line.endsWith(this.typed)) {
      this._out(ch);
      this.drawn = line.length;
    } else this._draw();
  }

  setTyped(text) {
    this.typed = text;
    this._draw();
  }

  lineDone(echoNewline) {
    if (echoNewline && this.tty) this._out('\n');
    this.typed = '';
    this.drawn = 0;
    if (this.tty) this._draw();
  }
}

const CONSOLE = new Console();

function say(text) {
  CONSOLE.say(text);
}

// ======================================================================
// Keyboard input: our own line editor so Ctrl+Z works on every OS
// ======================================================================
class LineEditor {
  // onLine(text), onCtrlZ(), onExit(): called for each finished line and key.
  constructor(onLine, onCtrlZ, onExit) {
    this.onLine = onLine;
    this.onCtrlZ = onCtrlZ;
    this.onExit = onExit;
    this.mode = 'line';
    this.typed = '';
    this.esc = 0;           // 0 = normal, 1 = after ESC, 2 = inside ESC [ ... sequence
    this.escCount = 0;
    this.winPrefix = false;
    this.rl = null;
    const stdin = process.stdin;
    const self = this;
    let raw = false;
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
      try { stdin.setRawMode(true); raw = true; } catch (e) { raw = false; }
    }
    if (raw) {
      this.mode = 'raw';
      stdin.setEncoding('utf8');
      stdin.on('data', function (s) { self._keys(s); });
      stdin.on('end', function () { self.onExit(); });
      stdin.resume();
    } else {
      this.rl = readline.createInterface({ input: stdin, terminal: false, crlfDelay: Infinity });
      this.rl.on('line', function (line) {
        CONSOLE.lineDone(false);
        self.onLine(line);
      });
      // no keyboard (e.g. started in background): keep serving
      this.rl.on('close', function () { /* stay running */ });
    }
  }

  close() {
    if (this.mode === 'raw') {
      try { process.stdin.setRawMode(false); } catch (e) { /* ignore */ }
      try { process.stdin.pause(); } catch (e) { /* ignore */ }
    }
    if (this.rl) { try { this.rl.close(); } catch (e) { /* ignore */ } }
  }

  _keys(s) {
    for (const ch of s) {
      try { this._key(ch); } catch (e) { debug('key', e); }
    }
  }

  _key(ch) {
    if (this.esc === 1) {                         // ESC [ ... final byte
      if (ch === '[' || ch === 'O') { this.esc = 2; this.escCount = 0; return; }
      this.esc = 0;
      return;
    }
    if (this.esc === 2) {
      this.escCount++;
      if ((ch >= '@' && ch <= '~' && ch !== '[' && ch !== ';') || this.escCount >= 8) this.esc = 0;
      return;
    }
    if (this.winPrefix) { this.winPrefix = false; return; }
    if (ch === '\r' || ch === '\n') {
      const line = this.typed;
      this.typed = '';
      CONSOLE.lineDone(true);
      this.onLine(line);
      return;
    }
    if (ch === '\x03') { this.onExit(); return; }
    if (ch === '\x1a') { this.onCtrlZ(); return; }
    if (ch === '\x04' && !this.typed) { this.onExit(); return; }
    if (ch === '\x08' || ch === '\x7f') {
      this.typed = Array.from(this.typed).slice(0, -1).join('');
      CONSOLE.setTyped(this.typed);
      return;
    }
    if (ch === '\x15') { this.typed = ''; CONSOLE.setTyped(''); return; }
    if (ch === '\x1b') { this.esc = 1; return; }
    if (ch === '\t') ch = ' ';
    if (ch < ' ') return;
    this.typed += ch;
    CONSOLE.addChar(ch);
  }
}

// ======================================================================
// Errors used to tell the connection attempts apart
// ======================================================================
class NotUs extends Error {            // something answered, but it is not file-share
  constructor(m) { super(m || 'not file-share'); this.name = 'NotUs'; }
}
class Busy extends Error {
  constructor(m) { super(m || 'busy'); this.name = 'Busy'; }
}
class PortDown extends Error {         // nothing accepts connections on that host:port
  constructor(m) { super(m || 'port down'); this.name = 'PortDown'; }
}
class SoftEOF extends NotUs {          // accepted, then closed at once (tunnel without app, ...)
  constructor(m) { super(m || 'closed at once'); this.name = 'SoftEOF'; }
}
class TunnelNoApp extends SoftEOF {    // the tunnel answered (HTTP 502/503/504), nothing behind it yet
  constructor(m) { super(m || 'tunnel is up, app not running yet'); this.name = 'TunnelNoApp'; }
}
class HostDown extends PortDown {      // the host name does not resolve
  constructor(m) { super(m || 'host down'); this.name = 'HostDown'; }
}

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'EAI_FAIL', 'EAI_NODATA', 'EAI_ADDRFAMILY', 'ESERVFAIL']);
const VERIFY_CODES = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT',
  'CERT_NOT_YET_VALID', 'CERT_UNTRUSTED', 'CERT_SIGNATURE_FAILURE', 'CERT_REJECTED', 'HOSTNAME_MISMATCH',
  'UNABLE_TO_DECRYPT_CERT_SIGNATURE', 'INVALID_CA', 'PATH_LENGTH_EXCEEDED', 'INVALID_PURPOSE', 'CERT_CHAIN_TOO_LONG']);

function isVerifyError(e) {
  if (!e) return false;
  if (e.code && VERIFY_CODES.has(e.code)) return true;
  return /certificate|self.signed|unable to verify/i.test(String(e.message || ''));
}

function isResetError(e) {
  if (!e) return false;
  return e.code === 'ECONNRESET' || e.code === 'EPIPE' || e.code === 'ECONNABORTED' ||
    /socket hang up|disconnected before secure|closed at once/i.test(String(e.message || ''));
}

// ---- TLS ----
// Client "contexts": public sites are verified; a direct LAN peer is trusted by its pinned
// certificate; the last resort is encrypted but unverified (very old certificate stores).
const TLS_MODES = ['verified', 'pinned', 'insecure'];

function tlsOptions(mode) {
  if (mode === 'pinned') return { ca: TLS_CERT, checkServerIdentity: function () { return undefined; } };
  if (mode === 'insecure') return { rejectUnauthorized: false };
  return {};
}

let warnedInsecure = false;
function noteMode(mode) {
  if (mode === 'insecure' && !warnedInsecure) {
    warnedInsecure = true;
    say("[!] This computer could not verify the tunnel's HTTPS certificate (its certificate " +
      'store is missing or outdated). The link is still encrypted. Updating Node.js fixes this.');
  }
}

let serverCtxCache;
function serverCtx() {
  if (serverCtxCache === undefined) {
    try {
      serverCtxCache = tls.createSecureContext({ cert: TLS_CERT, key: TLS_KEY });
    } catch (e) {
      debug('server ctx', e);
      serverCtxCache = null;
    }
  }
  return serverCtxCache;
}

function tuneSocket(sock) {
  try { sock.setNoDelay(true); } catch (e) { /* ignore */ }
  try { sock.setKeepAlive(true, KEEPALIVE_IDLE * 1000); } catch (e) { /* ignore */ }
}

function lookupAll(host) {
  return new Promise(function (resolve, reject) {
    if (net.isIP(host)) { resolve([{ address: host, family: net.isIP(host) }]); return; }
    require('dns').lookup(host, { all: true }, function (err, addrs) {
      if (err) reject(err); else resolve(addrs || []);
    });
  });
}

function connectOne(address, port) {
  return new Promise(function (resolve, reject) {
    let done = false;
    const sock = net.connect({ host: address, port: port });
    const timer = setTimeout(function () {
      if (done) return;
      done = true;
      sock.destroy();
      const e = new Error('timed out');
      e.code = 'ETIMEDOUT';
      reject(e);
    }, CONNECT_TIMEOUT * 1000);
    sock.once('connect', function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.on('error', function () { /* handled by the owner */ });
      resolve(sock);
    });
    sock.once('error', function (e) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      reject(e);
    });
  });
}

async function connectTcp(host, port) {
  let addrs;
  try {
    addrs = await lookupAll(host);
  } catch (e) {
    if (DNS_CODES.has(e.code)) throw new HostDown(host);
    throw new PortDown(String(e.message || e));
  }
  if (!addrs.length) throw new HostDown(host);
  let last = null;
  for (const a of addrs) {
    try {
      const sock = await connectOne(a.address, port);
      tuneSocket(sock);
      return sock;
    } catch (e) {
      last = e;
    }
  }
  throw new PortDown(String((last && last.message) || 'cannot connect'));
}

function tlsHandshake(raw, host, mode) {
  return new Promise(function (resolve, reject) {
    let done = false;
    const opts = tlsOptions(mode);
    opts.socket = raw;
    opts.ALPNProtocols = ['http/1.1'];
    if (!net.isIP(host)) opts.servername = host;
    let s;
    try { s = tls.connect(opts); } catch (e) { reject(e); return; }
    const timer = setTimeout(function () { fail(new NotUs('TLS timed out')); }, CONNECT_TIMEOUT * 1000);
    function fail(e) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { s.destroy(); } catch (x) { /* ignore */ }
      try { raw.destroy(); } catch (x) { /* ignore */ }
      reject(e);
    }
    s.once('secureConnect', function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      s.on('error', function () { /* handled by the owner */ });
      resolve(s);
    });
    s.once('error', fail);
    s.once('close', function () { fail(new SoftEOF('closed at once')); });
  });
}

async function connectTls(host, port, holder) {
  // Public sites: full certificate checks. Direct LAN peer: its pinned certificate.
  const modes = holder.length ? [holder[0]] : TLS_MODES;
  let last = null;
  for (const mode of modes) {
    const raw = await connectTcp(host, port);
    try {
      const s = await tlsHandshake(raw, host, mode);
      if (!holder.length) {
        holder.push(mode);
        noteMode(mode);
      }
      return s;
    } catch (e) {
      last = e;
      if (e instanceof SoftEOF || isResetError(e)) throw new SoftEOF('closed at once');
      if (!isVerifyError(e)) break;
    }
  }
  throw new NotUs('TLS failed: ' + (last && last.message));
}

// ======================================================================
// Connections: a byte pipe with write()/close() and data/close callbacks
// ======================================================================
class Pipe {
  constructor(label) {
    this.label = label;
    this.closed = false;
    this.ended = false;
    this.h = null;
    this.pend = [];
    this.flushing = false;
    this.ondrain = null;
    this.pingInterval = PING_INTERVAL;
    this.deadAfter = DEAD_AFTER;
    this.handshakeTimeout = 6.0;       // our peer answers at once; silence = something else
  }

  setHandlers(ondata, onclose) {
    this.h = { ondata: ondata, onclose: onclose, closedSent: false };
    this._flush();
  }

  clearHandlers() { this.h = null; }

  unshift(buf) { if (buf && buf.length) this.pend.unshift(buf); }

  _emit(buf) {
    if (buf && buf.length) this.pend.push(buf);
    this._flush();
  }

  _end() {
    this.closed = true;
    if (this.ended) return;
    this.ended = true;
    this._flush();
  }

  _flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.h && this.pend.length) {
        const h = this.h;
        const b = this.pend.shift();
        try { h.ondata(b); } catch (e) { debug('ondata', e); }
      }
      if (this.h && this.ended && !this.pend.length && !this.h.closedSent) {
        const h = this.h;
        h.closedSent = true;
        try { h.onclose(); } catch (e) { debug('onclose', e); }
      }
    } finally {
      this.flushing = false;
    }
    if (this.h && (this.pend.length || (this.ended && !this.h.closedSent))) this._flush();
  }

  _drained() {
    if (this.ondrain) {
      try { this.ondrain(); } catch (e) { debug('ondrain', e); }
    }
  }
}

class SockConn extends Pipe {
  // Plain or TLS socket.
  constructor(sock, label, pre) {
    super(label);
    this.sock = sock;
    this.needDrain = false;
    const self = this;
    if (pre && pre.length) this.pend.push(pre);
    sock.on('data', function (b) { if (!self.closed) self._emit(b); });
    sock.on('end', function () { self._end(); });
    sock.on('close', function () { self._end(); });
    sock.on('error', function () { self._end(); });
    sock.on('drain', function () { self.needDrain = false; self._drained(); });
  }

  canWrite() { return !this.closed && !this.needDrain; }

  write(buf) {
    if (this.closed) throw new Error('closed');
    const ok = this.sock.write(buf);
    if (!ok) this.needDrain = true;
    return ok;
  }

  close() {
    this.closed = true;
    if (!this.closing) {
      this.closing = true;
      const sock = this.sock;
      if (!sock.destroyed && !sock.writableEnded) {
        try { sock.end(); } catch (e) { /* ignore */ }
        setTimeout(function () { try { sock.destroy(); } catch (e) { /* ignore */ } }, 1500).unref();
      } else {
        try { sock.destroy(); } catch (e) { /* ignore */ }
      }
    }
    this._end();
  }
}

class Reader {
  // Promise-style helpers over a pipe's data, with a deadline.
  constructor(conn, pre) {
    this.conn = conn;
    this.buf = new BufList(pre);
    this.eof = false;
    this.sig = new Signal();
    const self = this;
    conn.setHandlers(function (d) { self.buf.push(d); self.sig.notify(); },
      function () { self.eof = true; self.sig.notify(); });
  }

  async _fill(deadline) {
    const have = this.buf.length;
    while (this.buf.length === have) {
      if (this.eof) { const e = new Error('closed'); e.eof = true; throw e; }
      const left = deadline - mono();
      if (left <= 0) throw new NotUs('no reply');
      await this.sig.wait(Math.min(1.0, left));
    }
  }

  async until(delim, limit, deadline) {
    for (;;) {
      const i = this.buf.indexOf(delim);
      if (i >= 0) return this.buf.take(i + delim.length);
      if (this.buf.length > limit) throw new NotUs('header too large');
      await this._fill(deadline);
    }
  }

  async exact(n, deadline) {
    while (this.buf.length < n) await this._fill(deadline);
    return this.buf.take(n);
  }

  release() {
    // stop reading; whatever was received but not used goes back to the pipe
    this.conn.clearHandlers();
    const rest = this.buf.all();
    return rest;
  }
}

// XOR with a 4-byte WebSocket mask key, 4 bytes at a time.
function wsMask(src, key) {
  const n = src.length;
  const out = Buffer.allocUnsafe(n);
  src.copy(out, 0, 0, n);
  let i = 0;
  if (n >= 64 && out.byteOffset % 4 === 0) {
    const k = new Uint32Array(1);
    new Uint8Array(k.buffer).set(key);
    const kv = k[0];
    const words = new Uint32Array(out.buffer, out.byteOffset, n >>> 2);
    for (let w = 0; w < words.length; w++) words[w] ^= kv;
    i = words.length * 4;
  }
  for (; i < n; i++) out[i] ^= key[i & 3];
  return out;
}

class WSConn extends Pipe {
  // WebSocket (RFC 6455) used as a plain byte pipe; works through HTTP(S) tunnels.
  constructor(base, client, label, pre) {
    super(label);
    this.base = base;
    this.client = client;
    this.buf = new BufList(pre);
    const self = this;
    base.ondrain = function () { self._drained(); };
    base.setHandlers(function (d) { self.buf.push(d); self._parse(); },
      function () { self._parse(); self._end(); });
    if (this.buf.length) this._parse();
  }

  canWrite() { return !this.closed && this.base.canWrite(); }

  _frame(opcode, payload) {
    const n = payload.length;
    const mbit = this.client ? 0x80 : 0;
    let hdr;
    if (n < 126) {
      hdr = Buffer.allocUnsafe(2);
      hdr[1] = mbit | n;
    } else if (n < 65536) {
      hdr = Buffer.allocUnsafe(4);
      hdr[1] = mbit | 126;
      hdr.writeUInt16BE(n, 2);
    } else {
      hdr = Buffer.allocUnsafe(10);
      hdr[1] = mbit | 127;
      hdr.writeUInt32BE(Math.floor(n / 4294967296), 2);
      hdr.writeUInt32BE(n >>> 0, 6);
    }
    hdr[0] = 0x80 | opcode;
    if (this.client) {
      const key = crypto.randomBytes(4);
      return [hdr, key, wsMask(payload, key)];
    }
    return [hdr, payload];
  }

  _sendFrame(opcode, payload) {
    const parts = this._frame(opcode, payload);
    let ok = true;
    if (parts.length === 2 && parts[1].length > 16384) {
      this.base.write(parts[0]);
      ok = this.base.write(parts[1]);
    } else ok = this.base.write(Buffer.concat(parts));
    return ok;
  }

  write(data) {
    if (this.closed) throw new Error('closed');
    let ok = true;
    for (let i = 0; i < data.length; i += WS_MAX_FRAME) {
      ok = this._sendFrame(2, data.subarray(i, i + WS_MAX_FRAME));
    }
    return ok;
  }

  _parse() {
    for (;;) {
      if (this.closed) return;
      const b = this.buf;
      if (b.length < 2) return;
      const h = b.peek(14);
      let n = h[1] & 0x7F;
      let pos = 2;
      if (n === 126) {
        if (b.length < 4) return;
        n = h.readUInt16BE(2);
        pos = 4;
      } else if (n === 127) {
        if (b.length < 10) return;
        n = h.readUInt32BE(2) * 4294967296 + h.readUInt32BE(6);
        pos = 10;
      }
      if (n > MAX_FRAME) { this.close(); return; }
      const masked = (h[1] & 0x80) !== 0;
      if (masked) pos += 4;
      if (b.length < pos + n) return;
      const opcode = h[0] & 0x0F;
      const key = masked ? Buffer.from(h.subarray(pos - 4, pos)) : null;
      b.take(pos);
      let payload = b.take(n);
      if (masked) payload = wsMask(payload, key);
      if (opcode === 0 || opcode === 1 || opcode === 2) {
        if (payload.length) this._emit(payload);
      } else if (opcode === 8) {
        try { this._sendFrame(8, payload.subarray(0, 2)); } catch (e) { /* ignore */ }
        this.close();
        return;
      } else if (opcode === 9) {
        try { this._sendFrame(10, payload); } catch (e) { /* ignore */ }
      }
    }
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      try {
        if (!this.base.closed) this._sendFrame(8, Buffer.from([0x03, 0xe8]));
      } catch (e) { /* ignore */ }
    }
    this.base.close();
    this._end();
  }
}

function httpHead(lines) {
  return Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'latin1');
}

function parseHead(raw) {
  const text = raw.toString('latin1');
  const lines = text.split('\r\n');
  const first = lines[0].split(' ');
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const c = line.indexOf(':');
    if (c >= 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
  }
  return [first, headers];
}

function hostHeader(host, port, isTls) {
  const h = host.indexOf(':') >= 0 ? '[' + host + ']' : host;
  if ((isTls && port === 443) || (!isTls && port === 80)) return h;
  return h + ':' + port;
}

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

async function wsClient(host, port, isTls, holder) {
  const sock = isTls ? await connectTls(host, port, holder) : await connectTcp(host, port);
  const base = new SockConn(sock, 'ws');
  try {
    const key = crypto.randomBytes(16).toString('base64');
    const lines = ['GET /fs/ws HTTP/1.1',
      'Host: ' + hostHeader(host, port, isTls),
      'Upgrade: websocket', 'Connection: Upgrade',
      'Sec-WebSocket-Key: ' + key, 'Sec-WebSocket-Version: 13',
      MARK_HEADER + ': 1'];
    for (const k of Object.keys(TUNNEL_HEADERS)) lines.push(k + ': ' + TUNNEL_HEADERS[k]);
    base.write(httpHead(lines));
    const rd = new Reader(base);
    let head;
    try {
      head = await rd.until(Buffer.from('\r\n\r\n'), 65536, mono() + CONNECT_TIMEOUT);
    } catch (e) {
      if (e.eof) {
        if (!rd.buf.length) throw new SoftEOF('closed at once');
        throw new NotUs('closed');
      }
      throw e;
    }
    const ph = parseHead(head), first = ph[0], headers = ph[1];
    if (first.length >= 2 && (first[1] === '502' || first[1] === '503' || first[1] === '504')) {
      throw new TunnelNoApp('tunnel is up, app not running yet');
    }
    if (first.length < 2 || first[1] !== '101' || headers['sec-websocket-accept'] !== wsAccept(key)) {
      throw new NotUs('no websocket');
    }
    const rest = rd.release();
    return new WSConn(base, true, isTls ? 'WebSocket over HTTPS' : 'WebSocket over HTTP', rest);
  } catch (e) {
    base.close();
    throw e;
  }
}

class PollClientConn extends Pipe {
  // Last-resort transport: ordinary HTTP requests (long polling), reliable and ordered.
  constructor(host, port, isTls, holder) {
    super(isTls ? 'HTTPS polling' : 'HTTP polling');
    this.host = host;
    this.port = port;
    this.tls = isTls;
    this.holder = holder;
    this.outbuf = new BufList();
    this.sid = null;
    this.agent = null;
    this.upSig = new Signal();
    this.pingInterval = POLL_PING_INTERVAL;
    this.deadAfter = POLL_DEAD_AFTER;
    this.handshakeTimeout = HANDSHAKE_TIMEOUT;
  }

  _newAgent() {
    const mod = this.tls ? https : http;
    return new mod.Agent({ keepAlive: true, maxSockets: 4, keepAliveMsecs: 10000 });
  }

  _request(method, p, body, timeoutSec) {
    const self = this;
    return new Promise(function (resolve, reject) {
      const mod = self.tls ? https : http;
      const headers = {};
      for (const k of Object.keys(TUNNEL_HEADERS)) headers[k] = TUNNEL_HEADERS[k];
      headers[MARK_HEADER] = '1';
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Length'] = String(body ? body.length : 0);
      const opts = { host: self.host, port: self.port, method: method, path: p, headers: headers, agent: self.agent };
      if (self.tls) {
        const extra = tlsOptions(self.holder[0] || 'verified');
        for (const k of Object.keys(extra)) opts[k] = extra[k];
        if (!net.isIP(self.host)) opts.servername = self.host;
      }
      let done = false;
      let tcpUp = false, up = false;
      let req;
      function fail(e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        e = e || new Error('request failed');
        e.tcpUp = tcpUp;
        e.connected = up;
        try { req.destroy(); } catch (x) { /* ignore */ }
        reject(e);
      }
      const timer = setTimeout(function () {
        const e = new Error('timed out');
        e.code = 'ETIMEDOUT';
        e.timeout = true;
        fail(e);
      }, timeoutSec * 1000);
      try {
        req = mod.request(opts, function (res) {
          up = true;
          const chunks = [];
          let n = 0;
          res.on('data', function (c) {
            chunks.push(c);
            n += c.length;
            if (n > MAX_FRAME) fail(new Error('reply too large'));
          });
          res.on('end', function () {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve({ status: res.statusCode, mark: res.headers[MARK_HEADER.toLowerCase()],
              seq: res.headers['x-seq'], data: Buffer.concat(chunks, n) });
          });
          res.on('error', fail);
          res.on('aborted', function () { fail(new Error('socket hang up')); });
        });
      } catch (e) {
        fail(e);
        return;
      }
      req.on('socket', function (s) {
        if (s.connecting === false && !s.destroyed) { tcpUp = true; up = true; return; }
        s.once('connect', function () { tcpUp = true; if (!self.tls) up = true; });
        s.once('secureConnect', function () { tcpUp = true; up = true; });
      });
      req.on('error', fail);
      req.end(body && body.length ? body : undefined);
    });
  }

  async open() {
    let last = null;
    const tries = (this.holder.length || !this.tls) ? [null] : TLS_MODES;
    for (const mode of tries) {
      if (mode !== null) this.holder.splice(0, this.holder.length, mode);
      this.agent = this._newAgent();
      try {
        let r;
        try {
          r = await this._request('POST', '/fs/p/new', null, CONNECT_TIMEOUT);
        } catch (e) {
          if (!e.tcpUp) {
            if (DNS_CODES.has(e.code)) throw new HostDown(this.host);
            throw new PortDown(String(e.message || e));
          }
          if (!e.connected) {                      // TLS handshake failed
            if (isVerifyError(e)) throw e;
            if (isResetError(e)) throw new SoftEOF('closed at once');
            throw new NotUs(String(e.message || e));
          }
          if (isResetError(e)) throw new SoftEOF('closed at once');
          throw new NotUs(String(e.message || e));
        }
        if (r.status === 502 || r.status === 503 || r.status === 504) throw new TunnelNoApp();
        const text = r.data.toString('latin1').trim();
        if (r.status !== 200 || r.mark !== '1' || !/^[0-9a-f]{16,64}$/.test(text)) throw new NotUs('not file-share');
        this.sid = text;
        if (this.tls && this.holder.length) noteMode(this.holder[0]);
        break;
      } catch (e) {
        last = e;
        try { this.agent.destroy(); } catch (x) { /* ignore */ }
        if (this.tls && mode !== null) {
          this.holder.length = 0;          // only a mode that worked is remembered
          if (isVerifyError(e)) continue;
        }
        throw e;
      }
    }
    if (this.sid === null) throw (last || new NotUs('not file-share'));
    this._upLoop().catch(function (e) { debug('poll up', e); });
    this._downLoop().catch(function (e) { debug('poll down', e); });
    return this;
  }

  async _retry(fn) {
    // Repeat one request until it succeeds; give up after POLL_GIVE_UP of failures.
    let failSince = null;
    while (!this.closed) {
      try {
        const r = await fn();
        if (r.status === 200) return r;
        if (r.status === 404 || r.status === 410) break;
        throw new Error('HTTP ' + r.status);
      } catch (e) {
        if (this.closed) break;
        const now = mono();
        failSince = failSince || now;
        if (now - failSince > POLL_GIVE_UP) break;
        await sleep(0.5);
      }
    }
    this.close();
    return null;
  }

  async _upLoop() {
    let seq = 0;
    const self = this;
    while (!this.closed) {
      while (!this.outbuf.length && !this.closed) await this.upSig.wait(1.0);
      if (this.closed) break;
      const batch = Buffer.from(this.outbuf.peek(POLL_BATCH));
      seq++;
      const p = '/fs/p/' + this.sid + '/up?seq=' + seq;
      const r = await this._retry(function () { return self._request('POST', p, batch, POLL_WAIT + 20); });
      if (r === null) break;
      this.outbuf.take(batch.length);
      if (this.canWrite()) this._drained();
    }
  }

  async _downLoop() {
    let last = 0;
    const self = this;
    while (!this.closed) {
      const p = '/fs/p/' + this.sid + '/down?ack=' + last;
      const r = await this._retry(function () { return self._request('GET', p, null, POLL_WAIT + 20); });
      if (r === null) break;
      let seq = parseInt(r.seq || '0', 10);
      if (isNaN(seq)) seq = 0;
      if (seq === last + 1) {
        last = seq;
        if (r.data.length && !this.closed) this._emit(r.data);
      }
    }
  }

  canWrite() { return !this.closed && this.outbuf.length <= POLL_BATCH * 2; }

  write(data) {
    if (this.closed) throw new Error('closed');
    this.outbuf.push(data);
    this.upSig.notify();
    return this.canWrite();
  }

  close() {
    if (this.closed) { this._end(); return; }
    this.closed = true;
    this.upSig.notify();
    const self = this, sid = this.sid;
    if (sid) {
      this._request('POST', '/fs/p/' + sid + '/close', null, 3).catch(function () { /* ignore */ })
        .then(function () { try { self.agent.destroy(); } catch (e) { /* ignore */ } });
    } else if (this.agent) {
      try { this.agent.destroy(); } catch (e) { /* ignore */ }
    }
    this._end();
  }
}

class PollServerConn extends Pipe {
  // Server side of the HTTP polling transport.
  constructor(label) {
    super(label);
    this.sid = hexId(16);
    this.down = new BufList();
    this.upExpected = 1;
    this.downSeq = 0;
    this.lastBatch = null;
    this.lastSeen = mono();
    this.sig = new Signal();
    this.pingInterval = POLL_PING_INTERVAL;
    this.deadAfter = POLL_DEAD_AFTER;
    this.handshakeTimeout = HANDSHAKE_TIMEOUT;
    const self = this;
    this.timer = setInterval(function () {
      if (mono() - self.lastSeen > POLL_DEAD_AFTER) self.close();
    }, 1000);
    if (this.timer.unref) this.timer.unref();
  }

  handleUp(seq, body) {
    this.lastSeen = mono();
    if (this.closed) return 410;
    if (seq === this.upExpected) {
      this.upExpected++;
      if (body.length) this._emit(body);
    }
    return 200;   // older seq = duplicate retry, already have it
  }

  async handleDown(ack) {
    this.lastSeen = mono();
    if (this.closed) return [410, 0, Buffer.alloc(0)];
    if (this.lastBatch !== null && ack >= this.lastBatch[0]) this.lastBatch = null;
    if (this.lastBatch !== null) return [200, this.lastBatch[0], this.lastBatch[1]];
    const end = mono() + POLL_WAIT;
    while (!this.down.length && this.lastBatch === null && !this.closed) {
      const left = end - mono();
      if (left <= 0) break;
      await this.sig.wait(Math.min(left, 1.0));
    }
    this.lastSeen = mono();
    if (this.closed) return [410, 0, Buffer.alloc(0)];
    // another (stale) request built a batch meanwhile: hand out that one, never a newer one
    if (this.lastBatch !== null) return [200, this.lastBatch[0], this.lastBatch[1]];
    if (!this.down.length) return [200, 0, Buffer.alloc(0)];
    const data = this.down.take(Math.min(POLL_BATCH, this.down.length));
    this.downSeq++;
    this.lastBatch = [this.downSeq, data];
    this.sig.notify();
    if (this.canWrite()) this._drained();
    return [200, this.downSeq, data];
  }

  canWrite() { return !this.closed && this.down.length <= POLL_BATCH * 2; }

  write(data) {
    if (this.closed) throw new Error('closed');
    this.down.push(data);
    this.sig.notify();
    return this.canWrite();
  }

  close() {
    this.closed = true;
    this.sig.notify();
    clearInterval(this.timer);
    this._end();
  }
}

// ======================================================================
// Session: one live connection to the other user (frames, heartbeats)
// ======================================================================
function frameHeader(type, n) {
  const h = Buffer.allocUnsafe(HDR_SIZE);
  h[0] = type;
  h.writeUInt32BE(n >>> 0, 1);
  return h;
}

function writeU64(buf, value, pos) {
  buf.writeUInt32BE(Math.floor(value / 4294967296) >>> 0, pos);
  buf.writeUInt32BE(value >>> 0, pos + 4);
}

function readU64(buf, pos) {
  return buf.readUInt32BE(pos) * 4294967296 + buf.readUInt32BE(pos + 4);
}

function pyJson(obj) {
  // like Python's json.dumps(..., separators=(",", ":")) with ensure_ascii
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

class Session {
  constructor(app, conn, dialer) {
    this.app = app;
    this.conn = conn;
    this.dialer = dialer;
    this.label = conn.label;
    this.peerId = null;
    this.peerName = 'other user';
    this.alive = true;
    this.attached = false;
    this.lastRx = mono();
    this.lastTx = mono();
    this.ctrlQ = [];
    this.dataQ = [];
    this.dataBytes = 0;
    this.buf = new BufList();
    this.bye = false;
    this.busy = false;
    this.peerBusy = '';
    this.remotePrivate = false;
    this.room = new Signal();
    this.pumping = false;
    this.writerOn = false;
    this.pingTimer = null;
    this.endSig = new Signal();
    this.ended = false;
    this.reading = false;
    const self = this;
    conn.ondrain = function () { self.pump(); };
  }

  // ---- sending: control first, file data second ----
  sendCtrl(msg) {
    if (!this.alive) return false;
    const payload = Buffer.from(pyJson(msg), 'utf8');
    this.ctrlQ.push(Buffer.concat([frameHeader(F_CTRL, payload.length), payload]));
    this.pump();
    return true;
  }

  async sendData(tid, offset, frame) {
    // frame: a buffer made by makeDataFrame (header space + file bytes)
    while (this.alive && this.dataBytes > DATA_QUEUE_MAX) await this.room.wait(1.0);
    if (!this.alive) return false;
    this.dataQ.push([tid, frame]);
    this.dataBytes += frame.length;
    this.pump();
    return true;
  }

  purge(tid) {
    this.dataQ = this.dataQ.filter(function (it) { return it[0] !== tid; });
    let n = 0;
    for (const it of this.dataQ) n += it[1].length;
    this.dataBytes = n;
    this.room.notify();
  }

  pump() {
    if (!this.alive || !this.writerOn || this.pumping) return;
    this.pumping = true;
    try {
      while (this.alive && this.conn.canWrite()) {
        let frame;
        if (this.ctrlQ.length) frame = this.ctrlQ.shift();
        else if (this.dataQ.length) {
          frame = this.dataQ.shift()[1];
          this.dataBytes -= frame.length;
          this.room.notify();
        } else break;
        this.conn.write(frame);
        this.lastTx = mono();
      }
    } catch (e) {
      debug('pump', e);
      this.pumping = false;
      this.kill();
      return;
    }
    this.pumping = false;
  }

  _ping() {
    if (!this.alive) return;
    if (this.ctrlQ.length || this.dataQ.length) { this.pump(); return; }
    if (mono() - this.lastTx < this.conn.pingInterval) return;
    try {
      if (this.conn.canWrite()) {
        this.conn.write(frameHeader(F_PING, 0));
        this.lastTx = mono();
      }
    } catch (e) {
      this.kill();
    }
  }

  startWriter() {
    if (this.writerOn) return;
    this.writerOn = true;
    const self = this;
    this.pingTimer = setInterval(function () { self._ping(); }, 500);
    this.pump();
  }

  // ---- receiving ----
  _frames(cb) {
    const buf = this.buf;
    while (buf.length >= HDR_SIZE) {
      const h = buf.peek(HDR_SIZE);
      const ftype = h[0], n = h.readUInt32BE(1);
      if (n > MAX_FRAME || (ftype !== F_CTRL && ftype !== F_DATA && ftype !== F_PING)) {
        throw new Error('protocol error');
      }
      if (buf.length < HDR_SIZE + n) return;
      buf.take(HDR_SIZE);
      const payload = buf.take(n);
      cb(ftype, payload);
      if (!this.alive) return;
    }
  }

  handshake(magicSeen) {
    const self = this;
    return new Promise(function (resolve, reject) {
      const hello = Buffer.from(pyJson({ t: 'hello', app: 'file-share', v: APP_VERSION, id: INSTANCE_ID,
        name: HOSTNAME, busy: self.app.busyWith() }), 'utf8');
      let needMagic = !magicSeen;
      let done = false;
      const timer = setTimeout(function () { finish(new NotUs('handshake timed out')); },
        (self.conn.handshakeTimeout || HANDSHAKE_TIMEOUT) * 1000);
      function finish(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err); else resolve();
      }
      function check() {
        const b = self.buf;
        if (needMagic) {
          if (b.length < MAGIC.length) {
            const have = b.peek(b.length);
            if (!MAGIC.subarray(0, have.length).equals(have)) throw new NotUs('not file-share');
            return;
          }
          if (!b.peek(MAGIC.length).equals(MAGIC)) throw new NotUs('not file-share');
          b.take(MAGIC.length);
          needMagic = false;
        }
        if (b.length >= HDR_SIZE) {
          const h = b.peek(HDR_SIZE);
          const ftype = h[0], n = h.readUInt32BE(1);
          if (ftype !== F_CTRL || n > 65536) throw new NotUs('bad hello');
          if (b.length >= HDR_SIZE + n) {
            b.take(HDR_SIZE);
            const body = b.take(n);
            let msg;
            try { msg = JSON.parse(body.toString('utf8')); } catch (e) { throw new NotUs('bad hello'); }
            if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.t !== 'hello' ||
                msg.app !== 'file-share' || !truthy(msg.id)) throw new NotUs('bad hello');
            self.peerId = String(msg.id).slice(0, 64);
            self.peerName = String(truthy(msg.name) ? msg.name : 'other user').slice(0, 40);
            self.peerBusy = String(truthy(msg.busy) ? msg.busy : '');
            self.lastRx = mono();
            finish(null);
          }
        }
      }
      self.conn.setHandlers(function (d) {
        if (done) { self.buf.push(d); return; }
        self.buf.push(d);
        try { check(); } catch (e) { finish(e); }
      }, function () {
        if (done) return;
        if (!self.buf.length && needMagic) finish(new SoftEOF('closed at once (tunnel up, but nothing behind it yet)'));
        else finish(new NotUs('closed during handshake'));
      });
      try {
        self.conn.write(Buffer.concat([MAGIC, frameHeader(F_CTRL, hello.length), hello]));
      } catch (e) {
        finish(new NotUs('closed during handshake'));
      }
    });
  }

  runReader() {
    // Read frames until the connection ends. Resolves when the session is over.
    const self = this;
    if (!this.reading) {
      this.reading = true;
      const onFrame = function (ftype, payload) { self.app.onFrame(self, ftype, payload); };
      try {
        this._frames(onFrame);                 // bytes left over from the handshake
      } catch (e) {
        this.kill();
      }
      if (this.alive) {
        this.conn.setHandlers(function (d) {
          if (!self.alive) return;
          self.lastRx = mono();
          self.buf.push(d);
          try { self._frames(onFrame); } catch (e) { debug('frames', e); self.kill(); }
        }, function () { self.kill(); });
      }
    }
    if (this.ended) return Promise.resolve();
    return new Promise(function (resolve) {
      const loop = function () {
        if (self.ended) { resolve(); return; }
        self.endSig.wait(60).then(loop);
      };
      loop();
    });
  }

  dialerId() {
    return this.dialer ? INSTANCE_ID : (this.peerId || '');
  }

  kill() {
    if (!this.alive) {
      if (!this.ended) { this.ended = true; this.endSig.notify(); }
      return;
    }
    this.alive = false;
    this.dataQ = [];
    this.ctrlQ = [];
    this.dataBytes = 0;
    this.room.notify();
    if (this.pingTimer) clearInterval(this.pingTimer);
    try { this.conn.close(); } catch (e) { /* ignore */ }
    this.ended = true;
    this.endSig.notify();
    try { this.app.onSessionEnd(this); } catch (e) { debug('session end', e); }
  }

  async flushAndClose(timeout) {
    // Best-effort: deliver queued control messages (e.g. 'bye') then close.
    const end = mono() + (timeout || 1.0);
    while (mono() < end) {
      if (!this.ctrlQ.length || !this.alive) break;
      await sleep(0.02);
    }
    await sleep(0.1);
    this.kill();
  }
}

function makeDataFrame(tid, offset, n) {
  // header + data header; the caller reads the file bytes into frame[21..]
  const frame = Buffer.allocUnsafe(HDR_SIZE + DATA_HDR_SIZE + n);
  frame[0] = F_DATA;
  frame.writeUInt32BE(DATA_HDR_SIZE + n, 1);
  frame.writeUInt32BE(tid >>> 0, 5);
  writeU64(frame, offset, 9);
  return frame;
}

function sealDataFrame(frame) {
  const crc = crc32(frame.subarray(HDR_SIZE + DATA_HDR_SIZE));
  frame.writeUInt32BE(crc, 17);
  return frame;
}

// ======================================================================
// Transfers
// ======================================================================
class FileChanged extends Error {
  constructor(m) { super(m); this.name = 'FileChanged'; }
}

function fsOpen(p, flags) {
  return new Promise(function (resolve, reject) {
    fs.open(p, flags, function (e, fd) { if (e) reject(e); else resolve(fd); });
  });
}

function fsReadFull(fd, buf, off, n, pos) {
  return new Promise(function (resolve, reject) {
    let got = 0;
    const step = function () {
      fs.read(fd, buf, off + got, n - got, pos + got, function (e, k) {
        if (e) { reject(e); return; }
        got += k;
        if (k === 0 || got >= n) resolve(got); else step();
      });
    };
    step();
  });
}

function fsClose(fd) {
  try { fs.closeSync(fd); } catch (e) { /* ignore */ }
}

function writeAll(fd, data, pos) {
  let off = 0;
  while (off < data.length) {
    const k = fs.writeSync(fd, data, off, data.length - off, pos + off);
    if (k <= 0) throw new Error('write failed');
    off += k;
  }
}

class Batch {
  // Files/folders offered with one upload command: the other user answers once for all.
  constructor(members) {
    this.id = hexId(6);
    this.members = members;
    this.said = new Set();
  }

  once(key) {
    if (this.said.has(key)) return false;
    this.said.add(key);
    return true;
  }

  describe() {
    const items = this.members;
    let names = items.slice(0, 3).map(function (t) { return short(t.name, 24); }).join(', ');
    if (items.length > 3) names += ' and ' + (items.length - 3) + ' more';
    let total = 0;
    for (const t of items) total += t.size;
    return items.length + ' items (' + human(total) + ' total): ' + names;
  }
}

class OutTransfer {
  // A file or folder this user offered.
  constructor(app, p) {
    this.app = app;
    this.path = path.resolve(p);
    this.tid = app.newTid();
    this.name = path.basename(this.path.replace(/[\\/]+$/, '')) || 'file';
    this.kind = isDir(this.path) ? 'folder' : 'file';
    this.entries = [];          // [absolute path, relative path, size]
    this.dirs = [];
    this.size = 0;
    this.fid = '';
    this.state = 'preparing';   // preparing, waiting, offered, queued, sending, done, refused, cancelled, failed
    this.sig = new Signal();
    this.go = null;             // [session, offset] from the receiver
    this.offerSession = null;
    this.acceptedOnce = false;
    this.acked = 0;
    this.sent = 0;
    this.meter = new Meter();
    this.started = null;
    this.skipped = 0;
    this.batch = null;
    this.num = 0;
    this.ready = false;
    this.lastGoSess = null;
  }

  terminal() {
    return this.state === 'done' || this.state === 'refused' || this.state === 'cancelled' || this.state === 'failed';
  }

  solo() { return this.batch === null || this.batch.members.length <= 1; }

  notify() { this.sig.notify(); }

  buildManifest() {
    let ident;
    if (this.kind === 'file') {
      const st = fs.statSync(this.path);
      fsClose(fs.openSync(this.path, 'r'));                    // readable?
      this.entries = [[this.path, this.name, st.size]];
      this.size = st.size;
      ident = [this.path, this.name, 'file', st.size, Math.floor(st.mtimeMs / 1000)];
    } else {
      fs.readdirSync(this.path);                               // readable?
      const entries = [], dirs = [];
      const self = this;
      const walk = function (dir, rel) {
        let names;
        try { names = fs.readdirSync(dir); } catch (e) { return; }
        names.sort();
        const dn = [], fn = [];
        for (const n of names) {
          const full = path.join(dir, n);
          let d = false;
          try { d = fs.statSync(full).isDirectory(); } catch (e) { d = false; }
          (d ? dn : fn).push(n);
        }
        const into = [];
        for (const d of dn) {
          const full = path.join(dir, d);
          let link = false;
          try { link = fs.lstatSync(full).isSymbolicLink(); } catch (e) { link = true; }
          if (link) continue;
          dirs.push(rel ? rel + '/' + d : d);
          into.push(d);
        }
        for (const f of fn) {
          const full = path.join(dir, f);
          let st;
          try {
            st = fs.statSync(full);
            if (!st.isFile()) continue;
            fs.accessSync(full, fs.constants.R_OK);
          } catch (e) {
            if (st === undefined || st.isFile()) self.skipped++;
            continue;
          }
          entries.push([full, rel ? rel + '/' + f : f, st.size, Math.floor(st.mtimeMs / 1000)]);
        }
        for (const d of into) walk(path.join(dir, d), rel ? rel + '/' + d : d);
      };
      walk(this.path, '');
      this.entries = entries.map(function (e) { return [e[0], e[1], e[2]]; });
      this.dirs = dirs;
      let total = 0;
      for (const e of this.entries) total += e[2];
      this.size = total;
      ident = [this.path, this.name, 'folder', this.size, entries.map(function (e) { return [e[1], e[2], e[3]]; }), dirs];
    }
    this.fid = crypto.createHash('sha256').update(pyJson(ident), 'utf8').digest('hex').slice(0, 32);
  }

  offerMsg(resume) {
    const msg = { t: 'offer', tid: this.tid, fid: this.fid, name: this.name, kind: this.kind, size: this.size,
      count: this.entries.length, resume: !!resume };
    if (this.batch !== null) {
      msg.batch = this.batch.id;
      msg.bn = Math.max(1, this.batch.members.filter(function (t) { return !t.terminal(); }).length);
    }
    if (this.kind === 'folder') {
      msg.entries = this.entries.map(function (e) { return [e[1], e[2]]; });
      msg.dirs = this.dirs;
    }
    return msg;
  }

  async run() {
    try {
      await this._run();
    } catch (e) {
      debug('upload', e);
      if (!this.terminal()) {
        this.state = 'failed';
        this.app.sendCancel(this.tid, 'up', 'upload failed on the other side');
        say('[!] Upload of ' + this.name + ' failed: ' + (e instanceof FileChanged ? e.message : errText(e)));
      }
    } finally {
      this.app.transferEnded();
    }
  }

  prepare() {
    // Read the file/folder list. Returns false (and says why) when it cannot be sent.
    try {
      this.buildManifest();
    } catch (e) {
      this.state = 'failed';
      say('[!] Cannot read ' + this.path + ': ' + errText(e));
      return false;
    }
    if (this.skipped) say('[!] ' + this.skipped + ' unreadable item(s) in ' + this.name + ' will be skipped.');
    if (pyJson(this.offerMsg(false)).length > MAX_FRAME - 4096) {
      this.state = 'failed';
      say('[!] ' + this.name + ' has too many files to send as one folder. Zip it first, then upload the zip.');
      return false;
    }
    this.ready = true;
    this.state = 'waiting';
    return true;
  }

  async _waitGo(sess) {
    while (!this.terminal() && this.go === null && sess.alive && this.app.session === sess) await this.sig.wait(0.5);
  }

  async _run() {
    if (!this.ready && !this.prepare()) return;
    const what = this.kind === 'folder' ? ('folder, ' + this.entries.length + ' files') : 'file';
    if (this.app.session === null && this.solo()) {
      say('[*] ' + this.name + ' (' + what + ', ' + human(this.size) + ') will be offered as soon as the other user is connected.');
    }
    while (!this.terminal()) {
      const sess = this.app.session;
      if (sess === null || !sess.alive) {
        if (this.state === 'offered' || this.state === 'sending' || this.state === 'queued') this.state = 'waiting';
        await this.app.waitSession(1.0);
        continue;
      }
      if (this.offerSession !== sess) {
        this.go = null;
        this.offerSession = sess;
        if (!sess.sendCtrl(this.offerMsg(this.acceptedOnce))) continue;
        if (this.state === 'waiting' && !this.acceptedOnce && this.solo()) {
          say('[*] Offered ' + this.name + ' (' + what + ', ' + human(this.size) + '). Waiting for the other user to answer...');
        }
        this.state = !this.acceptedOnce ? 'offered' : 'waiting';
      }
      await this._waitGo(sess);
      if (this.terminal() || this.go === null) continue;
      const goSess = this.go[0];
      let offset = this.go[1];
      this.go = null;
      if (goSess !== sess) continue;
      this.state = 'queued';
      if (!(await this.app.acquireSlot(this, sess))) continue;
      try {
        if (this.go !== null && this.go[0] === sess) {
          offset = this.go[1];        // a newer resume point arrived while queued
          this.go = null;
        }
        if (this.terminal()) continue;
        this.state = 'sending';
        await this._stream(sess, offset);
      } finally {
        this.app.releaseSlot(this);
      }
      // all bytes queued: wait for 'complete', a resend request, or a lost link
      await this._waitGo(sess);
    }
  }

  _locate(offset) {
    let pos = offset;
    for (let i = 0; i < this.entries.length; i++) {
      const size = this.entries[i][2];
      if (pos < size) return [i, pos];
      pos -= size;
    }
    return [this.entries.length, 0];
  }

  async _stream(sess, offset) {
    const loc = this._locate(offset);
    let idx = loc[0], pos = loc[1];
    let fd = null;
    try {
      while (offset < this.size) {
        if (this.terminal() || this.go !== null || !sess.alive) return;
        const ent = this.entries[idx];
        const absp = ent[0], fsize = ent[2];
        if (pos >= fsize) {
          if (fd !== null) { fsClose(fd); fd = null; }
          idx++;
          pos = 0;
          continue;
        }
        if (fd === null) fd = await fsOpen(absp, 'r');
        const n = Math.min(CHUNK, fsize - pos);
        const frame = makeDataFrame(this.tid, offset, n);
        const got = await fsReadFull(fd, frame, HDR_SIZE + DATA_HDR_SIZE, n, pos);
        if (got !== n) throw new FileChanged(path.basename(absp) + ' changed while it was being sent');
        if (this.terminal() || this.go !== null || !sess.alive) return;
        sealDataFrame(frame);
        if (!(await sess.sendData(this.tid, offset, frame))) return;
        offset += n;
        pos += n;
        this.sent = offset;
      }
    } finally {
      if (fd !== null) fsClose(fd);
    }
  }

  // ---- events from the other user ----
  onAnswer(sess, ok, offset, reason) {
    if (this.terminal()) return;
    if (!ok) {
      this.state = 'refused';
      const extra = (reason && reason !== 'refused') ? (' (' + reason + ')') : '';
      if (this.solo()) say('[x] The other user refused to download ' + this.name + '.' + extra);
      else if (this.batch.once('refused' + extra)) say('[x] The other user refused to download ' + this.batch.describe() + '.' + extra);
      this.notify();
      return;
    }
    try { offset = Math.max(0, Math.min(pyInt(offset), this.size)); } catch (e) { offset = 0; }
    if (!this.acceptedOnce) {
      this.acceptedOnce = true;
      this.started = mono();
      this.acked = offset;
      if (!this.solo()) {
        if (this.batch.once('accepted')) say('[+] Receiver accepted, files are uploading: ' + this.batch.describe());
      } else if (offset) {
        say('[+] Receiver accepted. Resuming ' + this.name + ' from ' + pct1(100.0 * offset / Math.max(1, this.size)) +
          '% (' + human(offset) + ' already there).');
      } else {
        say('[+] Receiver accepted, file is uploading: ' + this.name + ' (' + human(this.size) + ')');
      }
    } else if (!this.solo()) {
      if (sess !== this.lastGoSess && this.batch.once('resumed' + sess.serial)) say('[+] Uploads resumed.');
    } else if (sess !== this.lastGoSess) {
      say('[+] Upload of ' + this.name + ' resumed at ' + pct1(100.0 * offset / Math.max(1, this.size)) + '%.');
    }
    this.lastGoSess = sess;
    this.meter.reset();
    sess.purge(this.tid);
    this.go = [sess, offset];
    this.notify();
  }

  onProgress(got) {
    try { this.acked = Math.max(0, Math.min(pyInt(got), this.size)); } catch (e) { return; }
    this.meter.add(this.acked);
  }

  onComplete() {
    if (this.terminal()) return;
    this.state = 'done';
    this.acked = this.size;
    const took = mono() - (this.started || mono());
    const speed = took > 0.5 ? (' at ' + human(this.size / took) + '/s') : '';
    if (this.solo()) {
      say('[+] Upload complete: ' + this.name + ' (' + human(this.size) + ') in ' + fmtEta(took) + speed + '. The other user saved it.');
    } else {
      say('[+] Upload complete: ' + this.name + ' (' + human(this.size) + ')' + speed);
    }
    this.notify();
    if (!this.solo() && this.batch.members.every(function (t) { return t.terminal(); }) && this.batch.once('finished')) {
      const done = this.batch.members.filter(function (t) { return t.state === 'done'; }).length;
      say('[+] Finished: ' + done + ' of ' + this.batch.members.length + ' items from that upload were sent.');
    }
  }

  onRemoteCancel(reason) {
    if (this.terminal()) return;
    const wasOffer = !this.acceptedOnce;
    this.state = 'cancelled';
    if (reason) say('[x] Upload of ' + this.name + ' stopped: ' + reason + '.');
    else if (wasOffer) say('[x] The other user refused to download ' + this.name + '.');
    else say('[x] File uploading stopped because the other user interrupted it (' + this.name + ').');
    this.notify();
  }

  cancelLocal() {
    if (this.terminal()) return false;
    const wasActive = this.acceptedOnce;
    this.state = 'cancelled';
    const sess = this.app.session;
    if (sess !== null) sess.purge(this.tid);
    this.app.sendCancel(this.tid, 'up', '');
    if (wasActive) say('[x] You interrupted the uploading of ' + this.name + '.');
    else say('[x] You withdrew the offer of ' + this.name + '.');
    this.notify();
    return true;
  }
}

class InTransfer {
  // A file or folder the other user offered to this user.
  constructor(app, peerId, msg) {
    this.app = app;
    this.peerId = peerId;
    this.tid = pyInt(msg.tid);
    this.fid = String(msg.fid === undefined ? '' : msg.fid).toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 64) || hexId(8);
    this.kind = msg.kind === 'folder' ? 'folder' : 'file';
    this.name = safeComponent(truthy(msg.name) ? msg.name : 'file');
    if (msg.size === undefined) { const e = new Error('size'); e.name = 'KeyError'; throw e; }
    this.size = pyInt(msg.size);
    if (this.size < 0) throw new Error('bad size');
    this.entries = [];
    this.dirs = [];
    if (this.kind === 'folder') {
      const seen = new Set();
      let total = 0;
      const list = truthy(msg.entries) ? msg.entries : [];
      if (!Array.isArray(list)) throw new TypeError('entries');
      for (const item of list) {
        if (!Array.isArray(item) && typeof item !== 'string') throw new TypeError('entry');
        if (item.length < 2) throw new RangeError('entry');
        let rel = safeRelpath(item[0]);
        const size = pyInt(item[1]);
        if (size < 0) throw new Error('bad size');
        let key = rel.toLowerCase();
        let n = 1;
        while (seen.has(key)) {
          const se = splitext(safeRelpath(item[0]));
          rel = se[0] + ' (' + n + ')' + se[1];
          key = rel.toLowerCase();
          n++;
        }
        seen.add(key);
        this.entries.push([rel, size]);
        total += size;
      }
      if (total !== this.size) throw new Error('size mismatch');
      const dl = truthy(msg.dirs) ? msg.dirs : [];
      this.dirs = (Array.isArray(dl) ? dl : Array.from(String(dl))).slice(0, 200000).map(safeRelpath);
    } else {
      this.entries = [[this.name, this.size]];
    }
    this.count = this.entries.length;
    this.state = 'asking';        // asking, active, done, refused, cancelled, failed
    this.written = 0;
    this.idx = 0;
    this.pos = 0;
    this.fd = null;
    this.fpos = 0;
    this.opened = false;
    this.lastProgress = 0.0;
    this.resyncSent = false;
    this.meter = new Meter();
    this.started = null;
    this.have = 0;
    this.num = 0;
    this.group = null;
    this.partRoot = path.join(app.downloadDir, '.fileshare-partial');
    this.part = path.join(this.partRoot, this.fid + (this.kind === 'file' ? '.part' : ''));
  }

  terminal() {
    return this.state === 'done' || this.state === 'refused' || this.state === 'cancelled' || this.state === 'failed';
  }

  _entryPath(rel) {
    return path.join.apply(path, [this.part].concat(rel.split('/')));
  }

  existingBytes() {
    try {
      if (this.kind === 'file') return isFile(this.part) ? Math.min(fs.statSync(this.part).size, this.size) : 0;
      if (isDir(this.part)) return this._scanFolder()[0];
    } catch (e) { /* none */ }
    return 0;
  }

  _scanFolder() {
    let done = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const rel = this.entries[i][0], size = this.entries[i][1];
      if (size === 0) continue;
      const p = this._entryPath(rel);
      let have = isFile(p) ? fs.statSync(p).size : 0;
      if (have === size) { done += size; continue; }
      if (have > size) have = 0;
      return [done + have, i, have];
    }
    return [done, this.entries.length, 0];
  }

  prepare() {
    // Open storage (resuming a partial download if there is one); returns the offset.
    if (this.opened) return this.written;
    mkdirp(this.partRoot);
    if (this.kind === 'file') {
      let have = isFile(this.part) ? fs.statSync(this.part).size : 0;
      if (have > this.size) have = 0;
      if (!have) fsClose(fs.openSync(this.part, 'w'));   // proves the folder is writable; opened on first data
      this.fd = null;
      this.written = have; this.idx = 0; this.pos = have;
    } else {
      mkdirp(this.part);
      for (const d of this.dirs) mkdirp(this._entryPath(d));
      const s = this._scanFolder();
      this.written = s[0]; this.idx = s[1]; this.pos = s[2];
      this.fd = null;
    }
    this.opened = true;
    return this.written;
  }

  _openCurrent() {
    const p = this._entryPath(this.entries[this.idx][0]);
    const parent = path.dirname(p);
    if (parent) mkdirp(parent);
    if (this.pos) {
      this.fd = fs.openSync(p, 'r+');
      fs.ftruncateSync(this.fd, this.pos);
      this.fpos = this.pos;
    } else {
      this.fd = fs.openSync(p, 'w');
      this.fpos = 0;
    }
  }

  write(data) {
    if (this.kind === 'file') {
      if (this.fd === null) {              // opened lazily: many queued files never hold handles
        this.fd = fs.openSync(this.part, 'r+');
        fs.ftruncateSync(this.fd, this.written);
        this.fpos = this.written;
      }
      writeAll(this.fd, data, this.fpos);
      this.fpos += data.length;
      this.written += data.length;
      this.pos = this.written;
      return;
    }
    let view = data;
    while (view.length) {
      while (this.idx < this.entries.length && this.pos >= this.entries[this.idx][1]) {
        if (this.fd !== null) { fsClose(this.fd); this.fd = null; }
        this.idx++;
        this.pos = 0;
      }
      if (this.idx >= this.entries.length) { const e = new Error('more data than announced'); e.name = 'ValueError'; throw e; }
      if (this.fd === null) this._openCurrent();
      const n = Math.min(view.length, this.entries[this.idx][1] - this.pos);
      writeAll(this.fd, view.subarray(0, n), this.fpos);
      this.fpos += n;
      this.pos += n;
      this.written += n;
      view = view.subarray(n);
    }
  }

  closeFiles() {
    if (this.fd !== null) { fsClose(this.fd); this.fd = null; }
    this.opened = false;
  }

  discard() {
    this.closeFiles();
    try {
      if (lexists(this.part)) rmTree(this.part);
    } catch (e) { /* ignore */ }
    this._tidy();
  }

  _tidy() {
    try { fs.rmdirSync(this.partRoot); } catch (e) { /* only succeeds when empty */ }
  }

  finalize() {
    this.closeFiles();
    if (this.kind === 'folder') {
      for (const ent of this.entries) {
        if (ent[1] === 0) {
          const p = this._entryPath(ent[0]);
          mkdirp(path.dirname(p));
          fsClose(fs.openSync(p, 'w'));
        }
      }
    } else if (!exists(this.part)) {
      fsClose(fs.openSync(this.part, 'w'));
    }
    const dest = uniquePath(this.app.downloadDir, this.name);
    fs.renameSync(this.part, dest);
    this._tidy();
    return dest;
  }

  onData(sess, offset, crc, data) {
    if (this.state !== 'active' || !this.opened) return;
    if (offset !== this.written) {
      if (offset > this.written && !this.resyncSent) {
        this.resyncSent = true;
        sess.sendCtrl({ t: 'answer', tid: this.tid, ok: true, offset: this.written });
      }
      return;
    }
    if (crc32(data) !== crc) {
      if (!this.resyncSent) {
        this.resyncSent = true;
        sess.sendCtrl({ t: 'answer', tid: this.tid, ok: true, offset: this.written });
      }
      return;
    }
    this.resyncSent = false;
    try {
      this.write(data);
    } catch (e) {
      this.fail(sess, 'disk error: ' + errText(e));
      return;
    }
    this.meter.add(this.written);
    const now = mono();
    if (this.written >= this.size) this.complete(sess);
    else if (now - this.lastProgress >= PROGRESS_EVERY) {
      this.lastProgress = now;
      sess.sendCtrl({ t: 'progress', tid: this.tid, got: this.written });
    }
  }

  complete(sess) {
    if (this.state !== 'active') return;
    let dest;
    try {
      dest = this.finalize();
    } catch (e) {
      this.fail(sess, 'could not save: ' + errText(e));
      return;
    }
    this.state = 'done';
    const took = mono() - (this.started || mono());
    const speed = took > 0.5 ? (' at ' + human(this.size / took) + '/s') : '';
    if (sess !== null) {
      sess.sendCtrl({ t: 'progress', tid: this.tid, got: this.size });
      sess.sendCtrl({ t: 'complete', tid: this.tid, saved: path.basename(dest) });
    }
    const g = this.group;
    if (g !== null && g.items.length > 1) {
      say('[+] Download complete: ' + this.name + ' (' + human(this.size) + ')' + speed);
      this.app.groupProgress(g);
    } else {
      say('[+] Download complete: ' + this.name + ' (' + human(this.size) + ')' + speed + '\n    Saved to: ' + dest);
    }
    this.app.transferEnded();
  }

  fail(sess, reason) {
    if (this.terminal()) return;
    this.state = 'failed';
    this.closeFiles();
    this.app.sendCancel(this.tid, 'down', reason, this.peerId);
    say('[!] Download of ' + this.name + ' failed: ' + reason + '. The partial file was kept; it resumes if sent again.');
    if (this.group !== null && this.group.items.length > 1) this.app.groupProgress(this.group);
    this.app.transferEnded();
  }
}

// ======================================================================
// The application: connections, transfers, commands
// ======================================================================
class OfferGroup {
  // Everything offered by one upload command on the other side: one y/n question.
  constructor(peerId, bid) {
    this.peerId = peerId;
    this.bid = bid;
    this.items = [];
    this.expected = 1;
    this.state = 'collecting';      // collecting, asking, decided
    this.decision = null;
    this.answers = [];
    this.last = mono();
    this.summarized = false;
  }

  live() { return this.items.filter(function (t) { return t.state === 'asking'; }); }

  size() {
    let n = 0;
    for (const t of this.live()) n += t.size;
    return n;
  }

  title() {
    const live = this.live();
    const items = live.length ? live : this.items;
    return items.length === 1 ? items[0].name : (items.length + ' items');
  }
}

let SESSION_SERIAL = 0;

class App {
  constructor(peer, port, downloadDir) {
    this.port = port;
    this.downloadDir = downloadDir;
    this.session = null;
    this.sessionSig = new Signal();
    this.sessions = new Set();
    this.outgoing = new Map();     // tid -> OutTransfer
    this.incoming = new Map();     // peer id + tid -> InTransfer
    this.prompts = [];             // OfferGroup waiting for y/n, oldest first
    this.groups = new Map();       // peer id + batch id -> OfferGroup
    this.serial = 0;               // numbers shown by 'status', used by 'cancel <n>'
    this.slotSig = new Signal();
    this.slotWait = [];            // accepted uploads waiting for a stream slot
    this.streaming = new Set();
    this.menu = null;              // the Ctrl+Z "which transfers to stop" menu, when open
    this.pendingCancels = [];      // [peer id, tid, side, reason]
    this.stopping = false;
    this.lastPeerId = null;
    this.lastQuietPeer = null;
    this.quietUntil = 0.0;
    this.dialer = new Dialer(this);
    this.listener = new Listener(this);
    this.editor = null;
    this.usedTids = new Set();
    this.everConnected = false;
    if (peer) this.dialer.setTarget(peer, false);
  }

  static ikey(peerId, tid) { return String(peerId) + '\u0000' + String(tid); }

  // ---- ids ----
  newTid() {
    for (;;) {
      const tid = 1 + Math.floor(Math.random() * 0xFFFFFFFF);
      if (tid <= 0xFFFFFFFF && !this.usedTids.has(tid)) {
        this.usedTids.add(tid);
        return tid;
      }
    }
  }

  nextNum() { this.serial += 1; return this.serial; }

  // ---- upload stream slots: a few files stream at once, the rest queue in order ----
  async acquireSlot(t, sess) {
    if (this.slotWait.indexOf(t) < 0) this.slotWait.push(t);
    let got = false;
    try {
      for (;;) {
        if (t.terminal() || !sess.alive || this.session !== sess || this.stopping) return false;
        while (this.slotWait.length && this.slotWait[0] !== t && this.slotWait[0].terminal()) this.slotWait.shift();
        if (this.streaming.size < MAX_STREAMS && this.slotWait.length && this.slotWait[0] === t) {
          this.slotWait.shift();
          this.streaming.add(t);
          got = true;
          return true;
        }
        await this.slotSig.wait(0.5);
      }
    } finally {
      if (!got) {
        const i = this.slotWait.indexOf(t);
        if (i >= 0) this.slotWait.splice(i, 1);
      }
      this.slotSig.notify();
    }
  }

  releaseSlot(t) {
    this.streaming.delete(t);
    this.slotSig.notify();
  }

  // ---- sessions ----
  async waitSession(timeout) {
    if (this.session === null) await this.sessionSig.wait(timeout);
  }

  attach(sess) {
    // Make sess the active connection. Returns false when it must be dropped.
    if (sess.peerId === INSTANCE_ID) throw new NotUs('self');
    if (this.stopping) return false;
    const cur = this.session;
    let replaced = null;
    if (cur !== null && cur.alive) {
      const healthy = mono() - cur.lastRx < HEALTHY_WINDOW;
      if (cur.peerId === sess.peerId) {
        if (healthy && sess.dialerId() > cur.dialerId()) {
          sess.sendCtrl({ t: 'dup' });       // both dialed at once: keep the existing one
          return false;
        }
      } else if (healthy) {
        sess.sendCtrl({ t: 'busy' });
        return false;
      }
      replaced = cur;
    }
    const samePeer = cur !== null && cur.peerId === sess.peerId;
    this.session = sess;
    sess.attached = true;
    this.everConnected = true;
    this.sessionSig.notify();
    const peerChanged = this.lastPeerId !== null && this.lastPeerId !== sess.peerId;
    this.lastQuietPeer = this.lastPeerId;
    this.lastPeerId = sess.peerId;
    const cancels = this.pendingCancels.filter(function (c) { return c[0] === sess.peerId; });
    this.pendingCancels = [];
    if (replaced !== null) {
      if (samePeer && replaced.alive) {
        replaced.busy = true;                // superseded twin: close it quietly on both sides
        replaced.sendCtrl({ t: 'dup' });
        replaced.flushAndClose(0.3).catch(function () { /* ignore */ });
      } else {
        replaced.kill();
      }
    }
    for (const c of cancels) sess.sendCtrl({ t: 'cancel', tid: c[1], side: c[2], reason: c[3] });
    if (peerChanged) this._peerRestarted();
    const where = sess.remotePrivate ? 'LAN' : '';
    const quiet = mono() < this.quietUntil && sess.peerId === this.lastQuietPeer;
    if ((!samePeer || replaced === null) && !quiet) {
      say('[+] Connected to ' + sess.peerName + ' via ' + sess.label + (where ? ' (' + where + ')' : '') + '.');
    }
    this.showPrompt();
    return true;
  }

  busyWith() {
    const s = this.session;
    if (s !== null && s.alive && mono() - s.lastRx < HEALTHY_WINDOW) return s.peerId || '';
    return '';
  }

  _peerRestarted() {
    const stale = Array.from(this.incoming.values()).filter(function (t) { return t.state === 'active'; });
    for (const t of stale) {
      t.closeFiles();
      t.state = 'failed';
      say('[*] The other user restarted ' + APP_NAME + '; ' + t.name + ' is paused. If they send it again it resumes.');
    }
    const hadPrompt = this.prompts.length > 0;
    this.prompts = [];
    for (const g of this.groups.values()) {
      if (g.state !== 'decided') {
        g.state = 'decided';
        g.decision = 'n';
        for (const t of g.items) if (t.state === 'asking') t.state = 'cancelled';
      }
    }
    if (hadPrompt) {
      say('[*] The open question was dropped; the other user will offer again if needed.');
      CONSOLE.setPrompt('> ');
    }
  }

  onSessionEnd(sess) {
    this.sessions.delete(sess);
    const was = this.session === sess;
    if (was) {
      this.session = null;
      this.sessionSig.notify();
    }
    if (was && !this.stopping && !sess.busy) {
      if (sess.bye) say('[-] The other user closed ' + APP_NAME + '.');
      else say('[-] Connection lost.');
      if (this.dialer.hasTarget()) say('[*] Reconnecting automatically... (transfers resume by themselves)');
      else say('[*] Waiting for the other user to reconnect... (transfers resume by themselves)');
      this.dialer.wake();
    }
  }

  sessionAlive() {
    const s = this.session;
    return s !== null && s.alive;
  }

  newSession(conn, dialer) {
    const s = new Session(this, conn, dialer);
    s.serial = ++SESSION_SERIAL;
    return s;
  }

  async runSession(sess, magicSeen) {
    // Handshake + attach + read loop; resolves when the session ends.
    this.sessions.add(sess);
    try {
      await sess.handshake(magicSeen);
      if (sess.peerId === INSTANCE_ID) throw new NotUs('self');
      sess.startWriter();
      if (!this.attach(sess)) {
        await sess.flushAndClose(0.5);
        return 'dup';
      }
    } catch (e) {
      sess.alive = false;
      try { sess.conn.close(); } catch (x) { /* ignore */ }
      sess.kill();
      this.sessions.delete(sess);
      throw e;
    }
    await sess.runReader();
    return 'ok';
  }

  // ---- frames ----
  onFrame(sess, ftype, payload) {
    if (ftype === F_PING) return;
    if (ftype === F_DATA) {
      if (payload.length < DATA_HDR_SIZE) return;
      const tid = payload.readUInt32BE(0), offset = readU64(payload, 4), crc = payload.readUInt32BE(12);
      const t = this.incoming.get(App.ikey(sess.peerId, tid));
      if (t !== undefined) t.onData(sess, offset, crc, payload.subarray(DATA_HDR_SIZE));
      return;
    }
    let msg, kind;
    try {
      msg = JSON.parse(payload.toString('utf8'));
      if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return;
      kind = msg.t;
    } catch (e) {
      return;
    }
    try {
      this.onCtrl(sess, kind, msg);
    } catch (e) {
      debug('ctrl', e);
      say('[!] Ignored a bad message from the other user (' + (e.name || 'Error') + ').');
    }
  }

  onCtrl(sess, kind, msg) {
    if (kind === 'offer') { this.onOffer(sess, msg); return; }
    if (kind === 'busy') { sess.busy = true; this.dialer.noteBusy(); sess.kill(); return; }
    if (kind === 'dup') {
      sess.busy = true;                  // a twin connection won; this one quietly closes
      this.quietUntil = mono() + 5.0;
      sess.kill();
      return;
    }
    if (kind === 'bye') { sess.bye = true; sess.kill(); return; }
    const tid = msg.tid;
    const okey = (typeof tid === 'number') ? tid : NaN;
    if (kind === 'answer') {
      const t = this.outgoing.get(okey);
      if (t === undefined || t.terminal()) {
        if (truthy(msg.ok)) sess.sendCtrl({ t: 'cancel', tid: tid, side: 'up', reason: '' });
        return;
      }
      t.onAnswer(sess, truthy(msg.ok), msg.offset === undefined ? 0 : msg.offset,
        String(truthy(msg.reason) ? msg.reason : '').slice(0, 120));
    } else if (kind === 'progress') {
      const t = this.outgoing.get(okey);
      if (t !== undefined && !t.terminal()) t.onProgress(msg.got === undefined ? 0 : msg.got);
    } else if (kind === 'complete') {
      const t = this.outgoing.get(okey);
      if (t !== undefined) {
        t.onComplete(msg.saved);
        this.transferEnded();
      }
    } else if (kind === 'cancel') {
      const reason = String(truthy(msg.reason) ? msg.reason : '').slice(0, 120);
      if (msg.side === 'down') {
        const t = this.outgoing.get(okey);
        if (t !== undefined) {
          t.onRemoteCancel(reason);
          sess.purge(okey);
          this.transferEnded();
        }
      } else {
        const t = (typeof tid === 'number') ? this.incoming.get(App.ikey(sess.peerId, tid)) : undefined;
        if (t !== undefined) this.remoteCancelledIncoming(t, reason);
      }
    }
  }

  onOffer(sess, msg) {
    if (msg.tid === undefined) { const e = new Error('tid'); e.name = 'KeyError'; throw e; }
    const tid = pyInt(msg.tid);
    const key = App.ikey(sess.peerId, tid);
    let t = this.incoming.get(key);
    if (t !== undefined) {
      if (t.state === 'active') {
        let offset;
        try {
          offset = t.prepare();
        } catch (e) {
          t.fail(sess, 'disk error: ' + errText(e));
          return;
        }
        t.resyncSent = false;
        sess.sendCtrl({ t: 'answer', tid: tid, ok: true, offset: offset });
        if (offset < t.size) say('[*] Download of ' + t.name + ' resumed at ' + pct1(100.0 * offset / Math.max(1, t.size)) + '%.');
      } else if (t.state === 'refused') {
        sess.sendCtrl({ t: 'answer', tid: tid, ok: false, reason: 'refused' });
      } else if (t.state === 'cancelled' || t.state === 'failed') {
        sess.sendCtrl({ t: 'cancel', tid: tid, side: 'down', reason: '' });
      } else if (t.state === 'done') {
        sess.sendCtrl({ t: 'complete', tid: tid, saved: t.name });
      }
      return;                          // 'asking': the question is still open
    }
    try {
      t = new InTransfer(this, sess.peerId, msg);
    } catch (e) {
      debug('offer', e);
      sess.sendCtrl({ t: 'answer', tid: tid, ok: false, reason: 'the offer was not valid' });
      return;
    }
    let clash = false;
    for (const o of this.incoming.values()) {
      if (o.fid === t.fid && (o.state === 'asking' || o.state === 'active')) { clash = true; break; }
    }
    if (clash) {
      sess.sendCtrl({ t: 'answer', tid: tid, ok: false, reason: 'the same file is already being downloaded' });
      return;
    }
    t.have = t.existingBytes();
    const bid = String(truthy(msg.batch) ? msg.batch : '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32) || ('solo' + tid);
    let expected = 1;
    try { expected = Math.max(1, Math.min(pyInt(truthy(msg.bn) ? msg.bn : 1), 1000000)); } catch (e) { expected = 1; }
    const gkey = App.ikey(sess.peerId, bid);
    t.num = this.nextNum();
    this.incoming.set(key, t);
    let g = this.groups.get(gkey);
    if (g === undefined) {
      g = new OfferGroup(sess.peerId, bid);
      this.groups.set(gkey, g);
    }
    g.expected = expected;
    g.last = mono();
    t.group = g;
    const state = g.state;
    if (state !== 'decided') g.items.push(t);
    const ready = state === 'collecting' && g.items.length >= g.expected;
    if (state === 'decided') this.applyDecision(t, g.decision, false);    // late part of an answered offer
    else if (state === 'asking') say('[*] One more item joined the offer: ' + t.name + ' (' + human(t.size) + '). Your answer covers it too.');
    else if (ready) this.present(g);
  }

  groupProgress(g) {
    // After an item of a multi-item offer ends: one summary when the whole offer is finished.
    if (g.state !== 'decided' || g.decision !== 'y' || g.summarized) return;
    if (g.items.some(function (t) { return !t.terminal(); })) return;
    g.summarized = true;
    const done = g.items.filter(function (t) { return t.state === 'done'; }).length;
    say('[+] Finished: ' + done + ' of ' + g.items.length + ' items downloaded. Saved in: ' + this.downloadDir);
  }

  collectOverdue() {
    // Show offers whose remaining parts did not arrive in time.
    const now = mono();
    const ready = Array.from(this.groups.values()).filter(function (g) { return g.state === 'collecting' && now - g.last > GROUP_WAIT; });
    for (const g of ready) this.present(g);
  }

  present(g) {
    if (g.state !== 'collecting') return;
    const items = g.live();
    if (!items.length) { g.state = 'decided'; g.decision = 'n'; return; }
    let need = 0;
    for (const t of items) need += Math.max(0, t.size - t.have);
    const free = diskFree(this.downloadDir);
    const nospace = free !== null && need > free;
    let first = false;
    if (nospace) {
      g.state = 'decided';
      g.decision = 'n';
    } else {
      g.state = 'asking';
      this.prompts.push(g);
      first = this.prompts.length === 1;
    }
    if (nospace) {
      for (const t of items) this.applyDecision(t, 'n', true, 'not enough free disk space on the receiver');
      say('[x] ' + g.title() + ' (' + human(need) + ') was offered, but there is not enough free disk space (' + human(free) + ' free). Refused.');
      return;
    }
    if (first && this.menu === null) this.showPrompt();
    else {
      say('[*] Another offer arrived: ' + g.title() + ' (' + human(g.size()) + '). It will be asked ' +
        (!first ? 'after the current one' : 'when you finish here') + '.');
      CONSOLE.setPrompt(CONSOLE.prompt);
    }
  }

  static typeText(t) {
    if (t.kind === 'folder') return 'folder, ' + t.entries.length + ' file(s)';
    return (splitext(t.name)[1].replace(/^\.+/, '').toUpperCase() || 'unknown') + ' file';
  }

  showPrompt() {
    if (this.menu !== null) return;      // the stop menu is open; the question comes back after it
    let g = null, items = [], waiting = 0;
    for (;;) {
      g = this.prompts.length ? this.prompts[0] : null;
      items = g !== null ? g.live() : [];
      if (g !== null && !items.length) {   // everything in it was withdrawn
        this.prompts.shift();
        g.state = 'decided';
        g.decision = 'n';
        continue;
      }
      waiting = this.prompts.length - 1;
      break;
    }
    if (g === null) { CONSOLE.setPrompt('> '); return; }
    if (!g.answers.length) {
      const who = this.session ? this.session.peerName : 'the other user';
      const lines = ['', '='.repeat(56)];
      if (items.length === 1) {
        const t = items[0];
        lines.push('Incoming ' + t.kind + ' from ' + who + ':', '  Name : ' + t.name, '  Type : ' + App.typeText(t),
          '  Size : ' + human(t.size) + ' (' + commas(t.size) + ' bytes)');
        if (t.have) lines.push('  Note : ' + pct1(100.0 * t.have / Math.max(1, t.size)) + '% was already downloaded earlier; it will resume.');
      } else {
        lines.push('Incoming ' + items.length + ' items from ' + who + ' (' + human(g.size()) + ' total):');
        items.slice(0, 15).forEach(function (t, i) {
          lines.push('  ' + padL(i + 1, 2) + '. ' + padR(short(t.name, 30), 30) + ' ' + padR(short(App.typeText(t), 18), 18) + ' ' + padL(human(t.size), 10));
        });
        if (items.length > 15) lines.push('      ... and ' + (items.length - 15) + ' more');
        const resumed = items.filter(function (t) { return t.have; }).length;
        if (resumed) lines.push('  Note : ' + resumed + ' item(s) were partly downloaded earlier; they will resume.');
      }
      if (waiting) lines.push('  (' + waiting + ' more offer(s) waiting after this one)');
      lines.push('='.repeat(56));
      say(lines.join('\n'));
    }
    CONSOLE.setPrompt(App.promptText(g, items.length), true);
  }

  static promptText(g, count) {
    const it = count === 1 ? 'it' : 'them';
    if (!g.answers.length) return 'Do you want to download ' + it + '? (y/n): ';
    const last = g.answers[g.answers.length - 1];
    const word = last === 'y' ? 'download' : 'refuse';
    if (g.answers.length === 1) return 'Are you sure? Press ' + last + ' again to ' + word + ' ' + it + ' (y/n): ';
    return 'You changed your answer. Press ' + last + ' again to ' + word + ' ' + it + ' (y/n): ';
  }

  answerPrompt(line) {
    const g = this.prompts.length ? this.prompts[0] : null;
    if (g === null) return;
    let a = line.trim().toLowerCase();
    if (a === 'yes') a = 'y';
    if (a === 'no') a = 'n';
    if (a !== 'y' && a !== 'n') {
      say('Please type y or n.');
      CONSOLE.setPrompt(App.promptText(g, g.live().length), true);
      return;
    }
    g.answers.push(a);
    let decision = null;
    const n = g.answers.length;
    if (n >= 2 && g.answers[n - 1] === g.answers[n - 2]) decision = a;
    else if (n >= 4) {
      decision = 'n';
      say('[x] The answers kept changing, so this counts as a refusal.');
    }
    if (decision === null) {
      CONSOLE.setPrompt(App.promptText(g, g.live().length), true);
      return;
    }
    if (this.prompts.length && this.prompts[0] === g) this.prompts.shift();
    g.state = 'decided';
    g.decision = decision;
    this.decide(g.live(), decision);
    this.showPrompt();
  }

  decide(items, decision) {
    if (!items.length) return;
    let reason = 'refused';
    if (decision === 'y') {
      let need = 0;
      for (const t of items) need += Math.max(0, t.size - t.have);
      const free = diskFree(this.downloadDir);
      if (free !== null && need > free) {
        decision = 'n';
        reason = 'not enough free disk space on the receiver';
        say('[x] Not enough free disk space anymore (' + human(need) + ' needed, ' + human(free) + ' free). Refused.');
      }
    }
    const many = items.length > 1;
    if (many) {
      if (decision === 'y') {
        let total = 0;
        for (const t of items) total += t.size;
        say('[+] Downloading ' + items.length + ' items (' + human(total) + '). Press Ctrl+Z (or type cancel) to stop.');
      } else if (reason === 'refused') {
        say('[x] You refused to download ' + items.length + ' items.');
      }
    }
    for (const t of items) this.applyDecision(t, decision, many, reason);
  }

  applyDecision(t, decision, quiet, reason) {
    reason = reason || 'refused';
    const sess = (this.session !== null && this.session.peerId === t.peerId) ? this.session : null;
    if (t.state !== 'asking') return;
    if (decision === 'y') {
      const free = diskFree(this.downloadDir);
      if (free !== null && t.size - t.have > free) {
        decision = 'n';
        reason = 'not enough free disk space on the receiver';
        say('[x] Not enough free disk space for ' + t.name + '. Refused.');
      }
    }
    if (decision === 'y') {
      let offset;
      try {
        offset = t.prepare();
      } catch (e) {
        t.state = 'failed';
        say('[!] Cannot write to ' + this.downloadDir + ': ' + errText(e));
        if (sess) sess.sendCtrl({ t: 'answer', tid: t.tid, ok: false, reason: 'the receiver cannot write to its download folder' });
        return;
      }
      t.state = 'active';
      t.started = mono();
      if (!quiet) {
        say('[+] Downloading ' + t.name + ' (' + human(t.size) + ')' +
          (offset ? (' from ' + pct1(100.0 * offset / Math.max(1, t.size)) + '%') : '') + '. Press Ctrl+Z (or type cancel) to stop.');
      }
      if (sess) sess.sendCtrl({ t: 'answer', tid: t.tid, ok: true, offset: offset });
      if (t.size === 0 || offset >= t.size) t.complete(sess);
    } else {
      t.state = 'refused';
      if (!quiet && reason === 'refused') say('[x] You refused to download ' + t.name + '.');
      if (sess) sess.sendCtrl({ t: 'answer', tid: t.tid, ok: false, reason: reason });
    }
    this.transferEnded();
  }

  remoteCancelledIncoming(t, reason) {
    if (t.terminal()) return;
    const asking = t.state === 'asking';
    t.state = 'cancelled';
    if (asking) {
      say('[x] The other user withdrew the offer of ' + t.name + '.');
      const g = this.prompts.length ? this.prompts[0] : null;
      if (g !== null && g.items.indexOf(t) >= 0) this.showPrompt();
      return;
    }
    t.discard();
    if (reason) say('[x] Download of ' + t.name + ' stopped: ' + reason + '.');
    else say('[x] File downloading stopped because the other user interrupted it (' + t.name + ').');
    if (t.group !== null && t.group.items.length > 1) this.groupProgress(t.group);
    this.transferEnded();
  }

  sendCancel(tid, side, reason, peerId) {
    const sess = this.session;
    if (sess !== null && sess.alive && (!peerId || sess.peerId === peerId)) {
      sess.sendCtrl({ t: 'cancel', tid: tid, side: side, reason: reason });
    } else {
      this.pendingCancels.push([peerId || this.lastPeerId, tid, side, reason]);
    }
  }

  // ---- user actions ----
  cancelIncoming(t) {
    if (t.state !== 'active') return false;
    t.state = 'cancelled';
    t.discard();
    this.sendCancel(t.tid, 'down', '', t.peerId);
    say('[x] You interrupted the downloading of ' + t.name + '.');
    if (t.group !== null && t.group.items.length > 1) this.groupProgress(t.group);
    return true;
  }

  runningList() {
    // Transfers that can be stopped, numbered 1.. in the order they started.
    const rows = [];
    for (const t of this.outgoing.values()) if (!t.terminal() && t.state !== 'preparing') rows.push(['SENDING', t]);
    for (const t of this.incoming.values()) if (t.state === 'active') rows.push(['RECEIVING', t]);
    rows.sort(function (a, b) { return a[1].num - b[1].num; });
    return rows;
  }

  rowState(d, t) {
    if (d === 'RECEIVING') return pct1(t.size ? 100.0 * t.written / t.size : 100.0) + '%';
    if (t.state === 'sending' || (t.acceptedOnce && t.state !== 'queued')) return pct1(t.size ? 100.0 * t.acked / t.size : 100.0) + '%';
    const m = { waiting: 'waiting for connection', offered: 'waiting for answer', queued: 'in line' };
    return m[t.state] || t.state;
  }

  rowText(i, d, t) {
    return '  ' + padL(i, 2) + '. ' + padR(d, 9) + '  ' + padR(short(t.name, 28), 28) + ' ' + padR(short(App.typeText(t), 18), 18) +
      ' ' + padL(human(t.size), 10) + '   ' + this.rowState(d, t);
  }

  stopOne(t) {
    if (t.terminal()) return false;
    if (t instanceof OutTransfer) return t.cancelLocal();
    return this.cancelIncoming(t);
  }

  openStopMenu(preset) {
    // Ctrl+Z / cancel: list running transfers, let the user pick, confirm once.
    const rows = this.runningList();
    if (!rows.length) { say('[*] Nothing is uploading or downloading right now.'); return; }
    const self = this;
    const lines = ['', '-'.repeat(56), 'Running transfers:'];
    rows.forEach(function (r, i) { lines.push(self.rowText(i + 1, r[0], r[1])); });
    lines.push('-'.repeat(56));
    this.menu = { stage: 'pick', rows: rows };
    if (preset === null || preset === undefined) {
      lines.push('Type the numbers to stop (like 2, or 2 3 4), all for everything, or just Enter to keep them.');
      say(lines.join('\n'));
      CONSOLE.setPrompt('Which to stop? ', true);
    } else {
      say(lines.join('\n'));
      this.menuInput(preset);
    }
  }

  menuInput(line) {
    const m = this.menu;
    if (m === null) return;
    const rows = m.rows;
    const self = this;
    if (m.stage === 'pick') {
      const text = line.trim().toLowerCase();
      if (['', '0', 'q', 'none', 'back', 'n', 'no'].indexOf(text) >= 0) { this.closeMenu('[*] Nothing was stopped.'); return; }
      let picks = [];
      if (text === 'all' || text === 'a' || text === '*') {
        for (let i = 1; i <= rows.length; i++) picks.push(i);
      } else {
        const bad = [];
        for (let tok of text.replace(/^#+/, '').split(/[\s,;]+/)) {
          if (!tok) continue;
          tok = tok.replace(/^#+/, '');
          let nums = [];
          if (/^\d+-\d+$/.test(tok)) {             // 2-4 means 2 3 4
            const lo = parseInt(tok.split('-')[0], 10), hi = parseInt(tok.split('-')[1], 10);
            if (lo <= hi && hi - lo < 100000) for (let k = lo; k <= hi; k++) nums.push(k);
          } else if (/^\d+$/.test(tok)) nums = [parseInt(tok, 10)];
          if (!nums.length || nums.some(function (n) { return n < 1 || n > rows.length; })) { bad.push(tok); continue; }
          for (const n of nums) if (picks.indexOf(n) < 0) picks.push(n);
        }
        if (bad.length || !picks.length) {
          say('[!] ' + (bad.join(', ') || 'That') + ' is not on the list. Type numbers from 1 to ' + rows.length +
            ' with spaces between them, like 2 3.');
          CONSOLE.setPrompt(CONSOLE.prompt, true);
          return;
        }
      }
      picks.sort(function (a, b) { return a - b; });
      const chosen = picks.map(function (n) { return rows[n - 1]; });
      m.stage = 'confirm';
      m.chosen = chosen;
      let q;
      if (chosen.length === 1) {
        const d = chosen[0][0], t = chosen[0][1];
        q = 'Stop ' + (d === 'SENDING' ? 'sending' : 'receiving') + ' ' + short(t.name, 30) + '? (y/n): ';
      } else {
        say('You picked:\n' + picks.map(function (n, i) { return self.rowText(n, chosen[i][0], chosen[i][1]); }).join('\n'));
        q = 'Stop these ' + chosen.length + ' transfers? (y/n): ';
      }
      CONSOLE.setPrompt(q, true);
      return;
    }
    const a = line.trim().toLowerCase();
    if (a === 'y' || a === 'yes') {
      const chosen = m.chosen;
      this.menu = null;
      for (const r of chosen) {
        const t = r[1];
        if (t.terminal()) say('[*] ' + t.name + ' already finished, so it was not stopped.');
        else this.stopOne(t);
      }
      this.transferEnded();
      this.closeMenu(null);
    } else if (a === 'n' || a === 'no') {
      this.closeMenu('[*] Nothing was stopped. Transfers keep going.');
    } else {
      say('Please type y or n.');
      CONSOLE.setPrompt(CONSOLE.prompt, true);
    }
  }

  closeMenu(message) {
    this.menu = null;
    if (message) say(message);
    this.showPrompt();               // back to the y/n download question, or the normal prompt
  }

  transferEnded() {
    CONSOLE.setStatus(this.statusLine());
  }

  upload(arg) {
    if (!arg.trim()) { say('Usage: upload <file or folder> [more files or folders...]'); return; }
    const pm = parsePaths(arg), paths = pm[0], missing = pm[1];
    for (const m of missing) say('[!] Not found: ' + m);
    if (!paths.length) return;
    if (paths.length > MAX_BATCH) {
      say('[!] That is ' + paths.length + ' items; one upload can offer up to ' + MAX_BATCH + '. Put them in a folder and upload the folder ' +
        '(any number of files), or upload them in parts.');
      return;
    }
    const busy = new Set();
    for (const t of this.outgoing.values()) if (!t.terminal()) busy.add(normcase(t.path));
    const items = [];
    for (const p of paths) {
      const ap = path.resolve(p);
      if (busy.has(normcase(ap))) {
        say('[!] ' + (path.basename(ap.replace(/[\\/]+$/, '')) || ap) + ' is already being sent.');
        continue;
      }
      busy.add(normcase(ap));
      items.push(new OutTransfer(this, ap));
    }
    if (!items.length) return;
    const batch = new Batch(items);
    for (const t of items) {
      t.batch = batch;
      t.num = this.nextNum();
      this.outgoing.set(t.tid, t);
    }
    const self = this;
    setImmediate(function () { self._startBatch(batch); });
  }

  _startBatch(batch) {
    const ok = batch.members.filter(function (t) { return t.prepare(); });
    batch.members = ok;
    if (!ok.length) { this.transferEnded(); return; }
    if (ok.length > 1) {
      if (this.sessionAlive()) say('[*] Offered ' + batch.describe() + '. Waiting for the other user to answer...');
      else say('[*] ' + batch.describe() + ' will be offered as soon as the other user is connected.');
    }
    for (const t of ok) t.run().catch(function (e) { debug('run', e); });
  }

  static agg(label, rows, note) {
    let size = 0, done = 0, rate = 0;
    for (const r of rows) { size += r[1]; done += r[2]; rate += r[3]; }
    const pct = size ? 100.0 * done / size : 100.0;
    const eta = rate > 0 ? (size - done) / rate : null;
    const name = rows.length === 1 ? short(rows[0][0], 18) : (rows.length + ' items');
    return label + ' ' + name + ' ' + pct1(pct) + '% ' + human(done) + '/' + human(size) + ' ' + human(rate) + '/s ETA ' + fmtEta(eta) + note;
  }

  statusLine() {
    const alive = this.sessionAlive();
    const ups = Array.from(this.outgoing.values()).filter(function (t) { return t.acceptedOnce && !t.terminal(); });
    const downs = Array.from(this.incoming.values()).filter(function (t) { return t.state === 'active'; });
    const parts = [];
    if (ups.length) {
      let note = alive ? '' : ' paused';
      if (alive && ups.length === 1 && ups[0].state === 'queued') note = ' queued';
      parts.push(App.agg('UP', ups.map(function (t) { return [t.name, t.size, t.acked, t.meter.rate()]; }), note));
    }
    if (downs.length) {
      parts.push(App.agg('DOWN', downs.map(function (t) { return [t.name, t.size, t.written, t.meter.rate()]; }), alive ? '' : ' paused'));
    }
    return parts.join(' | ');
  }

  printStatus() {
    const s = this.session;
    if (s !== null && s.alive) say('[*] Connected to ' + s.peerName + ' via ' + s.label + '.');
    else say('[*] Not connected. ' + (this.dialer.hasTarget() ? ('Trying ' + this.dialer.raw) : 'Waiting for the other user to connect.'));
    say('[*] Listening on port ' + this.port + '. Downloads folder: ' + this.downloadDir);
    const rows = this.runningList();
    const asking = Array.from(this.incoming.values()).filter(function (t) { return t.state === 'asking'; });
    if (!rows.length && !asking.length) { say('[*] Transfers: none running.'); return; }
    if (rows.length) {
      say('[*] Running transfers (Ctrl+Z or cancel to stop some):');
      const self = this;
      rows.forEach(function (r, i) { say(self.rowText(i + 1, r[0], r[1])); });
    }
    for (const t of asking) say('    waiting for your y/n answer: ' + t.name + ' (' + human(t.size) + ')');
  }

  help() {
    say('Commands:\n' +
      '  upload <files/folders>   offer one or more files/folders (any type, any size)\n' +
      '                           e.g. upload movie.mp4 "My Photos" notes.pdf   or   upload *.jpg\n' +
      '  Ctrl+Z  or cancel        choose which uploads/downloads to stop (2, or 2 3 4, or all)\n' +
      '  cancel 2 3               stop transfers 2 and 3 directly (numbers from status)\n' +
      '  connect <address>        connect to a new address (e.g. a new tunnel URL)\n' +
      '  status                   connection and every transfer with its number\n' +
      '  exit    or Ctrl+C        quit\n' +
      'You can upload more at any time, even while other files are still moving.');
  }

  handleLine(line) {
    if (this.stopping) return;
    if (this.menu !== null) {
      const w = line.trim().toLowerCase();
      if (w === 'exit' || w === 'quit') { this.quit(); return; }
      this.menuInput(line);
      return;
    }
    if (this.prompts.length) {
      const word = line.trim().split(' ')[0].toLowerCase();
      if (['cancel', 'stop', 'exit', 'quit', 'upload', 'send', 'status', 'list', 'help', 'connect'].indexOf(word) < 0) {
        this.answerPrompt(line);
        return;
      }
    }
    const s = line.trim();
    const sp = s.indexOf(' ');
    const cmd = sp >= 0 ? s.slice(0, sp) : s;
    const arg = sp >= 0 ? s.slice(sp + 1) : '';
    const c = cmd.toLowerCase();
    if (!c) return;
    if (['y', 'n', 'yes', 'no'].indexOf(c) >= 0 && !arg) say('[*] No download question is open right now.');
    else if (['upload', 'up', 'send', 'u'].indexOf(c) >= 0) this.upload(arg);
    else if (c === 'cancel' || c === 'stop') this.openStopMenu(arg.trim() || null);
    else if (c === 'exit' || c === 'quit' || c === 'q') this.quit();
    else if (c === 'status' || c === 'list' || c === 'ls') this.printStatus();
    else if (c === 'connect') {
      if (arg.trim()) this.dialer.setTarget(arg.trim(), true);
      else say('Usage: connect <address or URL>');
    } else if (c === 'help' || c === '?' || c === 'h') this.help();
    else {
      const pm = parsePaths(line);
      if (pm[0].length && !pm[1].length) this.upload(line);    // dragged files in without typing 'upload'
      else say('Unknown command. Type help to see the commands.');
    }
  }

  // ---- lifecycle ----
  tick() {
    try { CONSOLE.setStatus(this.statusLine()); } catch (e) { debug('tick', e); }
  }

  watchdog() {
    const now = mono();
    for (const s of Array.from(this.sessions)) {
      if (s.alive && s.attached && now - s.lastRx > s.conn.deadAfter) s.kill();
    }
    try { this.collectOverdue(); } catch (e) { debug('overdue', e); }
  }

  async shutdown() {
    this.stopping = true;
    this.listener.stop();
    const sess = this.session;
    if (sess !== null && sess.alive) {
      sess.sendCtrl({ t: 'bye' });
      await sess.flushAndClose(0.6);
    }
    for (const s of Array.from(this.sessions)) s.kill();
    for (const t of this.incoming.values()) t.closeFiles();
    this.listener.stop();
  }

  quit() {
    if (this.quitting) return;
    this.quitting = true;
    CONSOLE.setStatus('');
    CONSOLE.prompt = '';
    say('\n[*] Closing ' + APP_NAME + '... (unfinished downloads are kept and resume next time)');
    const self = this;
    const finish = function () {
      if (self.editor) self.editor.close();
      say('[*] Bye.');
      const done = function () { process.exit(0); };
      if (process.stdout.writableLength) process.stdout.write('', done); else done();
      setTimeout(done, 500).unref();
    };
    setTimeout(finish, 3000).unref();
    this.shutdown().catch(function (e) { debug('shutdown', e); }).then(finish);
  }

  run() {
    const self = this;
    this.listener.run().catch(function (e) { debug('listener', e); });
    this.dialer.run().catch(function (e) { debug('dialer', e); });
    setInterval(function () { self.tick(); }, CONSOLE.tty ? 1000 : 5000);
    setInterval(function () { self.watchdog(); }, 500);
    this.editor = new LineEditor(function (line) {
      try { self.handleLine(line); } catch (e) { debug('line', e); }
    }, function () { self.ctrlZ(); }, function () { self.quit(); });
  }

  ctrlZ() {
    const self = this;
    setImmediate(function () { if (!self.stopping) self.openStopMenu(null); });
  }
}

// ======================================================================
// Listening side: one port that understands every connection type
// ======================================================================
const HTTP_METHODS = new Set(['GET ', 'POST', 'HEAD', 'PUT ', 'OPTI', 'DELE', 'PATC', 'CONN']);
const CRLF2 = Buffer.from('\r\n\r\n');
const CRLF = Buffer.from('\r\n');

function listenOnce(port, host) {
  return new Promise(function (resolve, reject) {
    const srv = net.createServer();
    const onErr = function (e) { srv.removeAllListeners('listening'); try { srv.close(); } catch (x) { /* ignore */ } reject(e); };
    srv.once('error', onErr);
    srv.once('listening', function () {
      srv.removeListener('error', onErr);
      srv.on('error', function (e) { debug('server', e); });
      resolve(srv);
    });
    const opts = { port: port, host: host, backlog: 64 };
    if (host === '::') opts.ipv6Only = false;
    srv.listen(opts);
  });
}

async function makeListener(port) {
  try {
    return await listenOnce(port, '::');
  } catch (e) {
    if (e.code === 'EADDRINUSE' || e.code === 'EACCES') throw e;
  }
  return listenOnce(port, '0.0.0.0');
}

function waitFirstChunk(sock, sec) {
  return new Promise(function (resolve) {
    let done = false;
    const finish = function (v) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.removeListener('data', onData);
      sock.removeListener('end', onEnd);
      sock.removeListener('close', onEnd);
      resolve(v);
    };
    const onData = function (c) { sock.pause(); finish(c); };
    const onEnd = function () { finish(null); };
    const timer = setTimeout(function () { finish(null); }, sec * 1000);
    sock.on('data', onData);
    sock.on('end', onEnd);
    sock.on('close', onEnd);
  });
}

class Listener {
  constructor(app) {
    this.app = app;
    this.srv = null;
    this.stopped = false;
    this.polls = new Map();
  }

  stop() {
    this.stopped = true;
    if (this.srv !== null) {
      try { this.srv.close(); } catch (e) { /* ignore */ }
    }
  }

  async run() {
    let delay = 1.0, warned = false;
    while (!this.stopped) {
      try {
        this.srv = await makeListener(this.app.port);
        break;
      } catch (e) {
        if (!warned) {
          warned = true;
          say('[!] Port ' + this.app.port + ' is busy (' + errText(e) + '). Retrying in the background; ' +
            'connecting out still works.');
        }
        await sleep(delay);
        delay = Math.min(delay * 1.5, 3.0);
      }
    }
    if (this.stopped) { this.stop(); return; }
    if (warned) say('[+] Now listening on port ' + this.app.port + '.');
    const self = this;
    this.srv.on('connection', function (sock) {
      sock.on('error', function () { /* handled below */ });
      if (self.stopped) { sock.destroy(); return; }
      self.handle(sock).catch(function (e) { debug('handle', e); try { sock.destroy(); } catch (x) { /* ignore */ } });
    });
  }

  async handle(raw) {
    tuneSocket(raw);
    const first = await waitFirstChunk(raw, SNIFF_TIMEOUT);
    if (!first || !first.length) { raw.destroy(); return; }
    raw.unshift(first);
    let sock = raw, isTls = false;
    if (first[0] === 0x16) {
      const ctx = serverCtx();
      if (ctx === null) { raw.destroy(); return; }
      try {
        sock = new tls.TLSSocket(raw, { isServer: true, secureContext: ctx, ALPNProtocols: ['http/1.1'] });
      } catch (e) {
        raw.destroy();
        return;
      }
      sock.on('error', function () { /* handled by the pipe */ });
      isTls = true;
    }
    const conn = new SockConn(sock, isTls ? 'TLS-encrypted TCP' : 'TCP');
    if (!isTls) raw.resume();
    try {
      const rd = new Reader(conn);
      const deadline = mono() + SNIFF_TIMEOUT;
      try {
        while (rd.buf.length < MAGIC.length) {
          if (rd.buf.length >= 4 && !MAGIC.subarray(0, rd.buf.length).equals(rd.buf.peek(rd.buf.length))) break;
          await rd._fill(deadline);
        }
      } catch (e) {
        return;
      }
      const remotePrivate = isLanPeer(String(raw.remoteAddress || ''));
      const head = rd.buf.peek(MAGIC.length);
      if (head.length === MAGIC.length && head.equals(MAGIC)) {
        rd.buf.take(MAGIC.length);
        conn.unshift(rd.release());
        const sess = this.app.newSession(conn, false);
        sess.remotePrivate = remotePrivate;
        try { await this.app.runSession(sess, true); } catch (e) { /* not a peer */ }
        return;
      }
      if (HTTP_METHODS.has(rd.buf.peek(4).toString('latin1'))) {
        conn.unshift(rd.release());
        await this.http(conn, isTls, remotePrivate);
      }
    } finally {
      conn.close();
    }
  }

  // ---- HTTP: WebSocket upgrade, polling transport, and a friendly page ----
  async http(conn, isTls, remotePrivate) {
    const rd = new Reader(conn);
    while (!this.stopped) {
      let head;
      try {
        head = await rd.until(CRLF2, 65536, mono() + HTTP_IDLE);
      } catch (e) {
        return;
      }
      const ph = parseHead(head), first = ph[0], headers = ph[1];
      if (first.length < 3) return;
      const method = first[0].toUpperCase(), target = first[1], version = first[2].toUpperCase();
      const body = await Listener.readBody(rd, headers);
      if (body === null) return;
      const q = target.indexOf('?');
      let p = q >= 0 ? target.slice(0, q) : target;
      const query = q >= 0 ? target.slice(q + 1) : '';
      if (p.indexOf('://') >= 0) {                        // absolute-form request
        const after = p.slice(p.indexOf('://') + 3);
        const s = after.indexOf('/');
        p = '/' + (s >= 0 ? after.slice(s + 1) : '');
      }
      const params = {};
      for (const kv of query.split('&')) {
        if (!kv) continue;
        const e = kv.indexOf('=');
        if (e >= 0) params[kv.slice(0, e)] = kv.slice(e + 1); else params[kv] = '';
      }
      const connHdr = (headers.connection || '').toLowerCase();
      let keep = version === 'HTTP/1.1' && connHdr !== 'close';
      if (!keep && connHdr.indexOf('keep-alive') >= 0) keep = true;
      if (p === '/fs/ws' && (headers.upgrade || '').toLowerCase().indexOf('websocket') >= 0) {
        const key = headers['sec-websocket-key'] || '';
        try {
          conn.write(httpHead(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
            'Sec-WebSocket-Accept: ' + wsAccept(key), MARK_HEADER + ': 1']));
        } catch (e) {
          return;
        }
        const rest = rd.release();
        const ws = new WSConn(conn, false, isTls ? 'WebSocket over HTTPS' : 'WebSocket over HTTP', rest);
        const sess = this.app.newSession(ws, false);
        sess.remotePrivate = remotePrivate;
        try { await this.app.runSession(sess, false); } catch (e) { /* not a peer */ }
        return;
      }
      let status, seq, data;
      if (p.indexOf('/fs/p/') === 0) {
        const r = await this.poll(p, params, method, body, isTls, remotePrivate);
        status = r[0]; seq = r[1]; data = r[2];
      } else {
        status = 200; seq = null;
        data = Buffer.from(APP_NAME + ' is running. Use file-share.js, file-share.py or file-share.cs to connect.\n');
      }
      const reason = { 200: 'OK', 404: 'Not Found', 410: 'Gone', 400: 'Bad Request' }[status] || 'OK';
      const lines = ['HTTP/1.1 ' + status + ' ' + reason,
        'Content-Type: ' + (p.indexOf('/fs/') === 0 ? 'application/octet-stream' : 'text/plain'),
        'Content-Length: ' + (method !== 'HEAD' ? data.length : 0),
        'Cache-Control: no-store', MARK_HEADER + ': 1',
        'Connection: ' + (keep ? 'keep-alive' : 'close')];
      if (seq !== null) lines.push('X-Seq: ' + seq);
      try {
        conn.write(httpHead(lines));
        if (method !== 'HEAD' && data.length) conn.write(data);
      } catch (e) {
        return;
      }
      if (!keep || conn.closed) return;
    }
  }

  static async readBody(rd, headers) {
    try {
      const deadline = mono() + 120;
      if ((headers['transfer-encoding'] || '').toLowerCase().indexOf('chunked') >= 0) {
        const out = [];
        let total = 0;
        for (;;) {
          const line = (await rd.until(CRLF, 1024, deadline)).toString('latin1');
          const hex = line.split(';')[0].trim() || '0';
          if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
          const size = parseInt(hex, 16);
          if (size === 0) {
            for (;;) {
              const t = await rd.until(CRLF, 8192, deadline);
              if (t.length === 2) break;
            }
            return Buffer.concat(out, total);
          }
          if (total + size > MAX_FRAME) return null;
          out.push(await rd.exact(size, deadline));
          total += size;
          await rd.exact(2, deadline);
        }
      }
      const cl = (headers['content-length'] || '0').trim() || '0';
      if (!/^\d+$/.test(cl)) return null;
      const n = parseInt(cl, 10);
      if (n < 0 || n > MAX_FRAME) return null;
      return n ? await rd.exact(n, deadline) : Buffer.alloc(0);
    } catch (e) {
      return null;
    }
  }

  async poll(p, params, method, body, isTls, remotePrivate) {
    const parts = p.replace(/^\/+|\/+$/g, '').split('/');     // fs, p, new | fs, p, sid, op
    const empty = Buffer.alloc(0);
    if (parts.length === 3 && parts[2] === 'new' && method === 'POST') {
      const pc = new PollServerConn(isTls ? 'HTTPS polling' : 'HTTP polling');
      for (const sid of Array.from(this.polls.keys())) if (this.polls.get(sid).closed) this.polls.delete(sid);
      this.polls.set(pc.sid, pc);
      const sess = this.app.newSession(pc, false);
      sess.remotePrivate = remotePrivate;
      this.app.runSession(sess, false).catch(function () { /* not a peer */ }).then(function () { pc.close(); });
      return [200, null, Buffer.from(pc.sid)];
    }
    if (parts.length !== 4) return [404, null, empty];
    const pc = this.polls.get(parts[2]);
    if (pc === undefined) return [404, null, empty];
    try {
      if (parts[3] === 'up') return [pc.handleUp(pyInt(params.seq === undefined ? '0' : params.seq), body), null, empty];
      if (parts[3] === 'down') return await pc.handleDown(pyInt(params.ack === undefined ? '0' : params.ack));
      if (parts[3] === 'close') { pc.close(); return [200, null, empty]; }
    } catch (e) {
      return [400, null, empty];
    }
    return [404, null, empty];
  }
}

// ======================================================================
// Connecting side: works out the right protocol by itself
// ======================================================================
function isDigits(s) { return /^\d+$/.test(s); }

function parseTarget(raw, defaultPort) {
  // IP, hostname, host:port, [v6]:port, or scheme://host[:port]/... -> [host, port, scheme, explicitPort]
  let s = String(raw).trim().replace(/^["']+|["']+$/g, '');
  let scheme = null;
  const i = s.indexOf('://');
  if (i >= 0) {
    scheme = s.slice(0, i).trim().toLowerCase();
    s = s.slice(i + 3);
    scheme = { ws: 'http', wss: 'https', tls: 'https', ssl: 'https' }[scheme] || scheme;
    if (scheme !== 'tcp' && scheme !== 'http' && scheme !== 'https') scheme = null;
  }
  s = s.split('/')[0].split('?')[0].split('#')[0];
  if (s.indexOf('@') >= 0) s = s.slice(s.lastIndexOf('@') + 1);
  let host = s, port = null;
  if (s.indexOf('[') === 0) {
    const end = s.indexOf(']');
    host = end > 0 ? s.slice(1, end) : s.replace(/^\[+|\]+$/g, '');
    const rest = end > 0 ? s.slice(end + 1) : '';
    if (rest.indexOf(':') === 0 && isDigits(rest.slice(1))) port = parseInt(rest.slice(1), 10);
  } else if (s.split(':').length === 2) {
    const hp = s.split(':');
    if (isDigits(hp[1])) { host = hp[0]; port = parseInt(hp[1], 10); }
  }
  host = host.trim().replace(/\.+$/, '');
  const explicit = port !== null;
  if (port === null) port = ({ https: 443, http: 80 })[scheme] || defaultPort;
  return [host, port, scheme, explicit];
}

function candidates(port, scheme, explicit) {
  // [protocol, port] to try, most likely first.
  let order;
  if (scheme === 'tcp') order = ['tcp', 'tls', 'ws', 'wss', 'poll', 'polls'];
  else if (scheme === 'http') order = ['ws', 'poll', 'wss', 'polls', 'tcp', 'tls'];
  else if (scheme === 'https') order = ['wss', 'polls', 'tls', 'ws', 'poll', 'tcp'];
  else if (port === 443) order = ['wss', 'tls', 'polls', 'tcp', 'ws', 'poll'];
  else if (port === 80) order = ['ws', 'poll', 'tcp', 'wss', 'tls', 'polls'];
  else order = ['tcp', 'tls', 'ws', 'wss', 'poll', 'polls'];
  let out = order.map(function (p) { return [p, port]; });
  if (scheme === null && !explicit) out = out.concat([['wss', 443], ['ws', 80], ['polls', 443], ['poll', 80]]);  // bare tunnel hostname
  const only = (process.env.FILESHARE_PROTO || '').trim().toLowerCase();    // testing aid: force one protocol
  if (only) {
    const allowed = only.split(',');
    const f = out.filter(function (c) { return allowed.indexOf(c[0]) >= 0; });
    if (f.length) out = f;
  }
  return out;
}

function sameCand(a, b) { return !!a && !!b && a[0] === b[0] && a[1] === b[1]; }

class Dialer {
  constructor(app) {
    this.app = app;
    this.raw = '';
    this.host = null;
    this.cands = [];
    this.best = null;
    this.holder = [];
    this.event = new Event();
    this.selfTarget = false;
    this.busyNoted = false;
    this.gen = 0;
    this.lastProbe = mono();
    this.scheme = null;
    this.fails = 0;
    this.failSince = null;
    this.toldSoft = false;
  }

  hasTarget() { return !!this.host && !this.selfTarget; }

  metered() {
    // Tunnels that count every connection/request against a monthly quota (ngrok free:
    // 5,000 TCP connections, 20,000 HTTP requests): retry more gently there.
    return !!this.host && /(^|\.)ngrok(-free)?\.(app|dev|io)$/.test(this.host.toLowerCase());
  }

  wake() { this.event.set(); }

  noteBusy() {
    if (!this.busyNoted) {
      this.busyNoted = true;
      say('[!] The other computer is already sharing with someone else. Will keep trying.');
    }
  }

  setTarget(raw, announce) {
    const t = parseTarget(raw, this.app.port);
    const host = t[0], port = t[1], scheme = t[2], explicit = t[3];
    if (!host) { say('[!] That address looks empty.'); return; }
    this.raw = raw;
    this.host = host;
    this.cands = candidates(port, scheme, explicit);
    this.scheme = scheme;
    this.fails = 0;
    this.failSince = null;
    this.toldSoft = false;
    this.best = null;
    this.holder = [];
    this.selfTarget = false;
    this.busyNoted = false;
    this.gen += 1;
    if (announce) {
      say('[*] Will connect to ' + raw + ' (protocol detected automatically).');
      const s = this.app.session;
      if (s !== null && s.alive && s.dialer) s.kill();      // switch now; transfers resume on the new link
    }
    this.event.set();
  }

  async run() {
    let delay = 1.0;
    let announced = false;
    while (!this.app.stopping) {
      if (!this.hasTarget() || this.app.sessionAlive()) {
        await this.maybeUpgrade();
        await this.event.wait(1.0);
        this.event.clear();
        continue;
      }
      const gen = this.gen, host = this.host;
      let order = this.cands.slice();
      const bi = order.findIndex(function (c) { return sameCand(c, this.best); }, this);
      if (bi >= 0) {
        order.splice(bi, 1);
        order.unshift(this.best);
        if (this.fails && this.fails % 6) order = [this.best];   // reconnecting: the type that worked; full scan every 6th try
      }
      if (!announced) {
        announced = true;
        say('[*] Connecting to ' + this.raw + ' ...');
      }
      const result = await this.attempt(host, order, gen);
      if (result === 'ok' || result === 'dup') {
        delay = 1.0;
        announced = true;
        this.fails = 0; this.failSince = null; this.toldSoft = false;
        await this.event.wait(1.0);
        this.event.clear();
        continue;
      }
      if (result === 'self') {
        say('[*] ' + this.raw + ' points to this computer itself (your own tunnel). Waiting for the other ' +
          'user to connect to you.');
        continue;
      }
      if (result === 'soft' && !this.toldSoft) {
        this.toldSoft = true;
        say('[*] The tunnel is up, but ' + APP_NAME + ' is not running on the other side yet. Waiting for it...');
      }
      this.fails += 1;
      if (this.failSince === null) this.failSince = mono();
      let cap = RETRY_MAX;
      if (this.metered()) cap = mono() - this.failSince < 600 ? 30.0 : 60.0;
      await this.event.wait(delay);
      this.event.clear();
      delay = Math.min(delay * 2, cap);
    }
  }

  async maybeUpgrade() {
    // On the slow HTTP-polling fallback, check now and then whether a WebSocket works
    // (e.g. the other app was still starting when we first connected) and switch to it.
    const s = this.app.session;
    if (s === null || !s.alive || !s.dialer || !(s.conn instanceof PollClientConn)) return;
    const now = mono();
    if (now - this.lastProbe < 60.0) return;
    this.lastProbe = now;
    const host = this.host, gen = this.gen;
    const order = this.cands.filter(function (c) { return c[0] === 'ws' || c[0] === 'wss'; });
    for (const c of order) {
      let conn;
      try {
        conn = await wsClient(host, c[1], c[0] === 'wss', this.holder.slice());
      } catch (e) {
        continue;
      }
      conn.close();
      if (gen !== this.gen) return;
      this.best = c;
      say('[*] A faster connection type is available; switching (transfers continue).');
      s.kill();
      this.event.set();
      return;
    }
  }

  async attempt(host, order, gen) {
    const downPorts = new Set();
    let softEof = false;
    for (const c of order) {
      const proto = c[0], port = c[1];
      if (this.app.stopping || gen !== this.gen || this.app.sessionAlive()) return 'stale';
      if (downPorts.has(port)) continue;
      if (softEof && (proto === 'poll' || proto === 'polls')) continue;   // the app behind the tunnel may still be starting
      let conn;
      try {
        conn = await this.open(proto, host, port);
      } catch (e) {
        if (e instanceof HostDown) return 'down';
        if (e instanceof PortDown) { downPorts.add(port); continue; }
        if (e instanceof TunnelNoApp) return 'soft';      // an HTTP tunnel answered for the missing app: stop here
        if (e instanceof SoftEOF) {
          softEof = true;
          if (this.scheme === 'tcp' && proto === 'tcp') return 'soft';   // a TCP tunnel with nothing behind it
          continue;
        }
        debug('open ' + proto, e);
        continue;                                      // something answered, but not this protocol
      }
      if (gen !== this.gen || this.app.sessionAlive() || this.app.stopping) {
        try { conn.close(); } catch (e) { /* ignore */ }
        return 'stale';
      }
      const sess = this.app.newSession(conn, true);
      sess.remotePrivate = isLanPeer(host);
      this.app.sessions.add(sess);
      let ok;
      try {
        await sess.handshake(false);
        if (sess.peerId === INSTANCE_ID) throw new NotUs('self');
        if (sess.peerBusy && sess.peerBusy !== INSTANCE_ID) throw new Busy();
        if (gen !== this.gen) throw new NotUs('address changed meanwhile');
        sess.startWriter();
        ok = this.app.attach(sess);
      } catch (e) {
        sess.alive = false;
        try { conn.close(); } catch (x) { /* ignore */ }
        sess.kill();
        this.app.sessions.delete(sess);
        if (sess.peerId === INSTANCE_ID) {
          if (gen === this.gen) this.selfTarget = true;
          return 'self';
        }
        if (e instanceof Busy) { this.noteBusy(); return 'busy'; }
        if (e instanceof SoftEOF) {
          softEof = true;
          if (e instanceof TunnelNoApp || (this.scheme === 'tcp' && proto === 'tcp')) return 'soft';
        }
        continue;
      }
      if (!ok) {
        await sess.flushAndClose(0.3);
        return 'dup';
      }
      this.best = c;
      this.busyNoted = false;
      sess.runReader().catch(function (e) { debug('reader', e); });
      return 'ok';
    }
    return softEof ? 'soft' : 'fail';
  }

  async open(proto, host, port) {
    if (proto === 'tcp' || proto === 'tls') {
      if (proto === 'tls') return new SockConn(await connectTls(host, port, this.holder), 'TLS-encrypted TCP');
      return new SockConn(await connectTcp(host, port), 'TCP');
    }
    if (proto === 'ws' || proto === 'wss') return wsClient(host, port, proto === 'wss', this.holder);
    return new PollClientConn(host, port, proto === 'polls', this.holder).open();
  }
}

function isLanPeer(host) {
  // A real LAN neighbour (not this machine and not a local tunnel agent).
  const h = String(host).replace('::ffff:', '').toLowerCase();
  if (h === 'localhost' || h === '::1' || h.indexOf('127.') === 0) return false;
  return isPrivateHost(h);
}

// ======================================================================
// Main
// ======================================================================
function pickDownloadDir(configured) {
  const cands = [];
  if (configured) cands.push(path.resolve(expandUser(configured)));
  let here;
  try {
    here = path.dirname(path.resolve(process.argv[1] || __filename));
  } catch (e) {
    here = process.cwd();
  }
  cands.push(path.join(here, 'FileShare Downloads'), path.join(process.cwd(), 'FileShare Downloads'),
    path.join(os.homedir(), 'FileShare Downloads'), path.join(os.tmpdir(), 'FileShare Downloads'));
  for (const d of cands) {
    try {
      mkdirp(d);
      const probe = path.join(d, '.write-test-' + INSTANCE_ID);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return d;
    } catch (e) {
      continue;
    }
  }
  return cands[cands.length - 1];
}

function main() {
  let peer = PEER_ADDRESS;
  let port = PORT;
  let folder = DOWNLOAD_FOLDER;
  if (process.argv.length > 2 && process.argv[2].trim()) peer = process.argv[2].trim();
  if (process.env.FILESHARE_PEER !== undefined) peer = process.env.FILESHARE_PEER;
  if (process.env.FILESHARE_PORT !== undefined) {
    const p = String(process.env.FILESHARE_PORT).trim();
    if (/^[+-]?\d+$/.test(p)) port = parseInt(p, 10);
  }
  if (process.env.FILESHARE_DIR !== undefined) folder = process.env.FILESHARE_DIR;

  process.on('uncaughtException', function (e) { debug('uncaught', e); });
  process.on('unhandledRejection', function (e) { debug('unhandled', e); });

  const downloadDir = pickDownloadDir(folder);
  const app = new App(peer.trim(), port, downloadDir);
  const quit = function () { app.quit(); };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
  if (!IS_WINDOWS) {
    try { process.on('SIGHUP', quit); } catch (e) { /* ignore */ }
    // POSIX terminals send SIGTSTP for Ctrl+Z: use it to cancel instead of suspending.
    try { process.on('SIGTSTP', function () { app.ctrlZ(); }); } catch (e) { /* ignore */ }
  }
  const ips = lanIps();
  say('='.repeat(60));
  say(' ' + APP_NAME + ' - send and receive files and folders of any size');
  say('='.repeat(60));
  say(' Listening on port ' + port + ' (TCP, TLS, HTTP, HTTPS, WebSocket)');
  if (ips.length) say(' Same Wi-Fi? The other user can use: ' + ips.map(function (ip) { return ip + ':' + port; }).join(', '));
  say(' Internet? Tunnel port ' + port + ' with Pinggy or ngrok and share the address it prints.');
  say(' Downloads go to: ' + downloadDir);
  say(' Commands: upload <files/folders> | Ctrl+Z (stop) | status | connect <address> | help | exit (Ctrl+C)');
  say('='.repeat(60));
  if (!peer.trim()) say('[*] Waiting for the other user to connect...');
  app.run();
}

main();
