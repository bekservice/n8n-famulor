# Queue failed or overdue native Famulor email replies as HubSpot tasks

## Who is this for?
Support teams using native Famulor email and HubSpot who want a review queue for failed or overdue replies.

## How it works
Scans native email History with previous UTC-day activity, validates complete pagination and selects failed replies or pending replies older than pendingMinutes. Stops before any write if maxTasks is exceeded. Each task contains only conversation/record references, state and activity time. Preview is on by default.

## Setup
Select Famulor HTTP Header Auth with calls:read and HubSpot Service Key credentials with task creation access. Review pendingMinutes/maxTasks in Configure workflow, run the preview and test the exact export in your HubSpot test area before disabling previewOnly. Tasks are unassociated with contacts by default; configure ownership or associations deliberately if needed.

## Limits
Native email only; Gmail/Outlook connector threads have different reply-state semantics. Previous-day activity is a bounded review window, not a historic backlog monitor. 2,000 scanned rows and at most 100 tasks, with a default cap of 20. Re-running a window can create duplicate tasks. No email send, contact creation, subject/body or raw error export.
