import { NodeConnectionTypes } from '../connections';
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { operations } from './generated/catalog';
import { isLegacyTopLevelField, nativeProperties, operationProperties } from './properties';
import { famulorV3Api } from './client';
import { resourceSearchMethods } from './resources';

export class FamulorV3 implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Famulor', name: 'famulor', icon: {light:'file:famulor.svg',dark:'file:famulor-dark.svg'}, group: ['transform'], version: 3,
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
          if (property.name !== 'optionalFields') {
            const value = this.getNodeParameter(property.name,index,property.default);
            if (isLegacyTopLevelField(operation,property.name) && value === '') continue;
            values[property.name] = value;
          }
        }
        const request = famulorV3Api.buildRequest({operation,values,node:this.getNode()});
        const response = await famulorV3Api.request(this,{...request,method: operation.method as 'GET'|'POST'|'PATCH'|'PUT'|'DELETE',binary:operation.binary});
        if (operation.binary) {
          if (!famulorV3Api.isRecord(response) || !Buffer.isBuffer(response.body)) throw new NodeOperationError(this.getNode(),'Famulor returned invalid file data.');
          const headers=famulorV3Api.isRecord(response.headers)?response.headers:{};
          const contentType=Object.entries(headers).find(([key])=>key.toLowerCase()==='content-type')?.[1];
          const candidate=typeof contentType==='string'?contentType.split(';')[0].trim().toLowerCase():'';
          const known=['audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/webm','audio/flac','video/webm','video/mp4'];
          const mime=known.includes(candidate)?candidate:operation.binaryContentType??'application/octet-stream';
          const extension=({ 'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg','audio/webm':'webm','audio/flac':'flac','video/webm':'webm','video/mp4':'mp4' } as Record<string,string>)[mime]??'bin';
          result.push({json:{operation:id},binary:{data:await this.helpers.prepareBinaryData(response.body,`${mime.startsWith('video/')?'video':'audio'}.${extension}`,mime)},pairedItem:{item:index}});
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
