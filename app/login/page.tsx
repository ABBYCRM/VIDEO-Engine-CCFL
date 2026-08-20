"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
export default function Login(){const [password,setPassword]=useState("");const [error,setError]=useState("");const router=useRouter();async function submit(e:FormEvent){e.preventDefault();const r=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password})});if(r.ok)router.replace("/");else setError("Invalid password")};return <main className="grid min-h-screen place-items-center px-4"><Card className="w-full max-w-sm p-7"><div className="mb-6 grid place-items-center"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><Clapperboard/></div><h1 className="mt-4 text-2xl font-semibold">VIDEO-Engine</h1><p className="mt-1 text-sm text-slate-500">Admin console</p></div><form onSubmit={submit} className="grid gap-3"><div className="relative"><Lock className="absolute left-3 top-3.5 text-slate-500" size={16}/><Input className="pl-9" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Admin password" autoFocus/></div>{error&&<div className="text-sm text-red-400">{error}</div>}<Button type="submit">Sign in</Button></form></Card></main>}
