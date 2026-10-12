import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";

export function ArgumentFields({ value, onChange, disabled = false }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
 const fieldset = useRef<HTMLFieldSetElement>(null);
 const focusAdded = useRef(false);
 useEffect(() => { if (focusAdded.current) { focusAdded.current = false; fieldset.current?.querySelector<HTMLInputElement>('.argument-row:last-of-type input')?.focus(); } }, [value.length]);
 return <fieldset className="argument-fields" ref={fieldset} disabled={disabled}>
  <legend>Arguments</legend>
  <p>Each field is passed as one argument.</p>
  {value.map((argument, index) => <div className="argument-row" key={index}>
   <input aria-label={`Argument ${index + 1}`} value={argument} maxLength={10000} onChange={event => onChange(value.map((current, position) => position === index ? event.target.value : current))} />
   <button type="button" aria-label={`Remove argument ${index + 1}`} title="Remove argument" onClick={() => onChange(value.filter((_, position) => position !== index))}><X size={16} /></button>
  </div>)}
  <button className="add-argument" type="button" disabled={value.length >= 100} onClick={() => { focusAdded.current = true; onChange([...value, ""]); }}><Plus size={14} /> Add argument</button>
 </fieldset>;
}
