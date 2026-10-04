import type { INodeTypeBaseDescription } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';
import { FamulorV2 } from './v2/FamulorV2.node';
import { FamulorV3 } from './v3/FamulorV3.node';

export class Famulor extends VersionedNodeType {
  constructor() {
    const description: INodeTypeBaseDescription = { displayName:'Famulor', name:'famulor', icon:'file:famulor.svg', group:['transform'], description:'Automate your Famulor workspace', defaultVersion:3 };
    super({2:new FamulorV2(),3:new FamulorV3()},description);
  }
}
