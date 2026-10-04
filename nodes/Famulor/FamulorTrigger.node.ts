import type { INodeTypeBaseDescription } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';
import { FamulorTriggerV2 } from './v2/FamulorTriggerV2.node';
import { FamulorTriggerV3 } from './v3/FamulorTriggerV3.node';

export class FamulorTrigger extends VersionedNodeType {
  constructor(){
    const description:INodeTypeBaseDescription={displayName:'Famulor Trigger',name:'famulorTrigger',icon:'file:famulor.svg',group:['trigger'],description:'Receive signed Famulor events',defaultVersion:3};
    super({2:new FamulorTriggerV2(),3:new FamulorTriggerV3()},description);
  }
}
