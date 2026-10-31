# Cash Now dashboard

A web version of the *Cash Now Test Strips – Executive Report* (Power BI). It runs entirely in the
browser, so it can be hosted for free on GitHub Pages with no server.

So far it has the **Pick Ups** page and its **Pick Up Detail** drill-through. The other pages are listed
in the menu and come next.

## Your data stays out of this repository

This repository holds code only. The workbook (`Historical Raw Data.xlsx`) is opened inside the
viewer's browser and is never uploaded anywhere or committed here. `.gitignore` blocks Excel, CSV
and `.pbix` files so they can't be committed by accident.

The page makes no network requests except to load two pinned libraries, and each one is checked against
an integrity hash.

## Using it

1. Open the site: https://jhoan-rivera-quiroga.github.io/cashnow-dashboard/
2. Click **Open workbook** (or drop the file on the page) and choose `Historical Raw Data.xlsx`.

The page works like the Power BI one:

- **State**, **Date** and **Dynamic Date** (Daily / Weekly / Monthly) filter the page. **Range** has
  quick choices such as *Last 4 months* (the default) or *Year to date*, counted back from the
  latest date in the file.
- Clicking a point in either chart filters the cards to that day, week or month. Click it again, press
  Esc or use **Clear** to undo.
- **Details** lists the pick-ups behind the current view. Without a selected point it lists the whole
  date range. The table sorts by any column and downloads as CSV.
- The address bar keeps the filters, so a bookmark reopens the same view.

## Running it on your computer

Any static file server works. With Python installed:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## How the numbers are calculated

The page reads the **Collection** sheet, using these columns: `Collection_Date`, `Collection_Order_No`,
`First_Name`, `City`, `State`, `Assign_to`, `Product_Code`, `Quantity` and `Comments` (`Comments`
holds the dollars paid). If a column is renamed, the page names the missing one.

| Measure | Definition |
|---|---|
| Total Cash Spent | Sum of `Comments` |
| Total Pick ups | Count of distinct `Collection_Order_No` (the order number in Power BI's Pick Up Detail table) |
| Avrg Pick up | Cash spent ÷ pick-ups |
| Top Product / Driver / Vendor | Highest cash spent in the current view |

Cleaning rules:

- Dates may be real Excel dates or text such as `2026-03-11`.
- Names that differ only in capital letters or extra spaces count as one (`PAUL` and `Paul`), and each
  is shown with the spelling that appears first in the sheet, both as in Power BI.
- Amounts typed as text with a decimal comma (`77,5`) are read as 77.5. Power BI reads them as 775,
  which puts its February 2026 total $702 higher. **Data notes** at the bottom of the page lists
  every such cell.

## Next steps

- Microsoft sign-in, so the page reads the workbook straight from SharePoint and needs no file picking.
- The remaining pages: Drivers, Insights, Mail Order, Electronics, Vendors & Products, Demographics,
  Cancelled, Call Report and Mail Details.

## Built with

[SheetJS](https://sheetjs.com) 0.20.3 reads the workbook and [Apache ECharts](https://echarts.apache.org)
5.6.0 draws the charts. Everything else is plain HTML, CSS and JavaScript, with no build step.
