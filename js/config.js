/* Settings for reading the data from Google Sheets. Leave them empty to open workbook files only.
   None of these values is a secret: Google shows the first two to every browser that opens the page,
   and they only work from the web addresses allowed in the dashboard's Google Cloud project. The sheet
   ID opens the sheet only for the people it's shared with, or for anyone once it's shared with
   "Anyone with the link". */
(function (CN) {
  'use strict';
  CN.config = {
    google: {
      // OAuth client ID (Google Auth Platform > Clients)
      clientId: '304732318242-8lacu0grsup8kdtr1cojn7fe41egl7qr.apps.googleusercontent.com',
      // API key, restricted to the Google Picker API (the file chooser) and the Google Sheets API
      // (reading a sheet shared with "Anyone with the link" without sign-in)
      apiKey: 'AIzaSyAIDzfIrf2bETNVRKZZtOqHVxkCH-uYwGY',
      // Optional: the ID in the sheet's link (docs.google.com/spreadsheets/d/<ID>/edit). When the sheet
      // is shared with "Anyone with the link", the dashboard opens it without sign-in. Otherwise each
      // person uses Google's file chooser only on their first sign-in, on any device; without an ID,
      // once in every browser. The chooser may not open in browsers that block third-party cookies.
      sheetId: '1jtcutR3VvHduKInW9tsJcC-ASfQEj_kCGYQIhHv-cuA',
    },
  };
})(window.CashNow = window.CashNow || {});
