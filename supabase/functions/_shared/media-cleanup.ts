export interface Deletion { bucket_id:string; name:string; attempts:number }
export async function drainMediaObjects(rows: Deletion[], actions: {
  remove(row:Deletion):Promise<string|null>;
  acknowledge(row:Deletion):Promise<boolean>;
  retry(row:Deletion,error:string):Promise<void>;
}) {
  let failed=0
  for(const row of rows) {
    const error=await actions.remove(row)
    if(error) { failed++;await actions.retry(row,error) }
    else if(!await actions.acknowledge(row))failed++
  }
  return {processed:rows.length,failed}
}
