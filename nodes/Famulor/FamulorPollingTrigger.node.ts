import { NodeConnectionTypes } from './connections';
import type { INodeType, INodeTypeDescription, IPollFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pollingDefinitions } from './polling/definitions';
import { poll } from './polling/engine';

export class FamulorPollingTrigger implements INodeType {
  description:INodeTypeDescription={
    displayName:'Famulor Polling Trigger',name:'famulorPollingTrigger',icon:'file:famulor.svg',group:['trigger'],version:1,
    subtitle:'={{$parameter["event"]}}',description:'Start workflows on Famulor calls, contacts, campaigns and workspace activity',defaults:{name:'Famulor Polling Trigger'},
    inputs:[],outputs:[NodeConnectionTypes.Main],polling:true,credentials:[{name:'famulorApi',required:true}],
    properties:[
      {displayName:'Event',name:'event',type:'options',noDataExpression:true,required:true,default:'',options:pollingDefinitions.map(definition=>({name:definition.displayName,value:definition.name,description:definition.description}))},
      {displayName:'Campaign ID',name:'campaignId',type:'string',default:'',required:true,displayOptions:{show:{event:pollingDefinitions.filter(definition=>definition.campaign).map(definition=>definition.name)}},description:'UUID of the campaign to watch'},
      {displayName:'Activation skips existing events. Manual tests return recent samples without changing polling state. Snapshot events report the first observed occurrence per resource, so transitions between polls can be missed.',name:'pollNotice',type:'notice',default:''},
    ],
  };
  async poll(this:IPollFunctions):Promise<INodeExecutionData[][]|null>{
    try {
      const id=this.getNodeParameter('event') as string;
      const definition=pollingDefinitions.find(definition=>definition.name===id);
      if(!definition) throw new NodeOperationError(this.getNode(),'Select a valid Famulor event.');
      return await poll(this,definition,this.getNodeParameter('campaignId','') as string);
    } catch(error:unknown) { throw new NodeOperationError(this.getNode(),error instanceof Error?error.message:'Famulor polling failed.'); }
  }
}
