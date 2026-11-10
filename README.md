# Cash Now dashboard

A web version of the *Cash Now Test Strips – Executive Report* (Power BI). It runs entirely in the
browser, so it can be hosted for free on GitHub Pages with no server.

It has every page of the Power BI report: **Pick Ups** with its **Pick Up Detail** drill-through,
**Drivers**, **Insights**, **Mail Order** with its **Mail Details** drill-through, **Electronics**,
**Vendors & Products**, **Demographics**, **Cancelled** and **Call Report**.

## Your data stays out of this repository

This repository holds code only. The data lives in a Google Sheet, and each viewer's browser reads it
straight from Google. It never passes through any other server and isn't saved anywhere.

When the sheet is shared with **Anyone with the link**, the dashboard opens it without sign-in, so
anyone who opens the dashboard sees the data. The sheet's ID is in `js/config.js`, in this public
repository, so anyone who reads the code can open the sheet too. With the sheet's General access set
to **Restricted** instead, the dashboard asks each viewer to sign in with Google, and only the accounts
the sheet is shared with can see the data.

A workbook file (`Historical Raw Data.xlsx`) can still be opened instead. It's read inside the browser
and never uploaded. `.gitignore` blocks Excel, CSV and `.pbix` files so they can't be committed by
accident.

SheetJS and ECharts load from pinned versions, each checked against an integrity hash. Google's
sign-in and file chooser scripts come from Google and can't be pinned that way, because Google updates
them. They load only once Google sign-in is set up in `js/config.js`.

[`privacy.html`](privacy.html) is the privacy policy that Google's sign-in window links to.

## Using it

Open the site: https://jhoan-rivera-quiroga.github.io/cashnow-dashboard/. When the sheet is shared
with Anyone with the link, the data loads right away. Otherwise:

1. Click **Sign in with Google** and use the Google account the data sheet is shared with.
2. The first time, select the data sheet in Google's file chooser.

At the bottom of the page, **Refresh** loads the latest rows. After a sign-in, **Sign out** clears the
data from the page, and **Choose another sheet** appears when `js/config.js` doesn't name the sheet.

To use a file instead, choose **open a workbook file** on the start page, or drop the file on the page.

The page works like the Power BI one:

- The page opens with no dates and says "Select a date to see data". Pick a start or an end date (one
  is enough: the other end is the first or last day in the data), or a **Range** choice such as
  *Last 4 months* or *Year to date*, counted back from the latest date in the data. **State** and
  **Dynamic Date** (Daily / Weekly / Monthly) filter the page too.
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
dates: pie charts of pick-ups by state and by city, and of mail orders by state. Each pie shows the
seven largest states or cities and sums the rest as "Other", and its legend gives each slice's cash.
Power BI's maps on this page don't draw, and its city pie has about 150 slices. Clicking a state or a
city filters its half, and each half's **Details** lists the pick-ups or mail orders behind it.

The **Cancelled** page lists the cancelled pick-ups in its date range, why they were cancelled, and
whether someone followed up. Power BI's page has the **Total Cancelled Pick Ups** card and a table.
This page adds the **Excluding Duplicates & Tests** card (about a fifth of the rows are duplicate
entries) and the **Follow Up Rate** card, and charts of the reasons and of the follow-up status, as
the report's spec suggests. Clicking a reason or a status filters the cards, the other chart and the
table. The table shows each seller's name and phone number in separate columns, sorts by any column
and downloads as CSV.

The **Call Report** page shows the phone calls of each day, with Date, Range and Dynamic Date (Weekly
to start). Power BI's page has the **Total Calls**, **Total Inbound**, **Total Outbound**,
**Answered** and **Missed** cards and a trend of total calls. This page adds the **Answer Rate** card
(the share of inbound calls answered), the average calls a day on the Total Calls card, a trend of the
answer rate, the average calls on each weekday, and a table of the days that sorts by any column and
downloads as CSV, as the report's spec suggests. Clicking a point in either trend filters the cards,
the weekday chart and the table to that day, week or month. Clicking a weekday filters the cards, the
trends and the table to it.

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
  Restrict it to the Google Picker API, and also to the Google Sheets API for opening without sign-in
  (below).

Then put the client ID and the API key in `js/config.js`. Neither one is a secret: every browser that
opens the page can see them, and they only work from the addresses above.

`js/config.js` can also hold the sheet's ID, the part of its link between `/d/` and `/edit`. With it,
each person uses Google's file chooser only on their first sign-in, and every device after that goes
straight to the data. Without it, the chooser comes up once in every browser. The chooser may not open
in browsers that block third-party cookies, such as Safari on iPhone, so do that first sign-in on a
computer. The ID opens nothing for anyone the sheet isn't shared with.

To let someone in, share the Google Sheet with their Google account. **Viewer** access is enough.

To let anyone with the dashboard's address see the data without signing in:

