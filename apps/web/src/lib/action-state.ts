/** Estado devuelto por las Server Actions de formularios (useActionState). */
export interface ActionState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valores enviados, para no perder lo escrito si hay errores. */
  values?: Record<string, string>;
}

export const IDLE: ActionState = { status: 'idle' };

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && !key.startsWith('$ACTION')) values[key] = value;
  }
  return values;
}
