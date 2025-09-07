module.exports = {
  nodes: [
    require('./dist/nodes/Famulor/Famulor.node.js'),
    require('./dist/nodes/Famulor/FamulorTrigger.node.js')
  ],
  credentials: [
    require('./dist/credentials/FamulorApi.credentials.js')
  ],
};
