# Cash Now dashboard

A web version of the *Cash Now Test Strips – Executive Report* (Power BI). It runs entirely in the
browser, so it can be hosted for free on GitHub Pages with no server.

So far it has the **Pick Ups** page with its **Pick Up Detail** drill-through, the **Drivers** and
**Insights** pages, the **Mail Order** page with its **Mail Details** drill-through, and the
**Electronics**, **Vendors & Products** and **Demographics** pages. The other pages are listed in the
menu and come next.

## Your data stays out of this repository

This repository holds code only. The data lives in a Google Sheet that only the people it's shared
with can open. Each viewer signs in with Google, and their browser reads the sheet straight from
Google. The data never passes through any other server and isn't saved anywhere.

A workbook file (`Historical Raw Data.xlsx`) can still be opened instead. It's read inside the browser
and never uploaded. `.gitignore` blocks Excel, CSV and `.pbix` files so they can't be committed by
accident.

SheetJS and ECharts load from pinned versions, each checked against an integrity hash. Google's
sign-in and file chooser scripts come from Google and can't be pinned that way, because Google updates
them. They load only once Google sign-in is set up in `js/config.js`.

[`privacy.html`](privacy.html) is the privacy policy that Google's sign-in window links to.

## Using it

1. Open the site: https://jhoan-rivera-quiroga.github.io/cashnow-dashboard/
2. Click **Sign in with Google** and use the Google account the data sheet is shared with.
3. The first time, select the data sheet in Google's file chooser.

At the bottom of the page, **Refresh** loads the latest rows and **Sign out** clears the data from the
page. **Choose another sheet** appears when `js/config.js` doesn't name the sheet.

To use a file instead, choose **open a workbook file** on the start page, or drop the file on the page.

The page works like the Power BI one:

- **State**, **Date** and **Dynamic Date** (Daily / Weekly / Monthly) filter the page. **Range** has
  quick choices such as *Last 4 months* (the default) or *Year to date*, counted back from the
  latest date in the data.
- Clicking a point in either chart filters the cards to that day, week or month. Click it again, press
  Esc or use **Clear** to undo.
- **Details** lists the pick-ups behind the current view. Without a selected point it lists the whole
  date range. The table sorts by any column and downloads as CSV.
- The address bar keeps the filters, so a bookmark reopens the same view.

The **Drivers** page has its own date range, with the same choices. It shows the cash each driver
handed out, the total paid to drivers, and those payouts by driver, by category (Schedule, Commission,
Bonus, Shipping) and by type of bonus. Clicking a driver, a category or a type of bonus filters the
payout charts to it, as in Power BI. Click it again, press Esc or use **Clear** to undo. **Details**
lists the payout lines behind the total, for the date range and anything selected. The table sorts by
any column and downloads as CSV.

The **Insights** page also has its own date range. It shows the top 15 products by cash spent and by
units bought, the top 10 vendors, and the cash spent on each product category. Clicking a product, a
vendor or a category filters the other charts to it. **Details** lists the pick-ups behind the view in
the Pick Up Detail table.

The **Mail Order** page works like Pick Ups, for mail orders. It has Date, Range and Dynamic Date
(Weekly to start), the **Top Mail Vendor**, **Total Orders Completed** and **Total Cash Spent** cards,
and trend charts of cash spent and orders completed. Click a point to filter the cards. **Details**
opens **Mail Details**: the order lines behind the view, with their products and sales person.

The **Electronics** page lists the phones and tablets bought in its date range, with the date, seller,
model, quantity and amount paid, sortable and downloadable as CSV. Power BI's page is just that
table. This page adds the **Devices Bought**, **Total Paid** and **Average per Device** cards and a
**Paid by Model** chart, as the report's spec suggests. Clicking a model filters the cards and the
table.

The **Vendors & Products** page is the mail-order counterpart of Insights. It shows the top 10
vendors and top 10 products by mail cash spent. Clicking a vendor or a product filters the other
chart, and **Details** lists the order lines behind the view in the Mail Details table.

The **Demographics** page shows where the business comes from. It has two halves, each with its own
dates: pick-ups by state and by city (the top 15 cities, with the rest summed as "Other"), and mail
orders by state. Power BI's maps on this page don't draw, and its city pie has about 150 slices, so
this page uses bars with each one's share. Clicking a state or a city filters its half, and each
half's **Details** lists the pick-ups or mail orders behind it.

## Setting up Google sign-in

This is done once, in a Google Cloud project:

- Turn on the **Google Sheets API** and the **Google Picker API**.
- Set up the consent screen (**Google Auth Platform**) for **External** users and add the
  `https://www.googleapis.com/auth/drive.file` scope. That scope is non-sensitive, so Google doesn't
  need to review the app.
- On the **Branding** page, add `jhoan-rivera-quiroga.github.io` as an authorized domain, the
  dashboard's address as the home page and `privacy.html` as the privacy policy:
  `https://jhoan-rivera-quiroga.github.io/cashnow-dashboard/privacy.html`. Google won't publish the
  app without the home page and privacy policy. Don't upload a logo: a logo needs brand verification
  first. Without brand verification, Google's sign-in window shows the site's address instead of the
  app's name.
