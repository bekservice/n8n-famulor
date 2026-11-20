# Review unsuccessful WhatsApp conversations in a daily Freshdesk triage ticket

## Who is this for?
Support teams reviewing unsuccessful WhatsApp conversations without copying message content into a helpdesk.

## How it works
Reads the previous UTC day from unified History with WhatsApp, completed and unsuccessful-analysis filters. Validates pagination, then prepares one bounded Freshdesk ticket. Empty results stop. Preview starts enabled. This adapts our own call-triage approach to message activity windows and conversation references.

## Setup
Select an existing Famulor HTTP Header Auth credential with calls:read and Freshdesk credentials. Enter an existing requester ID in Configure workflow. Run the preview, review counts and references, then test the exact export in your designated Freshdesk test area before setting previewOnly to false.

## Limits
2,000 rows per scan, 50 ticket references, UTC boundaries. Late analysis can miss the selected window. Re-running a window can create another ticket. No contact, message body or summary is copied. Check Freshdesk notifications before enabling the schedule.
