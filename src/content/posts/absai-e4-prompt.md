---
title: "Sample Prompt: AI Personal Spending Tracker with Google Sheets"
description: "A scheduled task in ChatGPT to keep personal spending in check."
pubDate: 2026-08-21
tags: ["AI Automation", "Google Sheets"]
---

Review my Google Sheet “Flexible Spending Budget” at <GOOGLE_SHEETS_LINK>.

Use the Transactions tab as the ledger and the Summary tab for Year / Budget / Actual.

Report spending from January 1 through the last day of the previous month:
- YTD actual
- annual budget
- percent of annual budget used
- comparison with the portion of the year elapsed

Give a concise category-level explanation of spending drivers; highlight unusually large purchases, meaningful refunds/offsets, and useful major changes versus prior years.

Estimate full-year spending from YTD pace and clearly flag an over-budget trajectory; otherwise say spending is reasonably on track without manufacturing a warning.

Treat large exceptional expenses such as professional/legal services separately when they materially distort the underlying discretionary trend.

Keep the analysis conversational and do not add dashboards or permanent summaries to the workbook.