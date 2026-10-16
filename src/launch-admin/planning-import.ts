export interface PlanningPerson {
  name: string; event_status: string; rsvp_date: string; invited_by: string; plus_one_of: string;
}
/** RFC 4180 quoting, including commas, escaped quotes, blank cells and newlines. */
export function parsePlanningImport(text: string): PlanningPerson[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') { if (quoted && text[i+1]==='"') { cell+='"'; i++; } else quoted=!quoted; }
    else if (c===',' && !quoted) { row.push(cell.trim()); cell=''; }
    else if ((c==='\n'||c==='\r') && !quoted) { if(c==='\r'&&text[i+1]==='\n')i++; row.push(cell.trim()); if(row.some(Boolean))rows.push(row);row=[];cell=''; }
    else cell+=c;
  }
  if (quoted) throw Error('The CSV contains an unfinished quoted field.');
  row.push(cell.trim()); if(row.some(Boolean))rows.push(row);
  const header=rows.shift()?.map(x=>x.toLowerCase());
  if (!header?.includes('name')) throw Error('Use a CSV with a Name column. Phone numbers can be added later.');
  if (!rows.length || rows.length>500) throw Error('Import 1–500 people at a time.');
  return rows.map((r,i)=>{
    const get=(key:string)=>r[header.indexOf(key)]||'';
    if(!get('name')||get('name').length>160)throw Error(`Row ${i+2} needs a name of up to 160 characters.`);
    return {name:get('name'),event_status:get('status'),rsvp_date:get('rsvp date'),invited_by:get('invited by'),plus_one_of:get('is plus one of')};
  });
}
