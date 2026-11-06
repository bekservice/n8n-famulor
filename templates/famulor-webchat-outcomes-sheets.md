# Track weekly completed web chat outcomes by assistant in Google Sheets

## Who is this for?
Support and CRM operations teams measuring completed web text chat workload and reviewing unsuccessful outcomes by assistant.

## How it works
Monday schedule scans the preceding seven UTC days twice: all completed live_chat records, then the unsuccessful-analysis subset. It validates pagination and subset consistency, aggregates counts and averages over available durations, and prepares one report row per assistant. Preview starts enabled.

## Setup
Select Famulor HTTP Header Auth with calls:read in both read nodes. Create a Google Sheet with these exact headers: Report key, Window start, Window end, Assistant ID, Completed chats, Unsuccessful chats, Measured chats, Average seconds. Select the document/tab and match on Report key. Run previews, then test the exact export in a designated sheet before disabling previewOnly.

## Limits
2,000 rows per scan, UTC boundaries and available analysis. This is not a conversion-rate metric or a complete chat-message stream. Missing durations are excluded from averages. A conversation changing between scans stops the report if subset consistency fails. Re-running the same week updates the same Report key; avoid concurrent runs and duplicate keys. No contact details, text or transcript is exported.
