// Supabase-shaped adapter for isolated tests. Business RPCs execute the real SQL.
export function edgeDb(db){return {
  async rpc(name,args={}){
    if(!/^[a-z_]+$/.test(name)||Object.keys(args).some(key=>!/^p_[a-z_]+$/.test(key)))throw Error('Invalid test RPC');
    try{const keys=Object.keys(args),values=Object.values(args);const result=await db.query(`select public.${name}(${keys.map((key,index)=>key+'=> $'+(index+1)).join(',')}) as data`,values);return {data:result.rows[0].data,error:null};}catch(error){return {data:null,error:{code:error.code}};}
  },
  from(table){
    if(!/^[a-z_]+$/.test(table))throw Error('Invalid test table');let fields='*',values=null;const filters=[],nulls=[];
    const run=async single=>{try{const params=filters.map(([,value])=>value),predicates=[...filters.map(([key],i)=>key+'=$'+(i+1)),...nulls.map(key=>key+' is null')],where=predicates.length?' where '+predicates.join(' and '):'';let sql;
      if(values){const keys=Object.keys(values);sql='update public.'+table+' set '+keys.map((key,i)=>key+'=$'+(params.length+i+1)).join(',')+where+' returning '+fields;params.push(...Object.values(values));}
      else sql='select '+fields+' from public.'+table+where;
      const result=await db.query(sql,params);return {data:single?result.rows[0]||null:result.rows,error:null};}catch(error){return {data:null,error:{code:error.code}};}};
    const query={select(value='*'){fields=value;return this;},is(key,value){if(!/^[a-z_]+$/.test(key)||value!==null)throw Error('Invalid null filter');nulls.push(key);return this;},eq(key,value){if(!/^[a-z_]+$/.test(key))throw Error('Invalid column');filters.push([key,value]);return this;},update(value){values=value;return this;},order(){return this;},limit(){return this;},maybeSingle:()=>run(true),single:()=>run(true),then(resolve,reject){return run(false).then(resolve,reject);}};return query;
  },functions:{invoke:async()=>({data:{ok:true}})}
};}
