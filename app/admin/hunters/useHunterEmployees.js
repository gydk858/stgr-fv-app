'use client'
import {useState,useEffect,useRef} from 'react'
export default function useHunterEmployees(api){
 const [actor,setActor]=useState(''),[employees,setEmployees]=useState([]),[employeeLoading,setEmployeeLoading]=useState(true),[employeeError,setEmployeeError]=useState('')
 const refreshEmployees=useRef(()=>{})
 useEffect(()=>{
  let active=true,inFlight=false,first=true
  async function refresh(){
   if(!active||inFlight||document.visibilityState==='hidden')return
   inFlight=true
   try{
    const d=await api('?employees=1');if(!active)return
    setEmployees(d.employees);setEmployeeError('')
    // 受付担当は画面を開くたびに空から選ぶ（前回の担当者を自動で入れない。2026-11-20）
    setActor(prev=>d.employees.some(e=>e.id===prev)?prev:'')
   }catch(e){if(active)setEmployeeError('従業員一覧を取得できませんでした。自動で再試行します。')}
   finally{inFlight=false;if(active){setEmployeeLoading(false);first=false}}
  }
  refreshEmployees.current=refresh;void refresh()
  const timer=setInterval(refresh,30000)
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);refreshEmployees.current=()=>{}}
 },[])
 return {actor,setActor,employees,employeeLoading,employeeError,refreshEmployees}
}
