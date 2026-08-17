"use client";
import { useState,useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deleteDocumentAction } from "@/actions/documents";
export function DocumentDeleteAction({companyId,documentId,fileName}:{companyId:string;documentId:string;fileName:string}){const[open,setOpen]=useState(false);const[pending,startTransition]=useTransition();const{toast}=useToast();function confirm(){startTransition(async()=>{const r=await deleteDocumentAction(companyId,documentId);if(r.ok){setOpen(false);toast("Document deleted.","success");}else toast(r.error,"error");});}return <><Button type="button" variant="ghost" size="icon" onClick={()=>setOpen(true)} disabled={pending} aria-label={`Delete ${fileName}`}><Trash2 className="h-4 w-4"/></Button><Dialog open={open} onOpenChange={setOpen} title="Delete this document?" description={`“${fileName}” will be permanently removed from storage and its metadata will be deleted. This action cannot be undone.`} footer={<><Button type="button" variant="ghost" onClick={()=>setOpen(false)} disabled={pending}>Cancel</Button><Button type="button" variant="destructive" onClick={confirm} disabled={pending}>{pending?"Deleting…":"Delete document"}</Button></>}/></>}
