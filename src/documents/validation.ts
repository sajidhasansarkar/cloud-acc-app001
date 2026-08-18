import { DOCUMENT_FILE_TYPES, DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE, getDocumentFileType, type DocumentFileType } from "@/documents/config";
export type DocumentValidationResult = {ok:true;fileType:DocumentFileType;mimeType:string}|{ok:false;error:string};
function magic(b:Uint8Array,t:DocumentFileType){
  const sw=(a:number[])=>a.every((v,i)=>b[i]===v);
  if(t==="PDF")return sw([37,80,68,70]);
  if(t==="JPG"||t==="JPEG")return sw([255,216,255]);
  if(t==="PNG")return sw([137,80,78,71,13,10,26,10]);
  if(t==="WEBP")return sw([82,73,70,70])&&b.length>=12&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
  if(t==="XLSX"||t==="DOCX")return sw([80,75,3,4])||sw([80,75,5,6]);
  if(t==="XLS")return sw([208,207,17,224,161,177,26,225]);
  if(t==="DOC")return sw([208,207,17,224,161,177,26,225]);
  if(t==="TIFF")return sw([73,73,42,0])||sw([77,77,0,42]);
  return true;
}
function csvLike(b:Uint8Array){ const s=new TextDecoder("utf-8").decode(b.slice(0,8192)); return !!s.trim()&&!s.includes("\0")&&(s.includes(",")||s.includes("\t")||s.includes(";")||/\r?\n/.test(s)); }
export async function validateDocumentFile(file:File):Promise<DocumentValidationResult>{
  if(!(file instanceof File)||!file.name?.trim())return{ok:false,error:"File is required."};
  if(!Number.isFinite(file.size)||file.size<=0)return{ok:false,error:"File is empty or invalid."};
  if(file.size>MAX_DOCUMENT_SIZE)return{ok:false,error:`File is too large. Maximum size is ${Math.round(MAX_DOCUMENT_SIZE/1048576)} MB.`};
  const type=getDocumentFileType(file.name); if(!type||!DOCUMENT_FILE_TYPES.includes(type))return{ok:false,error:"Unsupported file type."};
  const mime=(file.type||"application/octet-stream").toLowerCase(); if(!DOCUMENT_MIME_TYPES[type].includes(mime))return{ok:false,error:"Unsupported file type or MIME type."};
  const bytes=new Uint8Array(await file.slice(0,8192).arrayBuffer());
  if(type==="CSV"?!csvLike(bytes):!magic(bytes,type))return{ok:false,error:"File content does not match its declared type."};
  return{ok:true,fileType:type,mimeType:mime};
}
