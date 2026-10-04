import { NodeConnectionTypes } from '../connections';
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { operations } from './generated/catalog';
import { nativeProperties, operationProperties } from './properties';
import { famulorV3Api } from './client';
import { resourceSearchMethods } from './resources';

export class FamulorV3 implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Famulor', name: 'famulor', icon: 'file:famulor.svg', group: ['transform'], version: 3,
    subtitle: '={{$parameter["operation"]}}', description: 'Use every public Famulor workspace API operation', defaults: {name: 'Famulor'},
    usableAsTool: true, inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    credentials: [{name:'famulorApi',required:true}], properties: nativeProperties(),
  };

  methods={listSearch:resourceSearchMethods};

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const result: INodeExecutionData[] = [];
    const items = this.getInputData();
    for (let index=0; index<items.length; index++) {
      try {
        const id = this.getNodeParameter('operation',index) as string;
        const resource = this.getNodeParameter('resource',index) as string;
        const operation = operations.find(operation => operation.id === id && operation.tag === resource);
        if (!operation) throw new NodeOperationError(this.getNode(),'Select a valid Famulor resource and operation.');
        const optional = this.getNodeParameter('optionalFields',index,{}) as Record<string,unknown>;
        const values: Record<string,unknown> = {...optional};
        for (const property of operationProperties(operation)) {
          if (property.name !== 'optionalFields') values[property.name] = this.getNodeParameter(property.name,index,property.default);
        }
        const request = famulorV3Api.buildRequest({operation,values});
        const response = await famulorV3Api.request(this,{...request,method: operation.method as 'GET'|'POST'|'PATCH'|'PUT'|'DELETE',binary:operation.binary});
        if (operation.binary) {
          if (!famulorV3Api.isRecord(response) || !Buffer.isBuffer(response.body)) throw new NodeOperationError(this.getNode(),'Famulor returned invalid audio data.');
          const headers=famulorV3Api.isRecord(response.headers)?response.headers:{};
          const contentType=Object.entries(headers).find(([key])=>key.toLowerCase()==='content-type')?.[1];
          const mime=typeof contentType==='string'&&contentType.startsWith('audio/')?contentType.split(';')[0]:operation.binaryContentType??'audio/wav';
          const extension=({ 'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg','audio/webm':'webm','audio/flac':'flac' } as Record<string,string>)[mime]??'audio';
          result.push({json:{operation:id},binary:{data:await this.helpers.prepareBinaryData(response.body,`audio.${extension}`,mime)},pairedItem:{item:index}});
        } else {
          const data = famulorV3Api.isRecord(response) && Object.hasOwn(response,'data') ? response.data : response;
          for (const item of Array.isArray(data) ? data : [data]) result.push({json:(famulorV3Api.isRecord(item)?item:{value:item??null}) as IDataObject,pairedItem:{item:index}});
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Famulor operation failed.';
        if (this.continueOnFail()) result.push({json:{error:message},pairedItem:{item:index}});
        else throw new NodeOperationError(this.getNode(),message,{itemIndex:index});
      }
    }
    return [result];
  }
}
