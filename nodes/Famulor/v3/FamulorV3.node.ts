import { randomUUID } from 'node:crypto';
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
        if (operation.body?.multipart) {
          const boundary = `famulor-${randomUUID()}`;
          const fields = famulorV3Api.isRecord(request.body) ? request.body : {};
          const chunks: Buffer[] = [];
          for (const [name,value] of Object.entries(fields)) {
            if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new NodeOperationError(this.getNode(),'Invalid upload field.');
            const field = operation.body.fields?.find(field=>field.name===name);
            if (field?.format === 'binary') {
              const key=String(value); const file=items[index].binary?.[key];
              if (!file) throw new NodeOperationError(this.getNode(),`Input binary field ${key} is missing.`);
              const bytes=await this.helpers.getBinaryDataBuffer(index,key);
              if (bytes.length>200_000) throw new NodeOperationError(this.getNode(),'The company image must not exceed 200,000 bytes.');
              const filename=(file.fileName??'image').replace(/[\r\n"\\]/g,'_');
              const mime=file.mimeType;
              if (!['image/png','image/jpeg'].includes(mime)) throw new NodeOperationError(this.getNode(),'Use a PNG or JPEG company image.');
              chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from('\r\n'));
            } else chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${typeof value==='object'?JSON.stringify(value):String(value)}\r\n`));
          }
          chunks.push(Buffer.from(`--${boundary}--\r\n`));
          const bytes=Buffer.concat(chunks);
          if (bytes.length>300_000) throw new NodeOperationError(this.getNode(),'The company image upload is too large.');
          request.body=bytes; request.headers['Content-Type']=`multipart/form-data; boundary=${boundary}`;
        }
        const response = await famulorV3Api.request(this,{...request,method: operation.method as 'GET'|'POST'|'PATCH'|'PUT'|'DELETE',binary:operation.binary,multipart:operation.body?.multipart});
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
