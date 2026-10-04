import { NodeConnectionTypes as WorkflowConnectionTypes } from 'n8n-workflow';

// Older n8n hosts expose the same connection values without this newer export.
export const NodeConnectionTypes = WorkflowConnectionTypes ?? { Main: 'main' as const };
