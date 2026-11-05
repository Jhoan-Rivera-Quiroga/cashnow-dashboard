/* Google sign-in, the Google file chooser, and reading the data sheet with the Sheets API.
   Active only when js/config.js has a client ID and an API key. */
(function (CN) {
  'use strict';
  const { DataError } = CN.data;
  const cfg = (CN.config && CN.config.google) || {};

  // drive.file lets the dashboard open only the spreadsheets each person picks with it.
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
  const STORE = 'cashnow.googleSheet'; // id and name of the picked spreadsheet, kept in this browser
  // Numbers as numbers and dates as serial day numbers, the way SheetJS reads a workbook file.
  const RAW = [['valueRenderOption', 'UNFORMATTED_VALUE'], ['dateTimeRenderOption', 'SERIAL_NUMBER']];

  // The client ID starts with the Cloud project number (123456789012-abc.apps.googleusercontent.com).
  const projectNumber = String(cfg.projectNumber || (/^(\d+)-/.exec(cfg.clientId || '') || [])[1] || '');
  const enabled = Boolean(cfg.clientId && cfg.apiKey && projectNumber);
  const fixedSheet = cfg.sheetId ? String(cfg.sheetId) : null; // set in js/config.js, or picked per browser

  class Cancelled extends Error {
    constructor() { super('Cancelled'); this.name = 'Cancelled'; }
  }
  class NoAccess extends DataError {}

  let tokenClient = null;
  let token = null, expires = 0; // kept in memory only, so closing or reloading the page drops it
  let pending = null; // the sign-in waiting for Google's answer
  let ready = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`${src} didn't load`));
      document.head.append(s);
    });
  }

  // Loads Google's sign-in and file chooser scripts; resolves once sign-in can start.
  function init() {
    if (!ready) {
      const signIn = loadScript('https://accounts.google.com/gsi/client').then(() => {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: cfg.clientId, scope: SCOPE, callback: onToken, error_callback: onTokenError,
        });
      });
      const picker = loadScript('https://apis.google.com/js/api.js').then(() => new Promise((resolve, reject) => {
        gapi.load('picker', { callback: resolve, onerror: reject, timeout: 20000, ontimeout: reject });
      }));
      ready = Promise.all([signIn, picker]).then(() => true, err => {
        console.error(err);
        throw new DataError("Google sign-in didn't load. Check the internet connection, turn off any " +
          'blocker for this page, and reload.');
      });
    }
    return ready;
  }

  // Opens Google's sign-in window. It's a popup, so this has to run straight from a click.
  function requestToken() {
    if (!tokenClient) throw new DataError('Google sign-in is still loading. Try again in a moment.');
    if (pending) pending.reject(new Cancelled());
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      tokenClient.requestAccessToken({ prompt: '' }); // asks for consent only the first time
    });
  }

  function onToken(resp) {
    const p = pending;
    pending = null;
    if (!p) return;
    if (resp.error) {
      p.reject(resp.error === 'access_denied' ? new Cancelled()
        : new DataError(`Google sign-in failed (${resp.error_description || resp.error}).`));
    } else if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
      p.reject(new DataError('Google sign-in finished without permission to open the sheet. ' +
        'Sign in again and allow access.'));
    } else {
      token = resp.access_token;
      expires = Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000;
      p.resolve();
    }
  }

  function onTokenError(err) {
    const p = pending;
    pending = null;
    if (!p) return;
    const type = err && err.type;
    if (type === 'popup_closed') p.reject(new Cancelled());
    else if (type === 'popup_failed_to_open') {
      p.reject(new DataError("The browser blocked Google's sign-in window. Allow pop-ups for this page and try again."));
    } else p.reject(new DataError("Google sign-in didn't finish. Try again."));
  }

  // Google's file chooser, listing the Google Sheets this account can open (only the configured one,
  // when js/config.js names it). Picking a sheet here is what gives the dashboard access to it.
  function pickSheet() {
    const P = google.picker;
    return new Promise(resolve => {
      const view = new P.DocsView(P.ViewId.SPREADSHEETS).setMimeTypes(SHEET_MIME).setMode(P.DocsViewMode.LIST);
      if (fixedSheet) view.setFileIds(fixedSheet);
      new P.PickerBuilder()
        .setAppId(projectNumber)
        .setDeveloperKey(cfg.apiKey)
        .setOAuthToken(token)
        .addView(view)
        .enableFeature(P.Feature.NAV_HIDDEN)
        .setTitle('Choose the sheet with the Cash Now data')
        .setCallback(data => {
          const action = data[P.Response.ACTION];
          if (action === P.Action.PICKED) {
            const doc = data[P.Response.DOCUMENTS][0];
            resolve({ id: doc[P.Document.ID], name: doc[P.Document.NAME] });
          } else if (action === P.Action.CANCEL) {
            resolve(null);
          }
        })
        .build()
        .setVisible(true);
    });
  }

  // The sheet to read: the configured one, or the one picked last time in this browser.
  function remembered() {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(STORE));
      if (!(s && typeof s.id === 'string' && typeof s.name === 'string')) s = null;
    } catch (e) { /* nothing stored */ }
    if (!fixedSheet) return s;
    return { id: fixedSheet, name: s && s.id === fixedSheet ? s.name : 'the data sheet' };
  }

  function remember(sheet) {
    try { localStorage.setItem(STORE, JSON.stringify(sheet)); } catch (e) { /* private window: pick again next time */ }
  }

  function forget() {
    try { localStorage.removeItem(STORE); } catch (e) { /* nothing stored */ }
  }

  async function api(path, params, accessToken) {
    // %20 rather than + for spaces, as in Google's examples ("Driver Payouts").
    const url = SHEETS_API + path + '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (e) {
      throw new DataError("Couldn't reach Google Sheets. Check the internet connection and try again.");
    }
    if (res.ok) return res.json();
    let error = {};
    try { error = (await res.json()).error || {}; } catch (e) { /* not JSON */ }
    console.error('Google Sheets API', res.status, error);
    const reasons = (error.details || []).map(d => d.reason);
    if (res.status === 401) {
      token = null;
      throw new DataError('Your Google sign-in has expired. Sign in again.');
    }
    if (reasons.includes('SERVICE_DISABLED') || /has not been used|is disabled/i.test(error.message || '')) {
      throw new DataError("The Google Sheets API is turned off in the dashboard's Google Cloud project. " +
        'Turn it on under APIs & Services, Library.');
    }
    if (res.status === 403 || res.status === 404) {
      throw new NoAccess("Google didn't let the dashboard open that sheet. Try again in a minute. If it still " +
        "fails, check that it's shared with the Google account you signed in with.");
    }
    if (res.status === 429) throw new DataError('Google Sheets is busy. Wait a minute, then refresh.');
    const detail = error.message ? ': ' + error.message.replace(/\.$/, '') : '';
    throw new DataError(`Google Sheets answered with an error (${res.status}${detail}).`);
  }

  const quote = name => `'${name.replace(/'/g, "''")}'`;

  function columnLetters(i) {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  // Google leaves out empty cells at the end of a column and sends "" for empty cells before that.
  function toRows(valueRanges) {
    const cols = valueRanges.map(r => (r.values && r.values[0]) || []);
    const len = Math.max(0, ...cols.map(c => c.length));
    const rows = new Array(len);
    for (let i = 0; i < len; i++) rows[i] = cols.map(c => (c[i] === undefined || c[i] === '' ? null : c[i]));
    return rows;
  }

  // Reads the Collection sheet, and each optional sheet (Driver Payouts, Mail_Order) that's there.
  // Only the columns the dashboard uses are downloaded.
  async function readSheet(id, accessToken) {
    const base = encodeURIComponent(id);
    const meta = await api(base, [['fields', 'properties.title,sheets.properties.title']], accessToken);
    const title = meta.properties.title;
    const names = meta.sheets.map(s => s.properties.title);
    const what = `The "${title}" spreadsheet`;
    const tabs = [{ sheet: CN.data.findSheet(names, what), columns: CN.data.pickupColumns, read: CN.data.readPickups }];
    const optional = CN.data.OPTIONAL_SHEETS.map(o => Object.assign({ o, sheet: CN.data.findOptional(names, o) }, o));
    tabs.push(...optional.filter(t => t.sheet));

    // Each sheet's header is its first row with anything in it.
    const tops = await api(`${base}/values:batchGet`, [...tabs.map(t => ['ranges', quote(t.sheet) + '!1:20']), ...RAW], accessToken);
    const ranges = [];
    for (const [i, t] of tabs.entries()) {
      const head = tops.valueRanges[i].values || [];
      t.h = head.findIndex(r => r.some(v => v !== ''));
      try {
        if (t.h < 0) throw new DataError(`The "${t.sheet}" sheet has nothing in its first 20 rows.`);
        // An optional column that isn't in the sheet is -1, and isn't asked for.
        t.cols = Object.values(t.columns(head[t.h], t.sheet)).filter(c => c >= 0).map(c => columnLetters(c));
      } catch (err) {
        if (i === 0 || !(err instanceof DataError)) throw err;
        t.problem = err; // only that sheet's page goes without, and says why
        continue;
      }
      t.first = ranges.length;
      for (const c of t.cols) ranges.push(['ranges', `${quote(t.sheet)}!${c}${t.h + 1}:${c}`]);
    }
    const data = await api(`${base}/values:batchGet`, [...ranges, ['majorDimension', 'COLUMNS'], ...RAW], accessToken);
    const rowsOf = t => toRows(data.valueRanges.slice(t.first, t.first + t.cols.length));
    const c = tabs[0];
    const loaded = { name: title, source: 'google', sheets: names, pickups: c.read(rowsOf(c), c.h, c.sheet, 0) };
    for (const t of optional) {
      Object.assign(loaded, CN.data.optionalSheet(t.o, t.sheet, () => {
        if (t.problem) throw t.problem;
        return t.read(rowsOf(t), t.h, t.sheet, 0);
      }, what));
    }
    return loaded;
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Google gives the dashboard access to a sheet a few seconds after it's picked, and refuses it until
  // then. So reads right after a pick keep trying for about 15 seconds.
  async function readPicked(sheet, progress) {
    for (const delay of [1000, 2000, 4000, 8000]) {
      try {
        return await readSheet(sheet.id, token);
      } catch (err) {
        if (!(err instanceof NoAccess)) throw err;
        progress(`Waiting for Google to open ${sheet.name}…`);
        await wait(delay);
      }
    }
    return readSheet(sheet.id, token);
  }

  // Signs in when needed, then reads the sheet picked last time or asks which sheet to use.
  // Call it straight from a click (see requestToken). progress(text) reports what is happening.
  async function connect(progress, { choose = false } = {}) {
    if (!(token && Date.now() < expires)) await requestToken();
    const saved = choose ? null : remembered();
    let sheet = saved;
    if (!sheet) {
      progress(null);
      sheet = await pickSheet();
      if (!sheet) throw new Cancelled();
      remember(sheet);
    }
    progress(`Reading ${sheet.name} from Google Sheets…`);
    try {
      const loaded = saved ? await readSheet(sheet.id, token) : await readPicked(sheet, progress);
      remember({ id: sheet.id, name: loaded.name });
      return loaded;
    } catch (err) {
      // The dashboard has no access yet to a configured sheet on someone's first sign-in, and access to
      // a sheet picked earlier can lapse (another account, or the sheet was unshared). Picking it in
      // Google's file chooser grants it. If they close the chooser instead, say why it opened.
      if (!(err instanceof NoAccess) || !saved) throw err;
      forget();
      try {
        return await connect(progress, { choose: true });
      } catch (again) {
        throw again instanceof Cancelled ? err : again;
      }
    }
  }

  CN.google = { enabled, fixedSheet: Boolean(fixedSheet), init, connect, remembered, readSheet, Cancelled };
})(window.CashNow = window.CashNow || {});
