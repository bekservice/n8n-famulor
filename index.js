module.exports = {
  nodes: [
    require('./dist/nodes/Famulor/Famulor.node.js'),
    require('./dist/nodes/Famulor/FamulorTrigger.node.js'),
    require('./dist/nodes/Famulor/FamulorPollingTrigger.node.js')
  ],
  credentials: [
    require('./dist/credentials/FamulorApi.credentials.js'),
    require('./dist/credentials/FamulorWebhookApi.credentials.js')
  ],
};
