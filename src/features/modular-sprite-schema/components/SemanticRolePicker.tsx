import { useMemo } from 'react';

import { schemaCatalog } from '../application/schemaCatalog.js';
import { localSchemaApi } from '../infrastructure/browser/localSchemaApi.js';
export function SemanticRolePicker({ role, semanticRoleId, onChange }: { role: string; semanticRoleId?: string; onChange: (value: { role: string; semanticRoleId?: string }) => void }): React.ReactElement {
  const definitions = useMemo(()=>schemaCatalog.semantics.list('part-role'),[role,semanticRoleId]); const selected=definitions.find(item=>item.id===semanticRoleId||item.key===role);
  const persistCustom=():void=>{const key=role.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!key||selected)return;const definition={id:`user.part-role.${key}`,revision:1 as const,kind:'part-role' as const,key,label:role.trim(),aliases:[],origin:'user' as const};schemaCatalog.semantics.upsert(definition);void localSchemaApi.saveSemantic(definition);onChange({role:key,semanticRoleId:definition.id});};
  return <div className="grid gap-1"><select className="h-10 rounded-md border bg-background px-2" value={selected?.id??'custom-value'} onChange={event=>{const definition=definitions.find(item=>item.id===event.target.value);if(definition)onChange({role:definition.key,semanticRoleId:definition.id});else onChange({role});}}>{definitions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}<option value="custom-value">Custom…</option></select>{!selected&&<input className="h-9 rounded-md border bg-background px-2" aria-label="Custom semantic role" value={role} onChange={event=>onChange({role:event.target.value})} onBlur={persistCustom}/>}</div>;
}