- In Google Sheets, choose **Share** and set General access to **Anyone with the link**, as **Viewer**.
- In Google Cloud, under **APIs & Services**, **Credentials**, open the API key and add the
  **Google Sheets API** to its API restrictions, next to the Google Picker API.
- Keep the sheet's ID in `js/config.js`.

The dashboard then reads the sheet with the API key as soon as it opens. When Google refuses that
(the sheet is Restricted again, or the key may not read Google Sheets), it offers **Sign in with
Google** instead.

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
(the amount paid). The Cancelled page reads the **Return** sheet: `Collection Date`, `First Name`,
`Reason and Follow up Steps`, `Follow Up Status`, and `Customer's Phone No.` when it's there. The
Call Report page reads the **Comunication_Table** sheet, which has one row per day: `Date`,
`Total Calls`, `Total Inbound`, `Total Outbound`, `Answered` and `Missed`. Without any of these
sheets, the other pages still work.
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
| Total Cancelled Pick Ups | Count of the Return sheet's rows with a `Collection Date` in the range, as in Power BI |
| Excluding Duplicates & Tests | Total Cancelled Pick Ups minus the reasons in the Duplicate and Test or training groups |
| Follow Up Rate | Follow Up Done ÷ the cancellations that needed a follow-up (every status but No Need for Follow Up). A blank status counts as not followed up |
| Total Calls, Total Inbound, Total Outbound, Answered, Missed | Sums of the Comunication_Table columns of the same names, as in Power BI |
| Answer Rate | Answered ÷ Total Inbound (Answered and Missed count inbound calls) |
| Calls by Weekday | The calls on each weekday in the date range ÷ the number of those weekdays in the sheet |

The Return sheet's reasons are typed freely, in hundreds of spellings, so the Cancelled page's chart
groups them by their words. Each reason goes in the first group it matches, and the table shows it as
typed:

| Group | A reason that has… |
|---|---|
| Duplicate | "dup" (duplicate, duplicated) |
| Test or training | only "test" or "testing", "test" at the end, or "training" |
| No show or no answer | no show, no answer, not answering, not responding, unresponsive, didn't show, couldn't reach, voicemail |
| Sold elsewhere | sold, competitor, another company |
| Price not accepted | price, pricing, too low, low value |
| Item problems | damaged, broken, seal, opened, expired, invalid, wrong item or box, short dated, stained, dinged, bad box, "don't take" |
| No items yet | no items or supplies, not ready, not available, when ready |
| Customer cancelled | cancel (any spelling), cax, changed their mind |
| Rescheduled | reschedule, later, another day, next day or week, postponed |
| Not confirmed | confirm |
| Mail instead | mail, ship |

A reason that's only a time slot or the booking form's wording ("Scheduled time: 5:30 - 6:30 pm",
"Local pickup - same-day …") is **Time slot, no reason**, an empty one is **(Blank)**, and the rest
are **Other**. The follow-up statuses typed different ways count as one: **Follow Up Done** (done or
completed), **No Need for Follow Up** (starting with "no" and saying "need"), **Follow Up Pending** and
**Couldn't Contact**. Any other status is shown as typed. The rules are at the top of
`js/cancelled.js`.

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
- On the Return sheet, `First Name` holds the seller's name and phone number together. The Cancelled
  table shows them in two columns, with the phone from `Customer's Phone No.` when it's filled in and
  from `First Name` otherwise. Power BI's table shows `First Name` as typed and the statuses as typed,
  sorted by reason; this table adds the date and starts sorted by it.
- A time typed as a reason (the sheet turns "1:00 PM" into a time value) is shown as a time.
- The Comunication_Table sheet has one row per day with that day's counts, not one row per call, so
  calls can't be broken down by hour. It starts on May 1, 2025, so Power BI's default dates (January 1
  to May 31, 2025) cover only May 2025: 6,417 calls, as this page shows for the same dates.
- Days missing from the sheet, such as holidays and the Sundays of spring 2026, are left out of the
  call trends and the weekday averages rather than counted as zero, as in Power BI.
- One day's call counts don't add up: on May 20, 2026, Answered + Missed is 163 against 164 inbound
  calls. The cards add up each column as typed, as Power BI does, and **Data notes** lists any such day.
- Power BI's Dynamic Date on the Call Report also lists All, which shows the same daily chart. The
  sheet's `SL` column isn't used, here or in Power BI.

## Next steps

Every page of the Power BI report is built. A possible addition: a map of the US states on the
Demographics page, which needs a public outline of the states.

## Built with

[SheetJS](https://sheetjs.com) 0.20.3 reads workbook files and [Apache ECharts](https://echarts.apache.org)
5.6.0 draws the charts. Google Identity Services handles sign-in, the Google Picker chooses the sheet,
and the Google Sheets API reads it. Everything else is plain HTML, CSS and JavaScript, with no build step.
