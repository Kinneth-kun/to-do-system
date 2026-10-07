'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import type { FormState } from '@/lib/validation';
import { cx } from '../ui';

/*
 * Forms backed by Server Actions. <ActionForm> runs the action through useActionState and shares
 * the result with the fields inside it, which show their validation error and keep what was
 * typed — Laravel's @error and old().
 *
 * Submissions go through a transition rather than <form action>: React resets a form after a
 * form-action submission, which wipes what the person typed on a validation error and puts
 * controlled selects out of sync with their state. Forms that should clear after a successful
 * save opt in with `resetOnSuccess`.
 */

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const FormStateContext = createContext<{ state: FormState; pending: boolean }>({ state: null, pending: false });
export const useFormResult = () => useContext(FormStateContext).state;
export const useFormPending = () => useContext(FormStateContext).pending;

/** Submit a form's data to a dispatcher inside a transition (no automatic form reset). */
export function submitInTransition(event: FormEvent<HTMLFormElement>, dispatch: (data: FormData) => void) {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
}

export function ActionForm({
    action,
    children,
    className,
    resetOnSuccess = false,
    ...props
}: { action: Action; children: ReactNode; resetOnSuccess?: boolean } & Omit<ComponentProps<'form'>, 'action' | 'children' | 'onSubmit'>) {
    const [state, dispatch, pending] = useActionState(action, null);
    const form = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (resetOnSuccess && state?.ok) form.current?.reset();
    }, [state, resetOnSuccess]);

    return (
        <FormStateContext.Provider value={{ state, pending }}>
            <form ref={form} className={className} {...props} onSubmit={(event) => submitInTransition(event, dispatch)}>
                {state?.message && !state.errors && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p>}
                {children}
            </form>
        </FormStateContext.Provider>
    );
}

/** The field's validation error, if the last submission failed. */
export function useFieldError(name: string): string | undefined {
    return useFormResult()?.errors?.[name];
}

/** What was submitted for this field on the last (failed) attempt, else the default. */
export function useOld<T extends string | string[] | null | undefined>(name: string, fallback: T): string | string[] | T {
    const values = useFormResult()?.values;
    return values && name in values ? values[name] : fallback;
}

export function Field({ label, name, help, required, htmlFor, className, children }: { label?: string; name?: string; help?: ReactNode; required?: boolean; htmlFor?: string; className?: string; children: ReactNode }) {
    const error = useFieldError(name ?? '');
    return (
        <div className={className}>
            {label && (
                <label htmlFor={htmlFor ?? name} className="form-label">
                    {label} {required && <span className="text-red-500">*</span>}
                </label>
            )}
            {children}
            {help && <p className="form-help">{help}</p>}
            {name && error && <p className="form-error">{error}</p>}
        </div>
    );
}

type InputProps = { name: string; label?: string; help?: ReactNode; wrapperClassName?: string } & Omit<ComponentProps<'input'>, 'name'>;

export function Input({ name, label, help, wrapperClassName, className, defaultValue, type = 'text', required, id, ...props }: InputProps) {
    const error = useFieldError(name);
    const old = useOld(name, defaultValue == null ? '' : String(defaultValue));
    return (
        <Field label={label} name={name} help={help} required={required} htmlFor={id ?? name} className={wrapperClassName}>
            <input
                id={id ?? name}
                name={name}
                type={type}
                required={required}
                defaultValue={type === 'password' ? undefined : (old as string)}
                className={cx('form-input', error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', className)}
                {...props}
            />
        </Field>
    );
}

type Option = { value: string | number; label: string };

export function Select({
    name,
    label,
    options,
    placeholder,
    help,
    wrapperClassName,
    className,
    defaultValue,
    required,
    id,
    ...props
}: { name: string; label?: string; options: Option[]; placeholder?: string; help?: ReactNode; wrapperClassName?: string } & Omit<ComponentProps<'select'>, 'name'>) {
    const error = useFieldError(name);
    const old = useOld(name, defaultValue == null ? '' : String(defaultValue));
    return (
        <Field label={label} name={name} help={help} required={required} htmlFor={id ?? name} className={wrapperClassName}>
            <select id={id ?? name} name={name} required={required} defaultValue={old as string} className={cx('form-select', error && 'border-red-400', className)} {...props}>
                {placeholder !== undefined && <option value="">{placeholder}</option>}
                {options.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                        {o.label}
                    </option>
                ))}
            </select>
        </Field>
    );
}

export function Textarea({
    name,
    label,
    help,
    wrapperClassName,
    className,
    defaultValue,
    required,
    rows = 3,
    id,
    ...props
}: { name: string; label?: string; help?: ReactNode; wrapperClassName?: string } & Omit<ComponentProps<'textarea'>, 'name'>) {
    const error = useFieldError(name);
    const old = useOld(name, defaultValue == null ? '' : String(defaultValue));
    return (
        <Field label={label} name={name} help={help} required={required} htmlFor={id ?? name} className={wrapperClassName}>
            <textarea id={id ?? name} name={name} rows={rows} required={required} defaultValue={old as string} className={cx('form-input', error && 'border-red-400', className)} {...props} />
        </Field>
    );
}

export function SubmitButton({ children, className = 'btn-primary', pendingText, ...props }: { children: ReactNode; className?: string; pendingText?: string } & ComponentProps<'button'>) {
    const pending = useFormPending();
    return (
        <button type="submit" className={className} disabled={pending || props.disabled} {...props}>
            {pending && pendingText ? pendingText : children}
        </button>
    );
}

/** A form-level error that is not tied to one field (e.g. "You cannot change your own role"). */
export function FormError({ name = '_form' }: { name?: string }) {
    const error = useFieldError(name);
    return error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null;
}
