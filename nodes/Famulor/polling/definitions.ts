export type PollDefinition = { name: string; displayName: string; description: string; path: string; timeField?: string; query?: Record<string, string>; completed?: boolean; campaign?: boolean; snapshot?: boolean; messaging?: boolean; once?: boolean; ordered?: boolean; unpaged?: boolean; dataKey?: string };

export const pollingDefinitions: PollDefinition[] = [
  {
    "name": "bookingCancelled",
    "displayName": "Booking Cancelled",
    "description": "Triggers the first time a booking appears cancelled after enabling the flow. Existing cancellations are skipped.",
    "path": "/bookings",
    "query": {
      "status": "cancelled"
    },
    "snapshot": true,
    "once": true
  },
  {
    "name": "bookingCompleted",
    "displayName": "Booking Completed",
    "description": "Triggers the first time a booking appears completed after enabling the flow.",
    "path": "/bookings",
    "query": {
      "status": "completed"
    },
    "snapshot": true,
    "once": true
  },
  {
    "name": "callFailed",
    "displayName": "Call Failed",
    "description": "Triggers once when a call is found in failed status after enabling the flow.",
    "path": "/calls",
    "timeField": "updated_at",
    "query": {
      "status": "failed",
      "sort": "updated_at"
    },
    "once": true
  },
  {
    "name": "callNotAnswered",
    "displayName": "Call Not Answered",
    "description": "Triggers once when a call reaches no-answer status after enabling the flow.",
    "path": "/calls",
    "timeField": "updated_at",
    "query": {
      "status": "no_answer",
      "sort": "updated_at"
    },
    "once": true
  },
  {
    "name": "callbackCompleted",
    "displayName": "Callback Completed",
    "description": "Triggers the first time a scheduled callback appears completed after enabling the flow.",
    "path": "/scheduled-callbacks",
    "query": {
      "status": "completed"
    },
    "snapshot": true,
    "once": true
  },
  {
    "name": "campaignCompleted",
    "displayName": "Campaign Completed",
    "description": "Triggers the first time a campaign appears completed after the flow is enabled. Existing completed campaigns are skipped.",
    "path": "/campaigns",
    "query": {
      "status": "completed"
    },
    "snapshot": true,
    "once": true
  },
  {
    "name": "campaignLeadCompleted",
    "displayName": "Campaign Lead Completed",
    "description": "Triggers the first time a lead appears completed in the selected campaign after enabling the flow.",
    "path": "/campaigns",
    "query": {
      "status": "completed"
    },
    "campaign": true,
    "once": true
  },
  {
    "name": "campaignPaused",
    "displayName": "Campaign Paused",
    "description": "Triggers the first time a campaign appears paused after the flow is enabled. Existing paused campaigns are skipped.",
    "path": "/campaigns",
    "query": {
      "status": "paused"
    },
    "snapshot": true,
    "once": true
  },
  {
    "name": "campaignStarted",
    "displayName": "Campaign Started",
    "description": "Triggers the first time a campaign appears running after the flow is enabled. Existing running campaigns are skipped.",
    "path": "/campaigns",
    "query": {
      "status": "running"
    },
    "snapshot": true,
    "once": true
  },
  {
    "name": "conversationEnded",
    "displayName": "Conversation Completed",
    "description": "Triggers once when a messaging or email conversation first appears completed after enabling the flow. Existing completed conversations are skipped.",
    "path": "/history",
    "timeField": "last_activity_at",
    "query": {
      "status": "completed"
    },
    "snapshot": true,
    "messaging": true,
    "once": true
  },
  {
    "name": "getAssistants",
    "displayName": "New Assistant",
    "description": "Triggers when an assistant is created in the workspace.",
    "path": "/assistants",
    "timeField": "created_at"
  },
  {
    "name": "newAutomation",
    "displayName": "New Automation",
    "description": "Triggers when an automation first appears after enabling the flow.",
    "path": "/automations",
    "dataKey": "automations",
    "snapshot": true,
    "once": true,
    "unpaged": true
  },
  {
    "name": "newBooking",
    "displayName": "New Booking",
    "description": "Triggers when a booking first appears after the flow is enabled. Reads all pages because bookings are sorted by appointment time.",
    "path": "/bookings",
    "snapshot": true,
    "once": true
  },
  {
    "name": "newBookingEventType",
    "displayName": "New Booking Event Type",
    "description": "Triggers when a booking event type first appears after enabling the flow.",
    "path": "/booking-event-types",
    "snapshot": true,
    "once": true,
    "unpaged": true
  },
  {
    "name": "newCall",
    "displayName": "New Call",
    "description": "Triggers when a new call is created in the workspace.",
    "path": "/calls",
    "timeField": "created_at"
  },
  {
    "name": "newCampaign",
    "displayName": "New Campaign",
    "description": "Triggers when a campaign is created in the workspace.",
    "path": "/campaigns",
    "timeField": "created_at"
  },
  {
    "name": "newCampaignLead",
    "displayName": "New Campaign Lead",
    "description": "Triggers the first time a lead is added to the selected campaign after enabling the flow, including existing contacts.",
    "path": "/campaigns",
    "campaign": true,
    "once": true
  },
  {
    "name": "newContact",
    "displayName": "New Contact",
    "description": "Triggers when a new Audience contact is created in the workspace.",
    "path": "/leads",
    "timeField": "created_at"
  },
  {
    "name": "newHistoryActivity",
    "displayName": "New Conversation Activity",
    "description": "Triggers for new activity in the unified conversation history. A conversation can emit again when its last activity changes.",
    "path": "/history",
    "timeField": "last_activity_at"
  },
  {
    "name": "newEmailActivity",
    "displayName": "New Email Activity",
    "description": "Triggers when an email thread has new activity in the unified conversation history.",
    "path": "/history",
    "timeField": "last_activity_at",
    "query": {
      "type": "email"
    }
  },
  {
    "name": "inboundCall",
    "displayName": "New Inbound Call",
    "description": "Triggers when a new inbound call is created. This event does not provide synchronous caller-variable enrichment.",
    "path": "/calls",
    "timeField": "created_at",
    "query": {
      "direction": "inbound"
    }
  },
  {
    "name": "newKnowledgeBase",
    "displayName": "New Knowledge Base",
    "description": "Triggers when a knowledge base is created.",
    "path": "/knowledge-bases",
    "timeField": "created_at"
  },
  {
    "name": "newMission",
    "displayName": "New Mission",
    "description": "Triggers when a Milian mission first appears after enabling the flow.",
    "path": "/routines",
    "snapshot": true,
    "once": true,
    "unpaged": true
  },
  {
    "name": "newOutboundCall",
    "displayName": "New Outbound Call",
    "description": "Triggers when an outbound call is created.",
    "path": "/calls",
    "timeField": "created_at",
    "query": {
      "direction": "outbound"
    }
  },
  {
    "name": "newPhoneNumber",
    "displayName": "New Phone Number",
    "description": "Triggers when a phone number is added to the workspace.",
    "path": "/phone-numbers",
    "timeField": "created_at"
  },
  {
    "name": "newScheduledCallback",
    "displayName": "New Scheduled Callback",
    "description": "Triggers when a scheduled callback first appears after enabling the flow.",
    "path": "/scheduled-callbacks",
    "snapshot": true,
    "once": true
  },
  {
    "name": "newSegment",
    "displayName": "New Segment",
    "description": "Triggers when an Audience segment is created.",
    "path": "/segments",
    "timeField": "created_at"
  },
  {
    "name": "newSuppressionEntry",
    "displayName": "New Suppression Entry",
    "description": "Triggers when a suppression entry first appears after enabling the flow.",
    "path": "/suppression-list",
    "snapshot": true,
    "once": true
  },
  {
    "name": "newTool",
    "displayName": "New Tool",
    "description": "Triggers when a reusable tool first appears after enabling the flow.",
    "path": "/tools",
    "snapshot": true,
    "once": true,
    "unpaged": true
  },
  {
    "name": "newWebCall",
    "displayName": "New Web Call",
    "description": "Triggers when a browser call is created.",
    "path": "/calls",
    "timeField": "created_at",
    "query": {
      "direction": "web"
    }
  },
  {
    "name": "newWhatsAppActivity",
    "displayName": "New WhatsApp Activity",
    "description": "Triggers when a WhatsApp conversation has new activity.",
    "path": "/history",
    "timeField": "last_activity_at",
    "query": {
      "type": "whatsapp"
    }
  },
  {
    "name": "phoneCallEnded",
    "displayName": "Phone Call Completed",
    "description": "Triggers once when a call completes after the flow is enabled. Polls updated calls so calls created earlier can still finish later.",
    "path": "/calls",
    "timeField": "updated_at",
    "query": {
      "status": "completed",
      "sort": "updated_at"
    },
    "completed": true,
    "once": true
  }
];
