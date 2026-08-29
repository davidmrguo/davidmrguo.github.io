---
title: "Sample Prompt: AI Team Vacation Assistant with Excel"
description: "A scheduled task in ChatGPT to help people managers stay in the loop on team vacations."
pubDate: 2026-08-22
tags: ["AI Automation", "Microsoft Excel", "SharePoint"]
---

Every weekday morning, open the Team Vacation Tracker.xlsx workbook at <SHAREPOINT_LINK> using the connected Microsoft SharePoint/OneDrive source.

Treat each team member's vacation-plan tab as that person's entries, and use the Holiday Schedule tab for holiday dates.

Compare the workbook with the snapshot from the previous scheduled run and maintain enough prior-run state to avoid duplicate alerts. Report only meaningful items in these categories:

1. New vacation rows added since the previous scheduled check, naming the person and dates/type;
2. For every Extended Leave, alert exactly one week before the leave starts and exactly one week before the person's return date; if the exact one-week prior falls on a weekend or holiday, alert on the nearest business day before;
3. Whenever a newly added entry makes that person's current-calendar-year total PTO exceed 21 days, alert with the new combined total; count calendar days inclusively unless the workbook provides a different explicit convention;
4. If a person has gone more than 90 days without taking any vacation, alert only when they first cross 90 days and then at each next 30-day increment (120, 150, 180, etc.), not every day; base this on the end date of their most recent completed PTO or Extended Leave, and do not alert before there is enough historical data to establish a prior vacation date;
5. For each newly added entry, check nearby upcoming federal holidays and alert if that entry causes 60% or more of the team to be out of office on any relevant date around the holiday, identifying the holiday/date and who is out. For holiday-adjacent coverage, evaluate the holiday itself plus the immediately preceding and following business day.

If nothing meaningful is triggered, do not send any status update on that day. Do not modify the workbook.