- Publish the app on the **Audience** page. Until then it's in Testing: only the test users listed
  there can sign in, and Google asks them for permission again every 7 days.
- Create an OAuth client of type **Web application** with these authorized JavaScript origins:
  `https://jhoan-rivera-quiroga.github.io` and `http://localhost:8000`.
- Create an API key. Restrict it to these websites: `https://jhoan-rivera-quiroga.github.io/*`,
  `https://docs.google.com/*` (Google's file chooser runs there) and `http://localhost:8000/*`.
  Restrict it to the Google Picker API.

Then put the client ID and the API key in `js/config.js`. Neither one is a secret: every browser that
opens the page can see them, and they only work from the addresses above.

`js/config.js` can also hold the sheet's ID, the part of its link between `/d/` and `/edit`. With it,
each person uses Google's file chooser only on their first sign-in, and every device after that goes
straight to the data. Without it, the chooser comes up once in every browser. The chooser may not open
in browsers that block third-party cookies, such as Safari on iPhone, so do that first sign-in on a
computer. The ID opens nothing for anyone the sheet isn't shared with.

To let someone in, share the Google Sheet with their Google account. **Viewer** access is enough.

The first time someone signs in, Google asks them to let the dashboard "see, edit, create and delete
only the specific Google Drive files you use with this app". That is Google's standard wording for the
`drive.file` permission. The dashboard can open only the sheet each person picks, and its code only
reads it.

## Running it on your computer

Any static file server works. With Python installed:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Google sign-in works there too, because the setup above allows that
address.

## How the numbers are calculated

The page reads the **Collection** sheet, using these columns: `Collection_Date`, `Collection_Order_No`,
`First_Name`, `City`, `State`, `Assign_to`, `Product_Code`, `Quantity` and `Comments` (`Comments`
holds the dollars paid), and `Category` when the sheet has it, for the Insights category chart. The
Drivers page also reads the **Driver Payouts** sheet: `Date`,
`Driver name`, `Payment Amount`, `Concept` and `Notes`. The Mail Order pages read the **Mail_Order**
sheet: `Delivery Date`, `Delivery Order (D.O.) No.`, `First Name`, `Product Code / Name`, `Quantity`,
`Total`, `Order Qty`, and `Sales Person` and `State` when they're there. The Electronics page reads the
**Electronics** sheet: `Collection Date`, `First Name`, `Marketing Name`, `Quantity` and `Comments`
(the amount paid). Without any of these three sheets, the other pages still work.
From Google Sheets the dashboard downloads only those columns. If a column is renamed, the page names
the missing one.

| Measure | Definition |
|---|---|
| Total Cash Spent | Sum of `Comments` |
| Total Pick ups | Count of distinct `Collection_Order_No` (the order number in Power BI's Pick Up Detail table) |
| Avrg Pick up | Cash spent ÷ pick-ups |
| Top Product / Driver / Vendor | Highest cash spent in the current view |
| Total Driver Payouts | Sum of `Payment Amount` on the Driver Payouts sheet |
| Total Cash Spent (mail) | Sum of `Total` on the Mail_Order sheet (each product line's dollars) |
| Total Orders Completed | Sum of `Order Qty`, which the sheet keeps on a row of its own for each day |
| Top Mail Vendor | `First Name` with the most mail cash spent in the current view |
| Total Paid (electronics) | Sum of `Comments` on the Electronics sheet; Devices Bought is the sum of `Quantity` |

Cleaning rules:

- Dates may be real dates or text such as `2026-03-11`.
- Names that differ only in capital letters or extra spaces count as one (`PAUL` and `Paul`), and each
  is shown with the spelling that appears first in the sheet, as in Power BI. One difference: Power BI
  ignores spaces only at the end of a name, so it keeps `" Cincinnati"`, with a space in front, apart
  from `Cincinnati` ($47 of pick-ups in January to April 2026).
- Amounts typed as text with a decimal comma (`77,5`) are read as 77.5. Power BI reads them as 775,
  which puts its February 2026 total $702 higher. **Data notes** at the bottom of the page lists
  every such cell.
- **Top 15 Products By Units Bought** ranks products by units. Power BI's chart picks the top 15
  products by cash and then sorts them by units, so it leaves out products with many low-priced units,
  such as Dollar Stamp and Meters.
- **Mail Details** lists each order line's `Total`, so it adds up to the Mail Order page's cash. Power
  BI's table adds up `Payment Amount`, which repeats the whole order's payment on each of its lines, so
  its total for December 2025 is $11,183 against $5,922 actually paid.
- The Electronics table shows each sale's date. Power BI's table shows only the year, which merges a
  seller's sales of the same model within a year into one row.

## Next steps

- The remaining pages: Cancelled and Call Report.

## Built with

[SheetJS](https://sheetjs.com) 0.20.3 reads workbook files and [Apache ECharts](https://echarts.apache.org)
5.6.0 draws the charts. Google Identity Services handles sign-in, the Google Picker chooses the sheet,
and the Google Sheets API reads it. Everything else is plain HTML, CSS and JavaScript, with no build step.
